# Content widget layers and the widget theme

Format 1.10 adds five layer kinds that are reader-facing UI instead of
artwork. The player draws them with the work's theme (`ui.theme`), so a
work's downloads, players and text boxes look alike on every panel and every
screen. The design and the CMS side are in the CMS repo
(`panelwave-cms/docs/improvements/content-widget-layers.md`); the format is in
the schema README ("Content Widget Layers").

| `kind` | Component | Reader sees |
|---|---|---|
| `download` | `pw-download-layer` | A file card: type badge (PDF, DOCX, XLSX, PPTX, …), localized name, size, optional description. Activating it downloads the `file` catalog asset. |
| `audioPlayer` | `pw-audio-player-layer` | Play/pause, the asset's `waveform` peaks (or a progress bar), position / duration; click or drag in the waveform to seek, ←/→ 5 s, PageUp/PageDown 30 s, Home/End. |
| `videoPlayer` | `pw-video-player-layer` + `pw-video-modal` | The poster with a play badge, title and duration (or a button). Opens a modal player: play/pause, scrub bar with buffered range, time, mute, fullscreen. |
| `scrollText` | `pw-scroll-text-layer` | Longer text scrolling in its box, plain or the safe Markdown subset; fades at the edges; links open in a new tab. |
| `iframe` | `pw-iframe-layer` | An embedded https page in a card with its title and "Open in new tab". |

## Placement and size

Widgets sit at `x` / `y` / `width` / `height` in the panel's layer reference
space like any layer (`utils/layer-reference.ts`). The layer renderer makes
the box a size container named `pw-widget` and sets `--pw-widget-font`: 18
reference px, i.e. it scales with the panel, clamped to 11–20 CSS px. Inside a
widget everything is sized in `em`, so a widget stays readable on a phone and
does not balloon on a 4K screen. Narrow boxes switch to compact variants
through `@container pw-widget (max-width: …)` rules (download: icon + button;
audio: button + time).

## Interaction rules

- Clicks, presses, touches and plain wheel events stop at the widget box
  (`LayerRendererComponent.onWidgetGesture`): no tap-to-advance, no viewport
  pan or swipe, no canvas pointer capture, and the viewport's `touchmove`
  `preventDefault` cannot block a scroll box. Ctrl/Cmd + wheel still zooms.
- Keys pressed in a widget's key-using parts (`[data-pw-owns-keys]`: seek slider, scroll box; form fields) never trigger story shortcuts; Enter / Space stay with a focused widget button, other keys (the arrows after clicking Play) navigate.
- `WidgetPlaybackService` (one per shell) lets one audio/video widget play at
  a time, pauses the widgets on every panel change (`pauseForNavigation()`,
  also when their panel stays on screen: page view, canvas neighbours), and
  holds autoplay while a widget plays or the video modal is open — the
  advance happens once it stops.
- An audio player with `keepPlaying` is skipped on panel changes. When its
  panel leaves the screen (panel view, a page turn, a far canvas move) while
  it plays, the widget hands its `<audio>` element to the service (`park()`),
  which moves it into a hidden holder within the same task — so it plays on
  without a gap, still ducked and following the master mute — until it ends,
  another widget starts or the video modal opens. Mounting again, the widget
  takes it back (`unpark()`) and shows it playing.
- The audio player and the modal duck music and ambient to 20 %
  (`AudioEngineService.setRoleDuck`) and follow the reader's master mute.
  They play through their own `<audio>` / `<video>` element, not Web Audio,
  so the media need no CORS headers.
- `visibleIf` is evaluated for widget kinds (`isLayerVisible`).
- Iframes mount only while their panel is current (panel / canvas view) or on
  screen (page view) unless `lazy: false`.

## Security

- Iframe `src` must be https and not the player page's own origin
  (`checkIframeUrl`); otherwise the card shows a "blocked" note. The frame is
  created in code (Angular forbids `sandbox` / `allow` bindings, NG0910) with
  `sandbox` and `allow` set before `src`: presets `default` (scripts,
  same-origin, forms, popups), `strict` (scripts only), `none` (no attribute);
  `allow` is limited to fullscreen, autoplay, encrypted-media,
  picture-in-picture, clipboard-write; `referrerpolicy` is
  strict-origin-when-cross-origin.
- Scroll text Markdown is rendered escape-first (`utils/safe-markdown.ts`):
  headings (`#`/`##` → h2, `###` → h3, `####` → h4), paragraphs, bold, italic,
  inline code, lists and http(s)/mailto links. No raw HTML.
- Downloads: browsers ignore the `download` attribute for cross-origin URLs,
  so hosted works rely on the server sending `Content-Disposition: attachment`
  (the CMS signs file URLs that way). The attribute names same-origin
  downloads (self-hosted packages).

## Print renders

The standalone player's `print` option marks `<html class="pw-print">`
(`isPrintRender()`). Widgets then render a static card: the download card
without a link (with "Printed on page N" when the export appended the file),
the audio waveform without playback, the video poster, the scroll text shrunk
to fit its box (zoom down to 0.6, never below 7 pt) and clipped with a
"Continued in the digital edition" line when it still overflows, and the
iframe as a card with its URL. Nothing plays and no frame loads.

A widget with `print: "hide"` (schema 1.10) is left out; the artwork shows
through. The standalone config's `printOptions` (`PrintContextService`) sets
the rest:

| Option | Effect |
|---|---|
| `widgets` | `qr` (default): cards carry a QR code (`pw-print-qr`, black on white, labelled "Scan to listen" / "Scan to watch" / "Scan to download" / "Scan to open online" when there is room) that opens `linkBase?panel=<panel id>` — the panel in the online reader. `card`: no codes. `hide`: every widget is left out, whatever its own setting. |
| `linkBase` | The work's reader URL (http/https). Without it there are no codes. |
| `attachments` | Catalog file id → first page of that file appended to the printed document. |

## Theme

`ThemeService` (provided by `PlayerShellComponent`) resolves

    built-in defaults for `mode` → derived from `ui.branding` → `ui.theme` → `themeOverride`

and writes the result as custom properties into a zero-specificity rule
`:where([data-pw-theme="n"]) { … }` for the player instance. Any host rule
wins, e.g.

```css
pw-player-shell {
  --pw-theme-accent: #e11d48;
  --pw-theme-font-ui: 'Inter', system-ui, sans-serif;
}
```

| Property | From |
|---|---|
| `--pw-theme-surface`, `-on-surface`, `-surface-muted`, `-on-surface-muted` | `colors.*` (surface derived from `branding.primaryColor`, readable text derived) |
| `--pw-theme-accent`, `-on-accent` | `colors.accent` / `branding.accentColor` |
| `--pw-theme-border`, `-focus`, `-track`, `-progress`, `-waveform`, `-waveform-progress`, `-link`, `-backdrop` | `colors.*` |
| `--pw-theme-font-ui`, `--pw-theme-font-body` | `fonts.ui` / `fonts.body` (`family` + `fallback`) |
| `--pw-theme-radius`, `--pw-theme-border-width`, `--pw-theme-shadow` | `shape.*` |
| `--pw-theme-density` | `density` (`1` / `0.85`) |

`mode: auto` follows `prefers-color-scheme`. Fonts are not downloaded from
the manifest: the host page provides them (the reader and the standalone
package do), otherwise the fallback stack applies. A layer's
`themeOverrides` sets the colour properties on that widget only. The action
modal, hotspot choice buttons, the branch chooser and toasts use the same
tokens.

Live changes: the shell input `themeOverride`, the method
`setThemeOverride()`, or the embed protocol's `setTheme` (v3).

## Events

The shell's `widgetEvent` output carries `{ type, layerId, kind, panelId?,
assetId? }` with `type` `download`, `play`, `pause`, `ended`, `open`, `close`;
the embed bridge forwards it as `pw:event` `widgetEvent`. Analytics get
`download`, `widgetPlay` and `widgetOpen` (subject to
`tracking.eventWhitelist`).

## Demo and tests

- Demo work "Content Widgets": `projects/demo/src/assets/widgets-manifest.json`
  (`?manifest=assets/widgets-manifest.json`), media in `assets/widgets/`.
- Unit: `utils/widget-utils.spec.ts`, `utils/safe-markdown.spec.ts` (XSS
  vectors), `services/theme.service.spec.ts`,
  `services/widget-playback.service.spec.ts`,
  `components/layers/widgets/widgets.spec.ts`,
  `components/modals/video-modal/video-modal.component.spec.ts`,
  `components/player-shell/player-shell.widgets.spec.ts`, the renderer spec.
- E2E: `e2e/widgets.spec.ts` (download event, audio play + seek, modal
  open/close + focus return, scroll + link, iframe attributes, theme, axe,
  German texts).
