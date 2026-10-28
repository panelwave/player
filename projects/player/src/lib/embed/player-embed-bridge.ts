import { Injectable, inject } from '@angular/core';
import type { Subscription } from 'rxjs';
import { ManifestService } from '../services/manifest.service';
import { UserGestureService } from '../services/user-gesture.service';
import type { PlayerShellComponent } from '../components/player-shell/player-shell.component';
import type { Chapter, PlayerPanelChangeEvent } from '../types';
import { EmbedStateService } from './embed-state.service';
import {
  EMBED_ERROR_LIMIT,
  EMBED_PROTOCOL_VERSION,
  isEmbedInboundMessage,
  type EmbedConfigData,
  type EmbedInboundMessage,
  type EmbedOptions,
  type EmbedOutboundMessage,
} from './embed-protocol';

/** `pw:state` is posted at most once per this many ms after a change. */
export const EMBED_STATE_DEBOUNCE_MS = 100;

/**
 * What the host app does with inbound commands that change its own state
 * (the shell's bound inputs live in the app). Everything else — navigate,
 * setVariable, getState, hostGesture, `muted`, dropping the cover — the
 * bridge does on the shell itself.
 */
export interface EmbedBridgeHandlers {
  /** Live options: update the inputs the app binds to the shell (autoplay, showToolbar, …). */
  setOptions(options: EmbedOptions): void;
  /** `setLocale` (default: `shell.onLocaleChange`). */
  setLocale?(locale: string): void;
  /** `config` (default: its options and locale, like `setOptions` + `setLocale`). */
  config?(data: EmbedConfigData): void;
  /** `setEntitlements` (default: ignored — apps without a paywall). */
  setEntitlements?(entitlements: unknown): void;
  /** `restart` (default: `shell.reload()`). */
  restart?(): void;
}

export interface EmbedBridgeConnectOptions {
  /** The only origin messages are accepted from and posted to. */
  hostOrigin: string;
  handlers: EmbedBridgeHandlers;
  /** Where to post (default: `window.parent` when framed). */
  hostWindow?: Window | null;
  /** Where to listen (default: `window`). */
  listenWindow?: Window;
  /** The host's entitlement tokens for `pw:state` (default: null). */
  entitlements?: () => string[] | null;
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
  'error',
] as const;

type ForwardedOutput = (typeof FORWARDED_OUTPUTS)[number];

/**
 * The player side of the embed protocol for apps that own their shell's
 * manifest (the reader and standalone pages): validates and routes inbound
 * messages, forwards shell outputs as `pw:event`, posts `pw:hello` /
 * `pw:ready` and a debounced `pw:state`. See docs/EMBED_PROTOCOL.md.
 *
 * Usage: `connect()` once at start (posts `pw:hello`), `attach(shell)` when
 * the shell exists, `disconnect()` on destroy.
 */
@Injectable({ providedIn: 'root' })
export class PlayerEmbedBridge {
  private readonly manifestService = inject(ManifestService);
  private readonly gesture = inject(UserGestureService);
  private readonly stateService = inject(EmbedStateService);

  private options?: EmbedBridgeConnectOptions;
  private shell?: PlayerShellComponent;
  private subscriptions: Subscription[] = [];
  private stateTimer: ReturnType<typeof setTimeout> | null = null;
  private errors: string[] = [];
  private connectedAt = 0;
  private loadTimeMs: number | null = null;

  private readonly onMessage = (event: MessageEvent): void => {
    if (!this.options || event.origin !== this.options.hostOrigin || !isEmbedInboundMessage(event.data)) {
      return;
    }
    this.handle(event.data);
  };

  /** The bridge is connected to a host. */
  get connected(): boolean {
    return !!this.options;
  }

  /** Start listening and greet the host (`pw:hello`). */
  connect(options: EmbedBridgeConnectOptions): void {
    this.disconnect();
    this.options = options;
    this.errors = [];
    this.loadTimeMs = null;
    this.connectedAt = now();
    (options.listenWindow ?? window).addEventListener('message', this.onMessage);
    this.post({ type: 'pw:hello', protocol: EMBED_PROTOCOL_VERSION });
  }

  /** Stop listening, detach from the shell. */
  disconnect(): void {
    this.detach();
    if (this.options) {
      (this.options.listenWindow ?? window).removeEventListener('message', this.onMessage);
    }
    this.options = undefined;
    if (this.stateTimer !== null) {
      clearTimeout(this.stateTimer);
      this.stateTimer = null;
    }
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
        this.loadTimeMs = Math.round(now() - this.connectedAt);
        this.post({ type: 'pw:ready' });
        this.post({ type: 'pw:event', name: 'ready', data: {} });
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

  private post(message: EmbedOutboundMessage): void {
    const options = this.options;
    if (!options) {
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
