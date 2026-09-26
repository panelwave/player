import { Component, OnDestroy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PlayerShellComponent } from 'player';
import { DevToolsComponent, type DevToolsEvent } from './dev-tools/dev-tools.component';
import type { Chapter, Panel, PanelWaveManifest } from 'player';

/**
 * Config message posted by an embedding host (the CMS preview iframe):
 * { type: 'config', data: { manifest, locale?, autoplay?, variables?, ... } }
 */
interface EmbedConfigMessage {
  type: 'config';
  data: {
    manifest?: PanelWaveManifest;
    locale?: string;
    autoplay?: boolean;
    /** 'auto' | 'panel' | 'canvas' — passed to the shell's viewModeOverride. */
    viewMode?: string;
    /** Initial variable values keyed by variable id (seeded at init; may set read-only vars). */
    variables?: Record<string, unknown>;
    [key: string]: unknown;
  };
}

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
   * iframe — see panelwave-cms docs/PLAYER_EMBED.md). Hides the demo
   * chrome and waits for config instead of loading a bundled sample.
   */
  embedMode = false;
  locale = 'en-US';
  autoplay = false;
  viewModeOverride: 'auto' | 'panel' | 'canvas' = 'auto';

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
   * Initial variable values passed to the shell (seeded privileged at
   * init, so manifest-declared read-only variables can be populated).
   * Sources: the embed host's config message, or the dev/testing hook
   * `?vars=<url-encoded JSON>` — e.g. ?vars={"user.age":12}.
   */
  initialVariables?: Record<string, unknown>;

  private readonly onEmbedMessage = (event: MessageEvent): void => {
    const message = event.data as EmbedConfigMessage | undefined;
    if (!message || message.type !== 'config' || !message.data) {
      return;
    }
    this.embedMode = true;
    this.error = null;
    this.locale = typeof message.data.locale === 'string' ? message.data.locale : 'en-US';
    this.autoplay = message.data.autoplay === true;
    this.viewModeOverride =
      message.data.viewMode === 'panel' || message.data.viewMode === 'canvas'
        ? message.data.viewMode
        : 'auto';
    this.initialVariables =
      message.data.variables && typeof message.data.variables === 'object'
        ? message.data.variables
        : undefined;
    if (message.data.manifest) {
      // Recreate the shell so the new manifest initializes cleanly.
      this.manifest = null;
      this.loading = false;
      setTimeout(() => {
        this.manifest = message.data.manifest as PanelWaveManifest;
      });
    }
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
      return;
    }

    // Load an arbitrary manifest via ?manifest=<url> — e.g. a CMS preview link
    // (http://localhost:4200/api/preview/<token>/manifest). Falls back to the
    // bundled sample. The manifest endpoint sends Access-Control-Allow-Origin: *
    // so this works cross-origin (run the demo on a free port, e.g. --port 4300,
    // while the CMS frontend keeps :4200 for its /api proxy).
    const manifestUrl = params.get('manifest');
    this.loadManifest(manifestUrl || 'assets/sample-manifest.json');
  }

  ngOnDestroy() {
    window.removeEventListener('message', this.onEmbedMessage);
  }

  /** Running inside an iframe (the CMS preview embed). Separate for tests. */
  protected isFramed(): boolean {
    return window.self !== window.top;
  }

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

  onPlayerReady() {
    this.log('ready', '');
  }

  onPanelChange(event: { panel: Panel; chapter: Chapter }) {
    this.panelChanges++;
    // Panels carry no id of their own — it is their key in chapter.panels.
    const panels = (event.chapter?.panels ?? {}) as Record<string, Panel>;
    const panelId = Object.keys(panels).find((id) => panels[id] === event.panel) ?? '?';
    this.log('panelChange', { panel: panelId, chapter: event.chapter?.id });
  }

  onError(error: Error) {
    console.error('Player error:', error);
    this.error = error.message;
    this.log('error', error.message);
  }
}
