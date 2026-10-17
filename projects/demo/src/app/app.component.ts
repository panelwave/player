import { Component, OnDestroy, OnInit, inject, viewChild } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import {
  FlowEngineService,
  ManifestService,
  PlayerShellComponent,
  PlayerStateService,
  PreloadService,
  VariableStoreService,
  locationUrl,
  parseLocationSearch,
} from 'player';
import { DevToolsComponent, type DevToolsEvent } from './dev-tools/dev-tools.component';
import type { Chapter, EntitlementSnapshot, PanelWaveManifest, PlayerLocation, PlayerPanelChangeEvent } from 'player';
import { snapshotFromEntitlements } from './entitlements';
import {
  EMBED_ERROR_LIMIT,
  EMBED_HISTORY_LIMIT,
  EMBED_PROTOCOL_VERSION,
  hostOriginFromSearch,
  isEmbedInboundMessage,
  manifestFingerprint,
  pickLocalized,
  sameVariableValue,
  type EmbedConfigData,
  type EmbedInboundMessage,
  type EmbedOptions,
  type EmbedOutboundMessage,
  type EmbedStateSnapshot,
} from './embed-bridge';

/** `pw:state` is posted at most once per this many ms after a change. */
const STATE_DEBOUNCE_MS = 100;

@Component({
    selector: 'app-root',
    imports: [RouterOutlet, PlayerShellComponent, DevToolsComponent],
    templateUrl: './app.component.html',
    styleUrl: './app.component.scss'
})
export class AppComponent implements OnInit, OnDestroy {
  title = 'PanelWave Player Demo';
  manifest: PanelWaveManifest | null = null;
  loading = true;
  error: string | null = null;

  /**
   * Embed mode: driven by a host page via postMessage (the CMS preview
   * embeds this app at /player/index.html and posts config into the
   * iframe — see docs/EMBED_PROTOCOL.md). Hides the demo chrome and waits
   * for config instead of loading a bundled sample.
   */
  embedMode = false;
  locale = 'en-US';
  autoplay = false;
  viewModeOverride: 'auto' | 'panel' | 'canvas' = 'auto';

  /** Shell inputs the embed config / `setOptions` drive (defaults = the shell's). */
  pageFormat = 'auto';
  secondsPerPanel = 5;
  showCover = true;
  reducedMotion = false;
  /** Host's `muted`: applied through the shell's master audio toggle once it is ready. */
  muted?: boolean;

  /** View to open in (`?view=panel|page` or the embed config's `initialViewMode`); default: the shell's. */
  initialViewMode?: 'page' | 'panel';

  /** Position a shared link opens (`?page=` / `?panel=`), as in the reader. */
  readonly start = parseLocationSearch(window.location.search);

  /** Panel to open at: the embed config's `initialPanelId`, else `?panel=`. */
  initialPanelId?: string = this.start.panelId;

  /**
   * Dev/testing hook: `?deny=<panelId>[,<panelId>…]` installs an
   * entitlement adapter that denies access to the listed panels, so the
   * shell's gating path (navigation blocked, error state) can be
   * exercised without a real entitlement backend — used by the E2E suite.
   */
  entitlementAdapter?: {
    hasAccess(panelId: string): Promise<boolean>;
    getContext(): Promise<Record<string, unknown>>;
  };

  /**
   * What the simulated reader owns, passed to the shell's
   * `entitlementSnapshot`. Sources: the embed host's config `entitlements`
   * (the CMS preview's entitlement simulator), or `?entitlements=` in the
   * same comma-separated syntax. Undefined = the shell's anonymous reader.
   */
  entitlementSnapshot?: EntitlementSnapshot;

  /** The host's entitlement tokens as last given (echoed in `pw:state`). */
  entitlementTokens: string[] | null = null;

  /**
   * Initial variable values passed to the shell (seeded privileged at
   * init, so manifest-declared read-only variables can be populated).
   * Sources: the embed host's config message, or the dev/testing hook
   * `?vars=<url-encoded JSON>` — e.g. ?vars={"user.age":12}.
   */
  initialVariables?: Record<string, unknown>;

  /**
   * Dev/testing hook: `?byUrl=1` hands the shell the manifest URL
   * (`manifestUrl` input) instead of the parsed object, exercising the
   * shell's own loading path.
   */
  shellManifestUrl?: string;

  /**
   * Origin the embed bridge talks to and accepts messages from:
   * `?origin=<host origin>`, else this app's own origin (same-origin embed,
   * which is how the CMS serves `/player/`). Never `'*'`.
   */
  readonly hostOrigin = hostOriginFromSearch(window.location.search, window.location.origin);

  /** The running shell (undefined while no manifest is loaded). */
  readonly shell = viewChild(PlayerShellComponent);

  /** Fingerprint of the manifest the shell runs; a config with another one restarts. */
  private manifestKey: string | null = null;
  /** Manifest of the last config, for `restart` without a new manifest. */
  private lastManifest: PanelWaveManifest | null = null;
  /** Variables of the last config, diffed on a no-restart config. */
  private lastVariables: Record<string, unknown> = {};
  /** Errors since the last (re)start, oldest first (capped). */
  private bridgeErrors: string[] = [];
  private stateTimer: number | null = null;
  private loadStartedAt: number | null = null;

  private readonly playerState = inject(PlayerStateService);
  private readonly variableStore = inject(VariableStoreService);
  private readonly flowEngine = inject(FlowEngineService);
  private readonly manifestService = inject(ManifestService);
  private readonly preloadService = inject(PreloadService);

  private readonly onEmbedMessage = (event: MessageEvent): void => {
    if (event.origin !== this.hostOrigin) {
      return;
    }
    const message = event.data;
    if (!isEmbedInboundMessage(message)) {
      return;
    }
    this.embedMode = true;
    this.handleEmbedMessage(message);
  };

  /** Available demo manifests (the player is re-created on switch). */
  readonly demos = [
    { id: 'sample', label: 'Sample Comic', url: 'assets/sample-manifest.json' },
    {
      id: 'video-sequencing',
      label: 'Video Sequencing',
      url: 'assets/video-sequencing-manifest.json',
    },
    {
      id: 'canvas',
      label: 'Infinite Canvas',
      url: 'assets/canvas-manifest.json',
    },
  ];

  activeDemo = 'sample';

  /** Responsive preview frames (CSS px). 'fill' = the whole window. */
  readonly devices = [
    { id: 'fill', label: 'Fill window', width: 0, height: 0 },
    { id: 'phone', label: 'Phone (390 × 844)', width: 390, height: 844 },
    { id: 'phone-landscape', label: 'Phone landscape (844 × 390)', width: 844, height: 390 },
    { id: 'tablet', label: 'Tablet (820 × 1180)', width: 820, height: 1180 },
    { id: 'desktop', label: 'Desktop (1440 × 900)', width: 1440, height: 900 },
  ];
  device = 'fill';

  /** Dev tools drawer state (`?devtools=1` opens it on load). */
  devToolsOpen = false;
  debugOverlay = false;
  events: DevToolsEvent[] = [];
  panelChanges = 0;
  loadMs: number | null = null;
  private static readonly MAX_EVENTS = 200;

  get frameWidth(): string | null {
    const d = this.devices.find((x) => x.id === this.device);
    return d && d.width ? d.width + 'px' : null;
  }

  get frameHeight(): string | null {
    const d = this.devices.find((x) => x.id === this.device);
    return d && d.height ? d.height + 'px' : null;
  }

  private readonly http = inject(HttpClient);

  ngOnInit() {
    window.addEventListener('message', this.onEmbedMessage);

    const params = new URLSearchParams(window.location.search);
    this.devToolsOpen = params.get('devtools') === '1';
    const view = params.get('view');
    if (view === 'panel' || view === 'page') {
      this.initialViewMode = view;
    }
    const device = params.get('device');
    if (device && this.devices.some((d) => d.id === device)) {
      this.device = device;
    }

    const vars = params.get('vars');
    if (vars) {
      try {
        const parsed = JSON.parse(vars);
        if (parsed && typeof parsed === 'object') {
          this.initialVariables = parsed;
        }
      } catch {
        console.warn('Ignoring invalid ?vars= JSON');
      }
    }

    const entitlements = params.get('entitlements');
    if (entitlements !== null) {
      this.entitlementSnapshot = snapshotFromEntitlements(entitlements);
    }

    const deny = params.get('deny');
    if (deny) {
      const denied = new Set(deny.split(','));
      this.entitlementAdapter = {
        hasAccess: (panelId: string) => Promise.resolve(!denied.has(panelId)),
        getContext: () => Promise.resolve({}),
      };
    }

    // Embed mode without an explicit manifest: wait for the host's config
    // message instead of flashing the bundled sample.
    if (params.get('embed') === '1' || this.isFramed()) {
      this.embedMode = true;
      this.loading = false;
      this.postToHost({ type: 'pw:hello', protocol: EMBED_PROTOCOL_VERSION });
      return;
    }

    // Load an arbitrary manifest via ?manifest=<url> — e.g. a CMS preview link
    // (http://localhost:4200/api/preview/<token>/manifest). Falls back to the
    // bundled sample. The manifest endpoint sends Access-Control-Allow-Origin: *
    // so this works cross-origin (run the demo on a free port, e.g. --port 4300,
    // while the CMS frontend keeps :4200 for its /api proxy).
    const manifestUrl = params.get('manifest') || 'assets/sample-manifest.json';
    if (params.get('byUrl') === '1') {
      this.shellManifestUrl = manifestUrl;
    }
    this.loadManifest(manifestUrl);
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.onEmbedMessage);
    if (this.stateTimer !== null) {
      window.clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
  }

  /** Running inside an iframe (the CMS preview embed). Separate for tests. */
  protected isFramed(): boolean {
    return window.self !== window.top;
  }

  /** The host window the bridge posts to (null when not framed). Separate for tests. */
  protected hostWindow(): Window | null {
    return window.parent && window.parent !== window ? window.parent : null;
  }

  // ── Embed bridge (protocol v1) ─────────────────────────────────────────

  private handleEmbedMessage(message: EmbedInboundMessage): void {
    switch (message.type) {
      case 'config':
        if (message.data && typeof message.data === 'object') {
          this.handleConfig(message.data);
        }
        break;
      case 'navigate':
        if (typeof message.panelId === 'string') {
          void this.navigateToPanel(message.panelId);
        }
        break;
      case 'setVariable':
        if (typeof message.key === 'string') {
          this.setVariableLive(message.key, message.value);
        }
        break;
      case 'setLocale':
        if (typeof message.locale === 'string') {
          this.setLocaleLive(message.locale);
        }
        break;
      case 'setEntitlements':
        this.setEntitlementsLive(message.entitlements);
        this.scheduleState();
        break;
      case 'setOptions':
        if (message.data && typeof message.data === 'object') {
          this.applyOptions(message.data);
          this.scheduleState();
        }
        break;
      case 'getState':
        this.postState();
        break;
      case 'restart':
        this.restart();
        break;
    }
  }

  /**
   * `config`: the shell is (re)created on the first manifest, on
   * `restart: true` and when the manifest changed; otherwise locale,
   * entitlements, options and variables are applied to the running story.
   */
  private handleConfig(data: EmbedConfigData): void {
    this.error = null;
    const manifest = data.manifest ?? this.lastManifest;
    const key = data.manifest ? manifestFingerprint(data.manifest) : this.manifestKey;
    const recreate = !!manifest && (!this.manifest || data.restart === true || key !== this.manifestKey);

    if ('locale' in data) {
      this.locale = typeof data.locale === 'string' ? data.locale : 'en-US';
    }
    this.setEntitlementsLive(data.entitlements);
    this.applyOptions(data, recreate);
    if (typeof data.initialPanelId === 'string') {
      this.initialPanelId = data.initialPanelId;
    }
    if (data.initialViewMode === 'page' || data.initialViewMode === 'panel') {
      this.initialViewMode = data.initialViewMode;
    }

    const variables = data.variables && typeof data.variables === 'object' ? data.variables : undefined;
    if (recreate) {
      this.initialVariables = variables;
      this.lastVariables = variables ?? {};
      this.lastManifest = manifest;
      this.manifestKey = key;
      this.createShell(manifest as PanelWaveManifest);
      return;
    }
    if (!this.manifest) {
      // No work yet (a config without a manifest): remember the seed for the first load.
      this.initialVariables = variables;
      this.lastVariables = variables ?? {};
    } else if (variables) {
      this.applyVariablesLive(variables);
    }
    if (!recreate && this.shell()) {
      // A re-posted locale is applied even when the reader switched in between.
      if ('locale' in data) {
        this.setLocaleLive(this.locale);
      }
      this.scheduleState();
    }
  }

  /** Destroy and re-create the shell so the work initializes cleanly. */
  private createShell(manifest: PanelWaveManifest): void {
    this.manifest = null;
    this.loading = false;
    this.resetMetrics();
    this.bridgeErrors = [];
    this.loadStartedAt = performance.now();
    setTimeout(() => {
      this.manifest = manifest;
    });
  }

  /** `restart`: the same work from the start, with the current config. */
  private restart(): void {
    if (!this.lastManifest) {
      return;
    }
    this.error = null;
    this.initialVariables = Object.keys(this.lastVariables).length ? { ...this.lastVariables } : undefined;
    this.createShell(this.lastManifest);
  }

  /**
   * Shell inputs the host can change live. `showCover` is read by the shell
   * at (re)start; `false` additionally drops a cover that is showing.
   */
  private applyOptions(options: EmbedOptions, starting = false): void {
    if ('autoplay' in options) {
      this.autoplay = options.autoplay === true;
    }
    if ('viewMode' in options) {
      this.viewModeOverride =
        options.viewMode === 'panel' || options.viewMode === 'canvas' ? options.viewMode : 'auto';
    }
    if ('pageFormat' in options) {
      this.pageFormat = typeof options.pageFormat === 'string' && options.pageFormat ? options.pageFormat : 'auto';
    }
    if ('secondsPerPanel' in options) {
      const seconds = Number(options.secondsPerPanel);
      this.secondsPerPanel = Number.isFinite(seconds) && seconds > 0 ? seconds : 5;
    }
    if ('reducedMotion' in options) {
      this.reducedMotion = options.reducedMotion === true;
    }
    if ('showCover' in options) {
      this.showCover = options.showCover !== false;
      const shell = this.shell();
      if (!starting && !this.showCover && shell?.coverVisible) {
        shell.hideCover();
      }
    }
    if ('muted' in options) {
      this.muted = typeof options.muted === 'boolean' ? options.muted : undefined;
      if (!starting) {
        this.applyMuted();
      }
    }
  }

  /** The host's `muted` wins over the work default and the stored preference. */
  private applyMuted(): void {
    const shell = this.shell();
    if (shell && typeof this.muted === 'boolean') {
      shell.setAudioEnabled(!this.muted);
    }
  }

  private setEntitlementsLive(tokens: unknown): void {
    const snapshot = snapshotFromEntitlements(tokens);
    this.entitlementSnapshot = snapshot;
    this.entitlementTokens = snapshot
      ? typeof tokens === 'string'
        ? tokens.split(',').map((t) => t.trim()).filter(Boolean)
        : (tokens as string[]).filter((t): t is string => typeof t === 'string')
      : null;
  }

  private setLocaleLive(locale: string): void {
    this.locale = locale;
    // The input binding only fires on a changed value; the reader may have
    // switched locales in the player meanwhile, so tell the shell directly.
    this.shell()?.onLocaleChange(locale);
    this.scheduleState();
  }

  /** Live variable write — no restart, conditional content reacts at once. */
  private setVariableLive(key: string, value: unknown): void {
    const shell = this.shell();
    this.lastVariables = { ...this.lastVariables, [key]: value };
    if (!shell) {
      this.initialVariables = { ...(this.initialVariables ?? {}), [key]: value };
      return;
    }
    shell.seedVariable(key, value);
    this.scheduleState();
  }

  /** A re-posted `config.variables`: write what changed, reset what was removed to its default. */
  private applyVariablesLive(variables: Record<string, unknown>): void {
    const shell = this.shell();
    if (!shell) {
      return;
    }
    const previous = this.lastVariables;
    this.lastVariables = { ...variables };
    for (const [key, value] of Object.entries(variables)) {
      if (!(key in previous) || !sameVariableValue(previous[key], value)) {
        shell.seedVariable(key, value);
      }
    }
    for (const key of Object.keys(previous)) {
      if (key in variables) {
        continue;
      }
      const def = shell.variableDefinitions.find((d) => d.id === key);
      if (def && 'default' in def) {
        shell.seedVariable(key, def.default);
      }
    }
    this.scheduleState();
  }

  /** `navigate`: jump to any panel of the work (leaves the cover if it is showing). */
  private async navigateToPanel(panelId: string): Promise<void> {
    const shell = this.shell();
    if (!shell) {
      return;
    }
    const located = this.manifestService.getPanel(panelId);
    if (!located) {
      this.pushError(`navigate: unknown panel "${panelId}"`);
      this.scheduleState();
      return;
    }
    await shell.navigateToPanel(located.chapterId, panelId);
    if (shell.coverVisible) {
      shell.hideCover();
    }
    this.scheduleState();
  }

  private pushError(message: string): void {
    this.bridgeErrors = [...this.bridgeErrors, message].slice(-EMBED_ERROR_LIMIT);
  }

  /** Post the live state once, 100 ms after the last change. */
  private scheduleState(): void {
    if (!this.embedMode) {
      return;
    }
    if (this.stateTimer !== null) {
      window.clearTimeout(this.stateTimer);
    }
    this.stateTimer = window.setTimeout(() => {
      this.stateTimer = null;
      this.postState();
    }, STATE_DEBOUNCE_MS);
  }

  private postState(): void {
    this.postToHost({ type: 'pw:state', data: this.buildState() });
  }

  /** The live state snapshot (`pw:state`). */
  buildState(): EmbedStateSnapshot {
    const shell = this.shell();
    const chapter: Chapter | undefined = shell?.currentChapter;
    const chapterId = chapter?.id ?? null;
    const pageId = shell?.currentPage?.id ?? null;
    const panelId = shell?.getCurrentPanelId() ?? null;
    const locale = this.playerState.getLocale();
    const nextPanels =
      chapter?.graph && panelId
        ? this.flowEngine.getPossibleNextPanels(chapter.graph, panelId).map((id) => {
            const title = pickLocalized(this.manifestService.getPanel(id)?.panel.title, locale);
            return title ? { panelId: id, title } : { panelId: id };
          })
        : [];
    return {
      chapterId,
      pageId,
      panelId,
      viewMode: shell ? (shell.coverVisible ? 'cover' : shell.viewMode) : null,
      locale,
      entitlements: this.entitlementTokens,
      variables: this.variableStore.createContext(chapterId ?? undefined, pageId ?? undefined),
      history: (shell?.visitedPanelIds ?? []).slice(-EMBED_HISTORY_LIMIT),
      nextPanels,
      paywallGate: shell?.paywallVisible ? shell.paywallGate : null,
      preloadStatus: shell ? this.preloadService.getQueueStatus() : null,
      errors: [...this.bridgeErrors],
      loadTimeMs: this.loadMs,
    };
  }

  /** Forward a shell output to the host as `pw:event`. */
  emitToHost(name: string, data: unknown): void {
    if (!this.embedMode) {
      return;
    }
    this.postToHost({ type: 'pw:event', name, data });
  }

  private postToHost(message: EmbedOutboundMessage): void {
    const host = this.hostWindow();
    if (!host) {
      return;
    }
    try {
      host.postMessage(message, this.hostOrigin);
    } catch (e) {
      console.warn('Embed bridge: could not post to host', e);
    }
  }

  // ── Demo chrome ────────────────────────────────────────────────────────

  setDevice(id: string): void {
    if (this.devices.some((d) => d.id === id)) {
      this.device = id;
    }
  }

  toggleDevTools(): void {
    this.devToolsOpen = !this.devToolsOpen;
  }

  /** Load any manifest by URL (the manifest selector's free-form input). */
  loadFromUrl(event: Event, url: string): void {
    event.preventDefault();
    const trimmed = url.trim();
    if (!trimmed) {
      return;
    }
    this.activeDemo = '';
    this.manifest = null;
    this.loadManifest(trimmed);
  }

  /** Load a manifest from a local JSON file (no server round trip). */
  loadFromFile(event: Event): void {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file) {
      return;
    }
    const started = performance.now();
    this.loading = true;
    this.error = null;
    file.text().then(
      (text) => {
        try {
          const parsed = JSON.parse(text) as PanelWaveManifest;
          this.activeDemo = '';
          this.manifest = null;
          this.resetMetrics();
          this.loadMs = Math.round(performance.now() - started);
          setTimeout(() => {
            this.manifest = parsed;
            this.loading = false;
          });
          this.log('manifestLoaded', { source: file.name });
        } catch (e) {
          this.loading = false;
          this.error = `${file.name} is not valid JSON: ${e instanceof Error ? e.message : e}`;
        }
      },
      (e: unknown) => {
        this.loading = false;
        this.error = `Could not read ${file.name}: ${e instanceof Error ? e.message : e}`;
      }
    );
  }

  /** Append a shell event to the dev-tools log (newest first, capped). */
  log(type: string, payload: unknown): void {
    let detail: string;
    try {
      detail = typeof payload === 'string' ? payload : JSON.stringify(payload, (_k, v) => (typeof v === 'object' && v && 'layers' in v ? '[…]' : v));
    } catch {
      detail = String(payload);
    }
    if (detail && detail.length > 240) detail = detail.slice(0, 240) + '…';
    this.events = [{ at: Date.now(), type, detail }, ...this.events].slice(0, AppComponent.MAX_EVENTS);
  }

  private resetMetrics(): void {
    this.events = [];
    this.panelChanges = 0;
    this.loadMs = null;
  }

  /** Switch to another demo manifest (destroys and re-creates the player). */
  selectDemo(demoId: string) {
    const demo = this.demos.find((d) => d.id === demoId);
    if (!demo || this.activeDemo === demoId) {
      return;
    }
    this.activeDemo = demoId;
    this.manifest = null;
    this.loadManifest(demo.url);
  }

  private loadManifest(url: string) {
    this.loading = true;
    this.error = null;
    this.resetMetrics();
    const started = performance.now();
    this.http.get<PanelWaveManifest>(url)
      .subscribe({
        next: (manifest) => {
          this.manifest = manifest;
          this.loading = false;
          this.loadMs = Math.round(performance.now() - started);
          this.log('manifestLoaded', { source: url });
        },
        error: (err) => {
          this.error = `Failed to load manifest: ${err.message}`;
          this.loading = false;
          console.error('Error loading manifest:', err);
        }
      });
  }

  // ── Shell outputs ──────────────────────────────────────────────────────

  onPlayerReady() {
    this.log('ready', '');
    if (this.embedMode) {
      if (this.loadStartedAt !== null) {
        this.loadMs = Math.round(performance.now() - this.loadStartedAt);
        this.loadStartedAt = null;
      }
      this.applyMuted();
      this.postToHost({ type: 'pw:ready' });
      this.emitToHost('ready', {});
      this.scheduleState();
    }
  }

  /** The address bar follows the reading position, as in the reader. */
  onLocationChange(location: PlayerLocation): void {
    this.emitToHost('locationChange', location);
    this.scheduleState();
    if (this.embedMode) {
      return;
    }
    const next = locationUrl(window.location.href, location);
    if (next !== window.location.href) {
      window.history.replaceState(window.history.state, '', next);
    }
  }

  onPanelChange(event: PlayerPanelChangeEvent) {
    this.panelChanges++;
    this.log('panelChange', { panel: event.panelId, previous: event.previousPanelId ?? null, chapter: event.chapter.id });
    // Ids only: the panel and chapter objects carry every layer of the chapter.
    this.emitToHost('panelChange', {
      panelId: event.panelId,
      previousPanelId: event.previousPanelId ?? null,
      chapterId: event.chapter.id,
    });
    this.scheduleState();
  }

  onChapterChange(chapter: Chapter): void {
    this.log('chapterChange', { chapter: chapter.id });
    this.emitToHost('chapterChange', { chapterId: chapter.id, title: chapter.title ?? null });
    this.scheduleState();
  }

  /** Outputs with small, cloneable payloads: logged and forwarded as they are. */
  onShellEvent(name: string, data: unknown): void {
    this.log(name, data);
    this.emitToHost(name, data);
    if (name !== 'cameraChange') {
      this.scheduleState();
    }
  }

  onError(error: Error) {
    console.error('Player error:', error);
    this.error = error.message;
    this.log('error', error.message);
    this.pushError(error.message);
    this.emitToHost('error', { message: error.message });
    this.scheduleState();
  }
}
