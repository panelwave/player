import { Injectable, inject } from '@angular/core';
import type { Subscription } from 'rxjs';
import { ManifestService } from '../services/manifest.service';
import { UserGestureService } from '../services/user-gesture.service';
import { TrackingService } from '../services/tracking.service';
import type { PlayerShellComponent } from '../components/player-shell/player-shell.component';
import type { Chapter, PlayerPanelChangeEvent } from '../types';
import { EmbedStateService } from './embed-state.service';
import {
  EMBED_CAPABILITIES,
  EMBED_ERROR_LIMIT,
  EMBED_MIN_HEIGHT,
  EMBED_PROGRESS_DEBOUNCE_MS,
  EMBED_PROTOCOL_VERSION,
  isEmbedConnectMessage,
  isEmbedInboundMessage,
  parseResume,
  type EmbedConfigData,
  type EmbedInboundMessage,
  type EmbedOptions,
  type EmbedOutboundMessage,
  type EmbedResume,
} from './embed-protocol';

/** `pw:state` is posted at most once per this many ms after a change. */
export const EMBED_STATE_DEBOUNCE_MS = 100;

/**
 * What the host app does with inbound commands that change its own state
 * (the shell's bound inputs live in the app). Everything else — navigate,
 * setVariable, getState, hostGesture, `muted`, dropping the cover, restore,
 * privacy — the bridge does on the shell and the player's services itself.
 */
export interface EmbedBridgeHandlers {
  /** Live options: update the inputs the app binds to the shell (autoplay, showToolbar, purchaseUi, …). */
  setOptions(options: EmbedOptions): void;
  /** `setLocale` (default: `shell.onLocaleChange`). */
  setLocale?(locale: string): void;
  /** `config` (default: its options and locale, like `setOptions` + `setLocale`; a `resume` is applied by the bridge). */
  config?(data: EmbedConfigData): void;
  /** `setEntitlements` (default: ignored — apps without a paywall). */
  setEntitlements?(entitlements: unknown): void;
  /** `restart` (default: `shell.reload()`). */
  restart?(): void;
  /** v4 `purchaseHandled`: the host started a checkout for this product (default: ignored). */
  purchaseHandled?(productId: string | undefined): void;
}

export interface EmbedBridgeConnectOptions {
  /** The only origin messages are accepted from and posted to on the window path. */
  hostOrigin: string;
  handlers: EmbedBridgeHandlers;
  /** Where to post (default: `window.parent` when framed). */
  hostWindow?: Window | null;
  /** Where to listen (default: `window`). */
  listenWindow?: Window;
  /** The host's entitlement tokens for `pw:state` (default: null). */
  entitlements?: () => string[] | null;
  /** v4: the `bridge=` boot nonce; enables the port handshake. */
  bridgeNonce?: string;
  /** v4: the channel the frame runs in (`ch`, checked by the reader server), for `pw:hello`. */
  channel?: string | null;
  /** v4: the listing on that channel, for `pw:hello`. */
  listing?: string | null;
}

/** Shell outputs forwarded as `pw:event` (names as in the shell). */
const FORWARDED_OUTPUTS = [
  'panelChange',
  'chapterChange',
  'chapterComplete',
  'autoplayChange',
  'locationChange',
  'variableChange',
  'localeChange',
  'navigationAttempt',
  'cameraChange',
  'paywallAction',
  'ageVerified',
  'likeChange',
  'bookmarkChange',
  'widgetEvent',
  'fullscreenRequest',
  'error',
] as const;

type ForwardedOutput = (typeof FORWARDED_OUTPUTS)[number];

/** Outputs after which the reading position may have moved (v4 `progress`, `resize`). */
const POSITION_OUTPUTS = new Set<ForwardedOutput>(['panelChange', 'chapterChange', 'chapterComplete', 'locationChange']);

/**
 * The player side of the embed protocol for apps that own their shell's
 * manifest (the reader and standalone pages): validates and routes inbound
 * messages, forwards shell outputs as `pw:event`, posts `pw:hello` /
 * `pw:ready` and a debounced `pw:state`. See docs/EMBED_PROTOCOL.md.
 *
 * v4: with a `bridgeNonce` the first `pw:connect` carrying that nonce and a
 * MessagePort switches the bridge to the port for good (app hosts whose
 * origin `postMessage` cannot target, and every v4 host); later connects are
 * refused and window messages are ignored. Also v4: `progress` (debounced,
 * and on `pagehide`), `resize`, `restore` / `config.resume`, `setPrivacy`.
 *
 * Usage: `connect()` once at start (posts `pw:hello`), `attach(shell)` when
 * the shell exists, `disconnect()` on destroy.
 */
@Injectable({ providedIn: 'root' })
export class PlayerEmbedBridge {
  private readonly manifestService = inject(ManifestService);
  private readonly gesture = inject(UserGestureService);
  private readonly stateService = inject(EmbedStateService);
  private readonly tracking = inject(TrackingService);

  private options?: EmbedBridgeConnectOptions;
  private shell?: PlayerShellComponent;
  private subscriptions: Subscription[] = [];
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private progressTimer: ReturnType<typeof setTimeout> | null = null;
  private errors: string[] = [];
  private connectedAt = 0;
  private loadTimeMs: number | null = null;
  private ready = false;
  private port: MessagePort | null = null;
  private portOrigin = '';
  private pendingResume: EmbedResume | null = null;
  private lastAspect: number | null = null;

  private readonly onMessage = (event: MessageEvent): void => {
    const options = this.options;
    if (!options) {
      return;
    }
    if (isEmbedConnectMessage(event.data)) {
      this.acceptPort(event);
      return;
    }
    // v4: once a port is connected, only the port speaks.
    if (this.port || event.origin !== options.hostOrigin || !isEmbedInboundMessage(event.data)) {
      return;
    }
    this.handle(event.data);
  };

  private readonly onPortMessage = (event: MessageEvent): void => {
    if (isEmbedInboundMessage(event.data)) {
      this.handle(event.data);
    }
  };

  private readonly onPageHide = (): void => {
    if (this.progressTimer !== null) {
      clearTimeout(this.progressTimer);
      this.progressTimer = null;
    }
    if (this.ready) {
      this.postProgress();
    }
  };

  /** The bridge is connected to a host. */
  get connected(): boolean {
    return !!this.options;
  }

  /** v4: the bridge talks over a MessagePort. */
  get portConnected(): boolean {
    return !!this.port;
  }

  /** v4: the origin that sent the accepted `pw:connect` (diagnostics only). */
  get connectOrigin(): string {
    return this.portOrigin;
  }

  /** Start listening and greet the host (`pw:hello`). */
  connect(options: EmbedBridgeConnectOptions): void {
    this.disconnect();
    this.options = options;
    this.errors = [];
    this.loadTimeMs = null;
    this.ready = false;
    this.lastAspect = null;
    this.pendingResume = null;
    this.connectedAt = now();
    const win = options.listenWindow ?? window;
    win.addEventListener('message', this.onMessage);
    win.addEventListener('pagehide', this.onPageHide);
    this.post(this.hello());
  }

  /** Stop listening, detach from the shell, close the port. */
  disconnect(): void {
    this.detach();
    if (this.options) {
      const win = this.options.listenWindow ?? window;
      win.removeEventListener('message', this.onMessage);
      win.removeEventListener('pagehide', this.onPageHide);
    }
    if (this.port) {
      this.port.onmessage = null;
      this.port.close();
      this.port = null;
      this.portOrigin = '';
    }
    this.options = undefined;
    for (const timer of [this.stateTimer, this.progressTimer]) {
      if (timer !== null) clearTimeout(timer);
    }
    this.stateTimer = null;
    this.progressTimer = null;
  }

  /** Follow a shell: forward its outputs, answer for it. */
  attach(shell: PlayerShellComponent): void {
    if (this.shell === shell) {
      return;
    }
    this.detach();
    this.shell = shell;
    this.subscriptions.push(
      shell.ready.subscribe(() => {
        this.ready = true;
        this.loadTimeMs = Math.round(now() - this.connectedAt);
        this.post({ type: 'pw:ready' });
        this.post({ type: 'pw:event', name: 'ready', data: {} });
        this.applyPendingResume();
        this.postResize();
        this.scheduleState();
      })
    );
    for (const name of FORWARDED_OUTPUTS) {
      const emitter = shell[name] as unknown as { subscribe(fn: (value: unknown) => void): Subscription };
      this.subscriptions.push(emitter.subscribe((value) => this.forward(name, value)));
    }
  }

  /** Stop following the shell. */
  detach(): void {
    for (const sub of this.subscriptions) {
      sub.unsubscribe();
    }
    this.subscriptions = [];
    this.shell = undefined;
    this.ready = false;
  }

  /** Post the live state now. */
  postState(): void {
    this.post({
      type: 'pw:state',
      data: this.stateService.build(this.shell, {
        entitlements: this.options?.entitlements?.() ?? null,
        errors: this.errors,
        loadTimeMs: this.loadTimeMs,
      }),
    });
  }

  /** Post the live state once, shortly after the last change. */
  scheduleState(): void {
    if (!this.options) {
      return;
    }
    if (this.stateTimer !== null) {
      clearTimeout(this.stateTimer);
    }
    this.stateTimer = setTimeout(() => {
      this.stateTimer = null;
      this.postState();
    }, EMBED_STATE_DEBOUNCE_MS);
  }

  /** Remember an error for `pw:state.errors`. */
  pushError(message: string): void {
    this.errors = [...this.errors, message].slice(-EMBED_ERROR_LIMIT);
  }

  /** v4 `pw:hello`: protocol, channel context, capabilities. */
  private hello(): EmbedOutboundMessage {
    return {
      type: 'pw:hello',
      protocol: EMBED_PROTOCOL_VERSION,
      channel: this.options?.channel ?? null,
      listing: this.options?.listing ?? null,
      capabilities: EMBED_CAPABILITIES,
    };
  }

  /**
   * v4 port handshake: the first `pw:connect` with the boot nonce and a port
   * wins; anything else (no nonce configured, wrong nonce, no port, a second
   * connect) is ignored. The host learns the frame's protocol and, when the
   * work is already loaded, its readiness over the port.
   */
  private acceptPort(event: MessageEvent): void {
    const nonce = this.options?.bridgeNonce;
    const port = event.ports?.[0];
    if (!nonce || this.port || !port || (event.data as { nonce: string }).nonce !== nonce) {
      return;
    }
    this.port = port;
    this.portOrigin = event.origin ?? '';
    port.onmessage = this.onPortMessage;
    port.start?.();
    this.post(this.hello());
    if (this.ready) {
      this.post({ type: 'pw:ready' });
      this.postResize(true);
      this.scheduleState();
    }
  }

  private forward(name: ForwardedOutput, value: unknown): void {
    let data: unknown = value;
    if (name === 'panelChange') {
      // Ids only: the panel and chapter objects carry every layer of the chapter.
      const event = value as PlayerPanelChangeEvent;
      data = { panelId: event.panelId, previousPanelId: event.previousPanelId ?? null, chapterId: event.chapter.id };
    } else if (name === 'chapterChange') {
      const chapter = value as Chapter;
      data = { chapterId: chapter.id, title: chapter.title ?? null };
    } else if (name === 'error') {
      const message = (value as Error)?.message ?? String(value);
      this.pushError(message);
      data = { message };
    }
    this.post({ type: 'pw:event', name, data });
    if (POSITION_OUTPUTS.has(name)) {
      this.scheduleProgress();
      this.postResize();
    }
    if (name !== 'cameraChange') {
      this.scheduleState();
    }
  }

  private handle(message: EmbedInboundMessage): void {
    const handlers = this.options!.handlers;
    const shell = this.shell;
    switch (message.type) {
      case 'config':
        if (message.data && typeof message.data === 'object') {
          if (handlers.config) {
            handlers.config(message.data);
          } else {
            this.applyOptions(message.data);
            if (typeof message.data.locale === 'string') {
              this.setLocale(message.data.locale);
            }
          }
          const resume = parseResume(message.data.resume);
          if (resume) {
            this.restore(resume);
          }
          this.scheduleState();
        }
        break;
      case 'navigate':
        if (typeof message.panelId === 'string') {
          void this.navigate(message.panelId);
        }
        break;
      case 'setVariable':
        if (typeof message.key === 'string' && shell) {
          shell.seedVariable(message.key, message.value);
          this.scheduleState();
        }
        break;
      case 'setLocale':
        if (typeof message.locale === 'string') {
          this.setLocale(message.locale);
          this.scheduleState();
        }
        break;
      case 'setEntitlements':
        handlers.setEntitlements?.(message.entitlements);
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
        if (handlers.restart) {
          handlers.restart();
        } else {
          void shell?.reload();
        }
        break;
      case 'hostGesture':
        // The reader interacted with the host page: sound that the autoplay
        // policy held back may start now (the iframe has allow="autoplay").
        this.gesture.markInteracted();
        break;
      case 'setTheme':
        // v3: live widget theme (e.g. the CMS theme manager's preview).
        if (message.theme === null || (message.theme && typeof message.theme === 'object')) {
          shell?.setThemeOverride(message.theme);
        }
        break;
      case 'setPrivacy':
        // v4: the host's own consent step decides about analytics in this frame.
        if (typeof message.tracking === 'boolean') {
          this.tracking.setSuppressed(!message.tracking);
        }
        break;
      case 'restore': {
        const resume = parseResume(message);
        if (resume) {
          this.restore(resume);
        }
        break;
      }
      case 'purchaseHandled':
        // v4: the host took over the purchase (its own checkout). The fallback to
        // PanelWave's hosted checkout comes with reader purchases (doc 05 §5.2).
        handlers.purchaseHandled?.(typeof message.productId === 'string' ? message.productId : undefined);
        break;
    }
  }

  /** Options through the app, plus what only the shell can do live. */
  private applyOptions(options: EmbedOptions): void {
    this.options!.handlers.setOptions(options);
    const shell = this.shell;
    if (!shell) {
      return;
    }
    if (typeof options.muted === 'boolean') {
      shell.setAudioEnabled(!options.muted);
    }
    if (options.showCover === false && shell.coverVisible) {
      shell.hideCover();
    }
  }

  private setLocale(locale: string): void {
    if (this.options!.handlers.setLocale) {
      this.options!.handlers.setLocale(locale);
    } else {
      this.shell?.onLocaleChange(locale);
    }
  }

  /** v4 `restore` / `config.resume`: seed the variables, then jump; waits for the work when it is not ready yet. */
  private restore(resume: EmbedResume): void {
    if (!this.shell || !this.ready) {
      this.pendingResume = resume;
      return;
    }
    for (const [key, value] of Object.entries(resume.variables ?? {})) {
      this.shell.seedVariable(key, value);
    }
    void this.navigate(resume.panelId);
  }

  private applyPendingResume(): void {
    const resume = this.pendingResume;
    this.pendingResume = null;
    if (resume) {
      this.restore(resume);
    }
  }

  /** `navigate`: jump to a panel (the shell refuses one outside its chapter scope). */
  private async navigate(panelId: string): Promise<void> {
    const shell = this.shell;
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

  /** v4 `progress`: once per EMBED_PROGRESS_DEBOUNCE_MS after the position moved. */
  private scheduleProgress(): void {
    if (!this.options || !this.ready) {
      return;
    }
    if (this.progressTimer !== null) {
      clearTimeout(this.progressTimer);
    }
    this.progressTimer = setTimeout(() => {
      this.progressTimer = null;
      this.postProgress();
    }, EMBED_PROGRESS_DEBOUNCE_MS);
  }

  private postProgress(): void {
    if (!this.shell) {
      return;
    }
    this.post({ type: 'pw:event', name: 'progress', data: this.stateService.progress(this.shell) });
  }

  /** v4 `resize`: the view's shape, posted when it changes (or again when asked). */
  private postResize(force = false): void {
    const shell = this.shell;
    if (!shell || !this.ready || typeof shell.layoutAspect !== 'function') {
      return;
    }
    const aspect = Math.round(shell.layoutAspect() * 10000) / 10000;
    if (!force && aspect === this.lastAspect) {
      return;
    }
    this.lastAspect = aspect;
    this.post({ type: 'pw:event', name: 'resize', data: { aspect, minHeight: EMBED_MIN_HEIGHT } });
  }

  private post(message: EmbedOutboundMessage): void {
    const options = this.options;
    if (!options) {
      return;
    }
    if (this.port) {
      try {
        this.port.postMessage(message);
      } catch (e) {
        console.warn('Embed bridge: could not post to the port', e);
      }
      return;
    }
    const host = options.hostWindow !== undefined ? options.hostWindow : framedParent();
    if (!host) {
      return;
    }
    try {
      host.postMessage(message, options.hostOrigin);
    } catch (e) {
      console.warn('Embed bridge: could not post to host', e);
    }
  }
}

function framedParent(): Window | null {
  return typeof window !== 'undefined' && window.parent && window.parent !== window ? window.parent : null;
}

function now(): number {
  return typeof performance !== 'undefined' ? performance.now() : Date.now();
}
