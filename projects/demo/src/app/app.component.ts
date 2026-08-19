import { Component, OnDestroy, OnInit } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { HttpClient } from '@angular/common/http';
import { PlayerShellComponent } from 'player';
import type { PanelWaveManifest } from 'player';

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
    imports: [RouterOutlet, PlayerShellComponent],
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

  constructor(private http: HttpClient) {}

  ngOnInit() {
    window.addEventListener('message', this.onEmbedMessage);

    const params = new URLSearchParams(window.location.search);

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
    if (params.get('embed') === '1' || window.self !== window.top) {
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
    this.http.get<PanelWaveManifest>(url)
      .subscribe({
        next: (manifest) => {
          this.manifest = manifest;
          this.loading = false;
          console.log('Loaded manifest:', manifest);
        },
        error: (err) => {
          this.error = `Failed to load manifest: ${err.message}`;
          this.loading = false;
          console.error('Error loading manifest:', err);
        }
      });
  }

  onPlayerReady() {
    console.log('Player is ready!');
  }

  onPanelChange(event: any) {
    console.log('Panel changed:', event);
  }

  onError(error: Error) {
    console.error('Player error:', error);
    this.error = error.message;
  }
}
