/**
 * PanelWave embed loader and host SDK (`panelwave-embed.js`, served as
 * `https://read.panelwave.org/embed.js`).
 *
 * Declarative: every `<div class="panelwave-embed" data-src="…">` on a page
 * becomes a lazily mounted PanelWave player — one chapter per frame with
 * `data-chapter`, the whole work without it. See docs/MULTI_CHAPTER_EMBED.md.
 *
 * Programmatic (2.0): `PanelWave.mount(element, { src, channel, loading,
 * poster, privacy, purchaseUi, resume, … })` returns a handle with typed
 * events (`on('progress', …)`) and the embed protocol 4 messages. See
 * docs/EMBEDDING.md.
 *
 * Every frame gets a bridge nonce: a v4 player page is then spoken to over a
 * MessagePort (`pw:connect`), which also works for app hosts whose origin
 * `postMessage` cannot target; a v3 page keeps the origin-checked window path.
 *
 * Autoplay: the player plays only while it is at least half on screen, stops
 * at the chapter's end and respects the reader's own toggle.
 */
import {
  LAZY_ROOT_MARGIN,
  LOADER_VERSION,
  buildFrameUrl,
  domEventName,
  frameOrigin,
  fromMountOptions,
  isPlayerMessage,
  newNonce,
  pickUnmount,
  readOptions,
  resizeAspect,
  resolveStrategy,
  viewportDistance,
  type EmbedElementOptions,
  type MountOptions,
  type PlayerMessage,
} from './core';

export type { MountOptions, PurchaseUi } from './core';

type InstanceState = 'poster' | 'loading' | 'ready';
type Listener = (data: unknown) => void;

interface Instance {
  id: number;
  el: HTMLElement;
  options: EmbedElementOptions;
  strategy: 'eager' | 'lazy' | 'click';
  /** Origin the player page posts from; null = opaque (no window bridge). */
  origin: string | null;
  poster: HTMLButtonElement;
  frame?: HTMLIFrameElement;
  state: InstanceState;
  visible: boolean;
  mutedByLoader: boolean;
  complete: boolean;
  readyTimer?: ReturnType<typeof setTimeout>;
  stateWaiters: ((state: unknown) => void)[];
  /** Bridge nonce of the current frame. */
  nonce: string;
  /** The port the v4 page answered on; the window path is closed then. */
  port?: MessagePort;
  /** Ports offered with pw:connect that have not answered yet. */
  offered: MessagePort[];
  listeners: Map<string, Set<Listener>>;
  resume?: MountOptions['resume'];
  /** The frame is enlarged by us (`fullscreenRequest`). */
  enlarged: boolean;
}

/** Events a host can listen to: the player's `pw:event` names, plus `ready` and `hello`. */
export type PanelWaveEventName =
  | 'hello'
  | 'ready'
  | 'mount'
  | 'unmount'
  | 'panelChange'
  | 'chapterChange'
  | 'chapterComplete'
  | 'autoplayChange'
  | 'locationChange'
  | 'variableChange'
  | 'localeChange'
  | 'navigationAttempt'
  | 'paywallAction'
  | 'ageVerified'
  | 'likeChange'
  | 'bookmarkChange'
  | 'widgetEvent'
  | 'progress'
  | 'resize'
  | 'fullscreenRequest'
  | 'error'
  | (string & {});

export interface EmbedHandle {
  /** Jump to a panel of the work (or of the chapter). */
  navigate(panelId: string): void;
  /** Live player options (`autoplay`, `muted`, `showToolbar`, `purchaseUi`, …). */
  setOptions(options: Record<string, unknown>): void;
  /** The player's state snapshot (`pw:state`). */
  getState(): Promise<unknown>;
  /** Remove the player and the placeholder. */
  destroy(): void;
}

/** The handle `PanelWave.mount()` returns (2.0). */
export interface PanelWaveFrame extends EmbedHandle {
  /** Listen to a player event; returns the function that stops listening. */
  on(name: PanelWaveEventName, fn: Listener): () => void;
  off(name: PanelWaveEventName, fn: Listener): void;
  setLocale(locale: string): void;
  setTheme(theme: 'light' | 'dark' | Record<string, unknown> | null): void;
  /** Analytics on or off in the frame (after the host's own consent step). */
  setPrivacy(privacy: { tracking: boolean }): void;
  /** Continue at a panel, variables first. */
  restore(resume: { panelId: string; variables?: Record<string, unknown> }): void;
  /** The host took over a purchase after `paywallAction`. */
  purchaseHandled(productId?: string): void;
  /** The frame element (after mounting). */
  readonly frame: HTMLIFrameElement | null;
  /** How the SDK talks to the page: `port` (embed protocol 4), `window` (older pages) or `none` yet. */
  readonly transport: 'port' | 'window' | 'none';
}

export interface PanelWaveEmbedApi {
  version: string;
  scan(root?: ParentNode): void;
  mount(el: HTMLElement): void;
  unmount(el: HTMLElement): void;
  get(el: HTMLElement): EmbedHandle | null;
}

export interface PanelWaveApi {
  version: string;
  mount(el: HTMLElement, options: MountOptions): PanelWaveFrame;
}

const SELECTOR = '.panelwave-embed';
const STYLE_ID = 'pwe-styles';
/** Without a `pw:ready` (older player page, no bridge) the poster leaves after this. */
const READY_FALLBACK_MS = 8000;
const CSS =
  '.pwe-root{position:relative;display:block;width:100%;aspect-ratio:var(--pwe-aspect,16/9);min-height:var(--pwe-min-height,0);background:#111;overflow:hidden}' +
  '.pwe-root.pwe-enlarged{position:fixed;inset:0;z-index:2147483000;aspect-ratio:auto;width:100vw;height:100vh;min-height:0}' +
  '.pwe-frame{position:absolute;inset:0;width:100%;height:100%;border:0;z-index:0}' +
  '.pwe-poster{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;padding:0;border:0;background:#111;color:#fff;font:inherit;cursor:pointer;display:block}' +
  '.pwe-poster img{width:100%;height:100%;object-fit:cover;display:block}' +
  '.pwe-play{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(0,0,0,.6);box-shadow:0 0 0 2px #fff}' +
  '.pwe-play:after{content:"";position:absolute;left:26px;top:20px;border-style:solid;border-width:12px 0 12px 20px;border-color:transparent transparent transparent #fff}' +
  '.pwe-title{position:absolute;left:0;right:0;bottom:0;padding:12px 16px;text-align:left;background:linear-gradient(transparent,rgba(0,0,0,.75))}' +
  '.pwe-label{display:block;font-size:.875em;opacity:.85}' +
  '.pwe-poster:focus-visible{outline:3px solid #fff;outline-offset:-6px}' +
  '.pwe-root[data-pwe-state=ready]>.pwe-poster{display:none}' +
  '.pwe-root[data-pwe-state=loading] .pwe-play{animation:pwe-pulse 1s ease-in-out infinite}' +
  '@keyframes pwe-pulse{50%{opacity:.4}}' +
  '@media (prefers-reduced-motion:reduce){.pwe-root[data-pwe-state=loading] .pwe-play{animation:none}}';

const instances = new Map<HTMLElement, Instance>();
let nextId = 1;
let firstAssigned = false;
let gestureSeen = false;
let nearObserver: IntersectionObserver | undefined;
let viewObserver: IntersectionObserver | undefined;
let listening = false;

function dispatch(el: HTMLElement, name: string, detail: unknown): void {
  el.dispatchEvent(new CustomEvent(domEventName(name), { detail, bubbles: true }));
}

/** DOM event plus the `on()` listeners of the instance. */
function emit(inst: Instance, name: string, data: unknown): void {
  dispatch(inst.el, name, data);
  inst.listeners.get(name)?.forEach((fn) => {
    try {
      fn(data);
    } catch (e) {
      console.error('PanelWave embed: listener for ' + name + ' failed', e);
    }
  });
}

function ensureStyles(): void {
  if (document.getElementById(STYLE_ID)) return;
  const style = document.createElement('style');
  style.id = STYLE_ID;
  style.textContent = CSS;
  document.head.appendChild(style);
}

function reducedData(): boolean {
  try {
    return window.matchMedia?.('(prefers-reduced-data: reduce)').matches === true;
  } catch {
    return false;
  }
}

function setState(inst: Instance, state: InstanceState): void {
  inst.state = state;
  inst.el.setAttribute('data-pwe-state', state);
  if (state === 'loading') inst.el.setAttribute('aria-busy', 'true');
  else inst.el.removeAttribute('aria-busy');
}

function post(inst: Instance, message: Record<string, unknown>): void {
  if (inst.port) {
    inst.port.postMessage(message);
    return;
  }
  const target = inst.frame?.contentWindow;
  if (target && inst.origin) {
    try {
      target.postMessage(message, inst.origin);
    } catch {
      // the frame navigated away — nothing to tell it
    }
  }
}

function random(bytes: Uint8Array): Uint8Array {
  return crypto.getRandomValues(bytes);
}

function setup(el: HTMLElement, options: EmbedElementOptions, extra: { label?: string; resume?: MountOptions['resume'] } = {}): Instance {
  ensureStyles();
  listen();
  const isFirst = !firstAssigned;
  firstAssigned = true;

  el.classList.add('pwe-root');
  el.style.setProperty('--pwe-aspect', options.aspect);
  const what = options.chapter ? 'PanelWave chapter' : 'PanelWave comic';
  if (!el.hasAttribute('role')) el.setAttribute('role', 'region');
  if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', options.title || what);

  // The poster is plain DOM built only from what the host gave: nothing reaches PanelWave before the tap.
  const poster = document.createElement('button');
  poster.type = 'button';
  poster.className = 'pwe-poster';
  poster.setAttribute('aria-label', (extra.label || 'Play') + (options.title ? ': ' + options.title : ''));
  if (options.poster) {
    const img = document.createElement('img');
    img.src = options.poster;
    img.alt = '';
    img.loading = isFirst ? 'eager' : 'lazy';
    img.decoding = 'async';
    poster.appendChild(img);
  }
  if (options.title || extra.label) {
    const title = document.createElement('span');
    title.className = 'pwe-title';
    title.textContent = options.title ?? '';
    if (extra.label) {
      const label = document.createElement('span');
      label.className = 'pwe-label';
      label.textContent = extra.label;
      title.appendChild(label);
    }
    poster.appendChild(title);
  }
  const play = document.createElement('span');
  play.className = 'pwe-play';
  play.setAttribute('aria-hidden', 'true');
  poster.appendChild(play);
  el.appendChild(poster);

  const inst: Instance = {
    id: nextId++,
    el,
    options,
    strategy: resolveStrategy(options.loading, isFirst, reducedData()),
    origin: frameOrigin(options.src, document.baseURI),
    poster,
    state: 'poster',
    visible: false,
    mutedByLoader: false,
    complete: false,
    stateWaiters: [],
    nonce: '',
    offered: [],
    listeners: new Map(),
    resume: extra.resume,
    enlarged: false,
  };
  instances.set(el, inst);
  setState(inst, 'poster');

  poster.addEventListener('click', () => {
    gestureSeen = true;
    mount(inst);
    // The reader asked for it: hand over focus once the player is there.
    inst.frame?.focus();
  });

  observers();
  viewObserver?.observe(el);
  if (inst.strategy === 'eager') mount(inst);
  else if (inst.strategy === 'lazy') nearObserver?.observe(el);
  return inst;
}

function setupFromAttributes(el: HTMLElement): void {
  if (instances.has(el)) return;
  const result = readOptions((name) => el.getAttribute('data-' + name));
  if (!result.ok) {
    console.warn('PanelWave embed: ' + result.error, el);
    el.setAttribute('data-pwe-state', 'error');
    dispatch(el, 'error', { message: result.error });
    return;
  }
  setup(el, result.options);
}

function mount(inst: Instance): void {
  if (inst.frame) return;
  const frame = document.createElement('iframe');
  inst.nonce = newNonce(random);
  frame.className = 'pwe-frame';
  frame.src = buildFrameUrl(inst.options, document.baseURI, window.location.origin, inst.nonce);
  frame.title = inst.options.title || (inst.options.chapter ? 'PanelWave chapter' : 'PanelWave comic');
  frame.allow = 'autoplay; fullscreen';
  frame.setAttribute('allowfullscreen', '');
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.addEventListener('load', () => {
    if (inst.frame !== frame || inst.state !== 'loading') return;
    connect(inst);
    // No answer (older player page, opaque origin): show the player anyway.
    inst.readyTimer = setTimeout(() => inst.state === 'loading' && markReady(inst), inst.origin ? READY_FALLBACK_MS : 1500);
  });
  inst.frame = frame;
  setState(inst, 'loading');
  inst.el.appendChild(frame);
  emit(inst, 'mount', { chapter: inst.options.chapter ?? null });
  enforceMaxLive();
}

/**
 * Embed protocol 4: offer the frame a MessagePort with the nonce. A v4 page
 * answers `pw:hello` over the first port it accepts; a v3 page ignores it and
 * keeps the window path. Offered on `load` and on a window `pw:hello` (the
 * page may greet before or after `load`); the first port that answers wins.
 */
function connect(inst: Instance): void {
  const target = inst.frame?.contentWindow;
  if (!target || inst.port || inst.offered.length >= 2 || typeof MessageChannel === 'undefined') return;
  const channel = new MessageChannel();
  const port = channel.port1;
  inst.offered.push(port);
  port.onmessage = (event) => {
    if (!isPlayerMessage(event.data)) return;
    if (!inst.port) {
      inst.port = port;
      for (const other of inst.offered.splice(0)) if (other !== port) other.close();
      // The page said `pw:ready` on the window path before taking the port and
      // ignores the window from now on: send the start-up messages again.
      if (inst.state === 'ready') startUp(inst);
    }
    if (inst.port === port) handle(inst, event.data);
  };
  try {
    target.postMessage({ type: 'pw:connect', nonce: inst.nonce, protocol: 4 }, inst.origin ?? '*', [channel.port2]);
  } catch {
    port.close();
  }
}

function markReady(inst: Instance): void {
  if (inst.readyTimer) clearTimeout(inst.readyTimer);
  inst.readyTimer = undefined;
  if (inst.state === 'ready') return;
  setState(inst, 'ready');
  applyAudio(inst);
}

function unmount(inst: Instance): void {
  if (!inst.frame) return;
  if (inst.readyTimer) clearTimeout(inst.readyTimer);
  inst.frame.remove();
  inst.frame = undefined;
  inst.port?.close();
  inst.port = undefined;
  for (const port of inst.offered.splice(0)) port.close();
  inst.mutedByLoader = false;
  setEnlarged(inst, false);
  for (const waiter of inst.stateWaiters.splice(0)) waiter(null);
  setState(inst, 'poster');
  emit(inst, 'unmount', { chapter: inst.options.chapter ?? null });
  // Back near the viewport later: mount again (a tap always works).
  if (inst.strategy !== 'click') nearObserver?.observe(inst.el);
}

/** Keep at most `data-max-live` players mounted (the smallest value on the page wins). */
function enforceMaxLive(): void {
  const live = [...instances.values()].filter((inst) => inst.frame);
  if (live.length < 2) return;
  const maxLive = Math.min(...[...instances.values()].map((inst) => inst.options.maxLive));
  const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
  const ids = pickUnmount(
    live.map((inst) => {
      const rect = inst.el.getBoundingClientRect();
      return { id: inst.id, distance: viewportDistance(rect.top, rect.bottom, viewportHeight), visible: inst.visible };
    }),
    maxLive
  );
  for (const inst of live) if (ids.includes(inst.id)) unmount(inst);
}

/** `data-exclusive-audio`: off-screen players are muted (only ones the loader muted are unmuted). */
function applyAudio(inst: Instance): void {
  if (!inst.options.exclusiveAudio || inst.state !== 'ready') return;
  if (!inst.visible && !inst.mutedByLoader) {
    inst.mutedByLoader = true;
    post(inst, { type: 'setOptions', data: { muted: true } });
  } else if (inst.visible && inst.mutedByLoader) {
    inst.mutedByLoader = false;
    post(inst, { type: 'setOptions', data: { muted: false } });
  }
}

/** `fullscreenRequest` (a WebView without the Fullscreen API): the frame fills the window. */
function setEnlarged(inst: Instance, on: boolean): void {
  inst.enlarged = on;
  inst.el.classList.toggle('pwe-enlarged', on);
}

function observers(): void {
  if (nearObserver || typeof IntersectionObserver === 'undefined') {
    if (typeof IntersectionObserver === 'undefined') {
      // Very old browser: no laziness, mount what is not click-to-load.
      instances.forEach((inst) => inst.strategy !== 'click' && mount(inst));
    }
    return;
  }
  nearObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        if (!entry.isIntersecting) continue;
        const inst = instances.get(entry.target as HTMLElement);
        nearObserver?.unobserve(entry.target);
        if (inst) mount(inst);
      }
    },
    { rootMargin: LAZY_ROOT_MARGIN }
  );
  viewObserver = new IntersectionObserver(
    (entries) => {
      for (const entry of entries) {
        const inst = instances.get(entry.target as HTMLElement);
        if (!inst) continue;
        const viewportHeight = entry.rootBounds?.height ?? window.innerHeight;
        inst.visible =
          entry.isIntersecting &&
          (entry.intersectionRatio >= 0.5 || entry.intersectionRect.height >= viewportHeight * 0.5);
        applyAudio(inst);
      }
    },
    { threshold: [0, 0.25, 0.5, 0.75, 1] }
  );
}

/** The window path (v1–v3 pages, and a v4 page's first greeting). */
function onMessage(event: MessageEvent): void {
  if (!isPlayerMessage(event.data)) return;
  for (const inst of instances.values()) {
    if (!inst.frame || event.source !== inst.frame.contentWindow) continue;
    if (!inst.origin || event.origin !== inst.origin || inst.port) return;
    if (event.data.type === 'pw:hello' && (event.data.protocol ?? 0) >= 4) connect(inst);
    handle(inst, event.data);
    return;
  }
}

function handle(inst: Instance, message: PlayerMessage): void {
  switch (message.type) {
    case 'pw:hello':
      if (gestureSeen) post(inst, { type: 'hostGesture' });
      emit(inst, 'hello', message);
      break;
    case 'pw:ready':
      if (inst.state !== 'ready') {
        markReady(inst);
        startUp(inst);
        emit(inst, 'ready', {});
      }
      break;
    case 'pw:event': {
      const name = typeof message.name === 'string' ? message.name : 'event';
      if (name === 'ready') break; // announced with pw:ready
      if (name === 'chapterComplete') inst.complete = true;
      if (name === 'resize') {
        const aspect = resizeAspect(message.data);
        if (aspect) inst.el.style.setProperty('--pwe-aspect', aspect);
        const min = Number((message.data as { minHeight?: unknown } | null)?.minHeight);
        if (Number.isFinite(min) && min > 0 && min < 2000) inst.el.style.setProperty('--pwe-min-height', min + 'px');
      }
      if (name === 'fullscreenRequest') setEnlarged(inst, (message.data as { fullscreen?: unknown } | null)?.fullscreen === true);
      emit(inst, name, message.data);
      break;
    }
    case 'pw:state':
      for (const waiter of inst.stateWaiters.splice(0)) waiter(message.data);
      emit(inst, 'state', message.data);
      break;
  }
}

/** What the SDK tells a ready page once (idempotent, so it may be sent again when the port arrives). */
function startUp(inst: Instance): void {
  // The host can enlarge the frame where the browser cannot go fullscreen.
  post(inst, { type: 'setOptions', data: { hostFullscreen: true } });
  if (inst.options.theme) post(inst, { type: 'setTheme', theme: { mode: inst.options.theme } });
  if (inst.resume) post(inst, { type: 'restore', ...inst.resume });
}

/** The first tap / key press on the host page lets held-back sound play in the players. */
function onGesture(): void {
  if (gestureSeen) return;
  gestureSeen = true;
  instances.forEach((inst) => post(inst, { type: 'hostGesture' }));
}

function listen(): void {
  if (listening) return;
  listening = true;
  window.addEventListener('message', onMessage);
  document.addEventListener('pointerdown', onGesture, { capture: true, passive: true });
  document.addEventListener('keydown', onGesture, { capture: true });
}

function handleFor(inst: Instance): EmbedHandle {
  return {
    navigate: (panelId) => post(inst, { type: 'navigate', panelId }),
    setOptions: (options) => post(inst, { type: 'setOptions', data: options }),
    getState: () =>
      new Promise((resolve, reject) => {
        if (!inst.frame || (!inst.origin && !inst.port)) {
          reject(new Error('PanelWave embed: player not mounted or not reachable'));
          return;
        }
        const timer = setTimeout(() => {
          inst.stateWaiters = inst.stateWaiters.filter((w) => w !== waiter);
          reject(new Error('PanelWave embed: no state from the player'));
        }, 3000);
        const waiter = (state: unknown): void => {
          clearTimeout(timer);
          if (state === null) reject(new Error('PanelWave embed: player unmounted'));
          else resolve(state);
        };
        inst.stateWaiters.push(waiter);
        post(inst, { type: 'getState' });
      }),
    destroy: () => destroy(inst),
  };
}

function frameFor(inst: Instance): PanelWaveFrame {
  const base = handleFor(inst);
  const off = (name: string, fn: Listener): void => {
    inst.listeners.get(name)?.delete(fn);
  };
  return {
    ...base,
    on: (name, fn) => {
      let set = inst.listeners.get(name);
      if (!set) inst.listeners.set(name, (set = new Set()));
      set.add(fn);
      return () => off(name, fn);
    },
    off,
    setLocale: (locale) => post(inst, { type: 'setLocale', locale }),
    setTheme: (theme) =>
      post(inst, { type: 'setTheme', theme: theme === 'light' || theme === 'dark' ? { mode: theme } : theme }),
    setPrivacy: (privacy) => post(inst, { type: 'setPrivacy', tracking: privacy.tracking === true }),
    restore: (resume) => {
      inst.resume = resume;
      post(inst, { type: 'restore', ...resume });
    },
    purchaseHandled: (productId) => post(inst, { type: 'purchaseHandled', ...(productId ? { productId } : {}) }),
    get frame() {
      return inst.frame ?? null;
    },
    get transport() {
      return inst.port ? 'port' : inst.frame && inst.origin && inst.state !== 'poster' ? 'window' : 'none';
    },
  };
}

function destroy(inst: Instance): void {
  unmount(inst);
  nearObserver?.unobserve(inst.el);
  viewObserver?.unobserve(inst.el);
  inst.poster.remove();
  inst.el.classList.remove('pwe-root');
  inst.el.removeAttribute('data-pwe-state');
  inst.listeners.clear();
  instances.delete(inst.el);
}

function scan(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => setupFromAttributes(el));
}

/** `PanelWave.mount()`: a frame from options instead of `data-*` attributes. */
function mountWith(el: HTMLElement, options: MountOptions): PanelWaveFrame {
  const existing = instances.get(el);
  if (existing) destroy(existing);
  const result = fromMountOptions(options);
  if (!result.ok) throw new Error('PanelWave.mount: ' + result.error);
  return frameFor(setup(el, result.options, { label: options.poster?.label, resume: options.resume }));
}

const api: PanelWaveEmbedApi = {
  version: LOADER_VERSION,
  scan,
  mount: (el) => {
    const inst = instances.get(el);
    if (inst) mount(inst);
  },
  unmount: (el) => {
    const inst = instances.get(el);
    if (inst) unmount(inst);
  },
  get: (el) => {
    const inst = instances.get(el);
    return inst ? handleFor(inst) : null;
  },
};

const sdk: PanelWaveApi = { version: LOADER_VERSION, mount: mountWith };

/** ES module form (`@panelwave/player/embed`): the same SDK as `window.PanelWave`. */
export { mountWith as mount, sdk as PanelWave };

declare global {
  interface Window {
    PanelWaveEmbed?: PanelWaveEmbedApi;
    PanelWave?: PanelWaveApi;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Loaded twice (two script tags): the first copy keeps the page.
  const existing = window.PanelWaveEmbed;
  if (!existing) window.PanelWaveEmbed = api;
  if (!window.PanelWave) window.PanelWave = sdk;
  const start = (): void => (existing ?? api).scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
