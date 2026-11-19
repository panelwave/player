# Embedding a PanelWave work — host SDK

One frame and one contract for any host page or app, whatever framework it
uses. The SDK (`panelwave-embed.js` 2.0, MIT, no dependencies, about 5.7 KB
gzipped) creates the frame, speaks the [embed protocol](EMBED_PROTOCOL.md)
with it and hands you typed events.

- Script: `https://read.panelwave.org/embed.js` (or `player/panelwave-embed.js`
  inside a self-hosting package), sets `window.PanelWave`.
- npm: `import { mount } from '@panelwave/player/embed'` (ES module with
  typings; nothing from Angular is loaded).
- Declarative markup (`<div class="panelwave-embed" data-src="…">`) keeps
  working: see [MULTI_CHAPTER_EMBED.md](MULTI_CHAPTER_EMBED.md).

## Mount

```html
<div id="comic"></div>
<script src="https://read.panelwave.org/embed.js"></script>
<script>
  const frame = PanelWave.mount(document.getElementById('comic'), {
    src: 'https://read.panelwave.org/studio-x/night-city', // or a package's index.html
    channel: 'peoplecomics',            // your channel key, if you are a PanelWave channel
    loading: 'click',                   // 'eager' (default) | 'lazy' | 'click'
    poster: { image: coverUrl, title: 'Night City', label: 'Read here' },
    privacy: { tracking: false },       // nothing is sent until you call setPrivacy
    purchaseUi: 'in_place',             // 'in_place' | 'link_out' | 'hidden'
    resume: savedPosition,              // { panelId, variables } from an earlier `progress`
  });

  frame.on('progress', (p) => localStorage.setItem('nc-pos', JSON.stringify({ panelId: p.panelId, variables: p.variables })));
  frame.on('paywallAction', (a) => console.log('the reader wants to buy', a));
</script>
```

| Option | Meaning |
|---|---|
| `src` | The reader URL of a work, or a package's `index.html` (relative URLs resolve against the page). |
| `chapter` | Show one chapter (CMS chapter uuid or manifest id). Without it: the whole work. |
| `channel` | Your channel key. read.panelwave.org counts reads per channel only when the work is live on your channel. |
| `locale` | Start language, e.g. `de-DE`. |
| `theme` | `light` or `dark`, sent once the player is ready. |
| `loading` | `eager` mounts at once; `lazy` when the box nears the viewport; `click` shows a poster built only from what you passed — no request reaches PanelWave before the tap. |
| `poster` | `{ image, title, label }` for `click` (and while a lazy frame loads). |
| `privacy.tracking` | `false`: privacy mode, no analytics leave the frame until `setPrivacy({ tracking: true })`. Absent: the work's own consent setting. |
| `purchaseUi` | `in_place` shows prices and options; `link_out` only a link to the work on its reader site; `hidden` "Not available in this app". App stores: `hidden` on iOS, `link_out` on Android. |
| `resume` | `{ panelId, variables? }`: continue there once the player is ready. |
| `autoplay`, `toolbar`, `cover`, `secondsPerPanel` | Player options as in the declarative form. |
| `aspect` | Box shape until the player reports its own (`resize`), e.g. `3/4`. |

## The handle

| Member | |
|---|---|
| `on(name, fn)` → unsubscribe, `off(name, fn)` | Events, see below. |
| `navigate(panelId)` | Jump to a panel. |
| `setLocale(locale)`, `setTheme('light' \| 'dark' \| theme)` | Live. |
| `setPrivacy({ tracking })` | Analytics on or off, e.g. after your consent banner. |
| `restore({ panelId, variables })` | Continue at a position. |
| `setOptions({ autoplay, muted, showToolbar, purchaseUi, … })` | Live player options. |
| `purchaseHandled(productId?)` | You took over a purchase after `paywallAction`. |
| `getState()` | Promise of the player's state snapshot. |
| `frame`, `transport` | The iframe, and `'port'` / `'window'` / `'none'`. |
| `destroy()` | Remove the frame and the poster. |

Events: `hello` (protocol and capabilities), `ready`, `mount`, `unmount`,
`panelChange`, `chapterChange`, `chapterComplete`, `locationChange`,
`variableChange`, `localeChange`, `paywallAction`, `ageVerified`,
`likeChange`, `bookmarkChange`, `widgetEvent`, `progress`, `resize`,
`fullscreenRequest`, `error`. Every event is also dispatched on the element as
a DOM event `panelwave:<name in lower case>`.

The SDK handles two of them itself: `resize` sets the box's aspect ratio and
minimum height, and `fullscreenRequest` (sent where the browser cannot go
fullscreen, e.g. in a WebView) makes the box fill the window.

## How it talks to the frame

Every frame gets a random `bridge` nonce in its URL. After the frame loads,
the SDK offers it a `MessagePort` with that nonce (`pw:connect`); a page with
protocol 4 accepts the first matching offer and from then on speaks only
over the port. This works for app hosts too, whose page origin
(`capacitor://localhost`, `ionic://localhost`) `postMessage` cannot target.
Older pages (protocol 1–3) ignore the offer and keep the origin-checked
`postMessage` path; `frame.transport` tells you which one is in use.

Frame attributes set by the SDK: `allow="autoplay; fullscreen"`,
`allowfullscreen`, `referrerpolicy="strict-origin-when-cross-origin"`.
Host CSP: `frame-src https://read.panelwave.org` (plus your package origin),
and `script-src https://read.panelwave.org` when you load the script from
there — or bundle it from npm.

## Angular

```ts
import { Component, ElementRef, OnDestroy, afterNextRender, input, viewChild } from '@angular/core';
import { mount, type PanelWaveFrame } from '@panelwave/player/embed';

@Component({ selector: 'app-comic', template: '<div #box></div>' })
export class ComicComponent implements OnDestroy {
  readonly src = input.required<string>();
  private readonly box = viewChild.required<ElementRef<HTMLElement>>('box');
  private frame?: PanelWaveFrame;

  constructor() {
    afterNextRender(() => {
      this.frame = mount(this.box().nativeElement, { src: this.src(), loading: 'lazy' });
      this.frame.on('progress', (p) => console.log(p));
    });
  }

  ngOnDestroy(): void {
    this.frame?.destroy();
  }
}
```

Hosts on Angular 21 or 22 that want the player in their own page, without a
frame, use the `<pw-player-shell>` component of `@panelwave/player` instead.

## React

```tsx
import { useEffect, useRef } from 'react';
import { mount } from '@panelwave/player/embed';

export function Comic({ src, onProgress }: { src: string; onProgress?: (p: unknown) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const frame = mount(box.current!, { src, loading: 'lazy' });
    const stop = onProgress ? frame.on('progress', onProgress) : undefined;
    return () => {
      stop?.();
      frame.destroy();
    };
  }, [src]);
  return <div ref={box} />;
}
```

## App hosts (Capacitor, WebView)

Use the SDK inside the app's web view as above. The port handshake carries
every message, `purchaseUi` follows the store rules, and `fullscreenRequest`
lets the SDK enlarge the frame where the WebView has no Fullscreen API.

## Not yet

Reader tokens (`getReaderToken`, `setReaderToken`), sign-in from the frame and
the checkout return come with PanelWave reader accounts.
