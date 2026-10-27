/**
 * PanelWave embed loader (`panelwave-embed.js`): turns every
 * `<div class="panelwave-embed" data-src="…" data-chapter="…">` on a page
 * into a lazily mounted PanelWave player locked to one chapter — one iframe
 * per chapter, so several chapters of a work can sit between the page's own
 * content. See docs/MULTI_CHAPTER_EMBED.md for the markup contract.
 *
 * Autoplay: `data-autoplay` is handed to the player, which plays only while
 * it is at least half on screen (its `pauseAutoplayWhenHidden`), stops at
 * the chapter's end and respects the reader's own toggle — no remote
 * control needed, so it also works where no bridge runs (file://).
 */
import {
  LAZY_ROOT_MARGIN,
  LOADER_VERSION,
  buildFrameUrl,
  domEventName,
  frameOrigin,
  isPlayerMessage,
  pickUnmount,
  readOptions,
  resolveStrategy,
  viewportDistance,
  type EmbedElementOptions,
  type PlayerMessage,
} from './core';

type InstanceState = 'poster' | 'loading' | 'ready';

interface Instance {
  id: number;
  el: HTMLElement;
  options: EmbedElementOptions;
  strategy: 'eager' | 'lazy' | 'click';
  /** Origin the player page posts from; null = opaque (no bridge). */
  origin: string | null;
  poster: HTMLButtonElement;
  frame?: HTMLIFrameElement;
  state: InstanceState;
  visible: boolean;
  mutedByLoader: boolean;
  complete: boolean;
  readyTimer?: ReturnType<typeof setTimeout>;
  stateWaiters: ((state: unknown) => void)[];
}

export interface EmbedHandle {
  /** Jump to a panel of the chapter. */
  navigate(panelId: string): void;
  /** Live player options (`autoplay`, `muted`, `showToolbar`, …). */
  setOptions(options: Record<string, unknown>): void;
  /** The player's state snapshot (`pw:state`). */
  getState(): Promise<unknown>;
  /** Remove the player and the placeholder. */
  destroy(): void;
}

export interface PanelWaveEmbedApi {
  version: string;
  scan(root?: ParentNode): void;
  mount(el: HTMLElement): void;
  unmount(el: HTMLElement): void;
  get(el: HTMLElement): EmbedHandle | null;
}

const SELECTOR = '.panelwave-embed';
const STYLE_ID = 'pwe-styles';
/** Without a `pw:ready` (older player page, no bridge) the poster leaves after this. */
const READY_FALLBACK_MS = 8000;
const CSS =
  '.pwe-root{position:relative;display:block;width:100%;aspect-ratio:var(--pwe-aspect,16/9);background:#111;overflow:hidden}' +
  '.pwe-frame{position:absolute;inset:0;width:100%;height:100%;border:0;z-index:0}' +
  '.pwe-poster{position:absolute;inset:0;z-index:1;width:100%;height:100%;margin:0;padding:0;border:0;background:#111;color:#fff;font:inherit;cursor:pointer;display:block}' +
  '.pwe-poster img{width:100%;height:100%;object-fit:cover;display:block}' +
  '.pwe-play{position:absolute;left:50%;top:50%;width:64px;height:64px;margin:-32px 0 0 -32px;border-radius:50%;background:rgba(0,0,0,.6);box-shadow:0 0 0 2px #fff}' +
  '.pwe-play:after{content:"";position:absolute;left:26px;top:20px;border-style:solid;border-width:12px 0 12px 20px;border-color:transparent transparent transparent #fff}' +
  '.pwe-title{position:absolute;left:0;right:0;bottom:0;padding:12px 16px;text-align:left;background:linear-gradient(transparent,rgba(0,0,0,.75))}' +
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
  const target = inst.frame?.contentWindow;
  if (target && inst.origin) {
    try {
      target.postMessage(message, inst.origin);
    } catch {
      // the frame navigated away — nothing to tell it
    }
  }
}

function setup(el: HTMLElement): void {
  if (instances.has(el)) return;
  const result = readOptions((name) => el.getAttribute('data-' + name));
  if (!result.ok) {
    console.warn('PanelWave embed: ' + result.error, el);
    el.setAttribute('data-pwe-state', 'error');
    dispatch(el, 'error', { message: result.error });
    return;
  }
  const options = result.options;
  ensureStyles();
  listen();
  const isFirst = !firstAssigned;
  firstAssigned = true;

  el.classList.add('pwe-root');
  el.style.setProperty('--pwe-aspect', options.aspect);
  if (!el.hasAttribute('role')) el.setAttribute('role', 'region');
  if (!el.hasAttribute('aria-label')) el.setAttribute('aria-label', options.title || 'PanelWave chapter');

  const poster = document.createElement('button');
  poster.type = 'button';
  poster.className = 'pwe-poster';
  poster.setAttribute('aria-label', 'Play' + (options.title ? ': ' + options.title : ''));
  if (options.poster) {
    const img = document.createElement('img');
    img.src = options.poster;
    img.alt = '';
    img.loading = isFirst ? 'eager' : 'lazy';
    img.decoding = 'async';
    poster.appendChild(img);
  }
  if (options.title) {
    const title = document.createElement('span');
    title.className = 'pwe-title';
    title.textContent = options.title;
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
}

function mount(inst: Instance): void {
  if (inst.frame) return;
  const frame = document.createElement('iframe');
  frame.className = 'pwe-frame';
  frame.src = buildFrameUrl(inst.options, document.baseURI, window.location.origin);
  frame.title = inst.options.title || 'PanelWave chapter';
  frame.allow = 'autoplay; fullscreen';
  frame.setAttribute('allowfullscreen', '');
  frame.referrerPolicy = 'strict-origin-when-cross-origin';
  frame.addEventListener('load', () => {
    if (inst.frame !== frame || inst.state !== 'loading') return;
    // No bridge (opaque origin) or no answer: show the player anyway.
    if (!inst.origin) markReady(inst);
    else inst.readyTimer = setTimeout(() => inst.state === 'loading' && markReady(inst), READY_FALLBACK_MS);
  });
  inst.frame = frame;
  setState(inst, 'loading');
  inst.el.appendChild(frame);
  dispatch(inst.el, 'mount', { chapter: inst.options.chapter });
  enforceMaxLive();
}

function markReady(inst: Instance): void {
  if (inst.readyTimer) clearTimeout(inst.readyTimer);
  inst.readyTimer = undefined;
  setState(inst, 'ready');
  applyAudio(inst);
}

function unmount(inst: Instance): void {
  if (!inst.frame) return;
  if (inst.readyTimer) clearTimeout(inst.readyTimer);
  inst.frame.remove();
  inst.frame = undefined;
  inst.mutedByLoader = false;
  for (const waiter of inst.stateWaiters.splice(0)) waiter(null);
  setState(inst, 'poster');
  dispatch(inst.el, 'unmount', { chapter: inst.options.chapter });
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

function onMessage(event: MessageEvent): void {
  if (!isPlayerMessage(event.data)) return;
  for (const inst of instances.values()) {
    if (!inst.frame || event.source !== inst.frame.contentWindow) continue;
    if (!inst.origin || event.origin !== inst.origin) return;
    handle(inst, event.data);
    return;
  }
}

function handle(inst: Instance, message: PlayerMessage): void {
  switch (message.type) {
    case 'pw:hello':
      if (gestureSeen) post(inst, { type: 'hostGesture' });
      break;
    case 'pw:ready':
      markReady(inst);
      break;
    case 'pw:event': {
      const name = typeof message.name === 'string' ? message.name : 'event';
      if (name === 'chapterComplete') inst.complete = true;
      dispatch(inst.el, name, message.data);
      break;
    }
    case 'pw:state':
      for (const waiter of inst.stateWaiters.splice(0)) waiter(message.data);
      break;
  }
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
        if (!inst.frame || !inst.origin) {
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

function destroy(inst: Instance): void {
  unmount(inst);
  nearObserver?.unobserve(inst.el);
  viewObserver?.unobserve(inst.el);
  inst.poster.remove();
  inst.el.classList.remove('pwe-root');
  inst.el.removeAttribute('data-pwe-state');
  instances.delete(inst.el);
}

function scan(root: ParentNode = document): void {
  root.querySelectorAll<HTMLElement>(SELECTOR).forEach((el) => setup(el));
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

declare global {
  interface Window {
    PanelWaveEmbed?: PanelWaveEmbedApi;
  }
}

if (typeof window !== 'undefined' && typeof document !== 'undefined') {
  // Loaded twice (two script tags): the first copy keeps the page.
  const existing = window.PanelWaveEmbed;
  if (!existing) window.PanelWaveEmbed = api;
  const start = (): void => (existing ?? api).scan();
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start, { once: true });
  else start();
}
