# Balloon Renderer Sync (Player ↔ CMS)

The ComicBalloon speech-balloon renderer exists twice in the PanelWave
ecosystem, deliberately:

| Concern | Player (this repo, **canonical**) | CMS (canvas fork) |
|---|---|---|
| SVG renderer | `projects/player/src/lib/utils/comic-balloon.ts` | `apps/cms-frontend/src/app/core/utils/comic-balloon.ts` |
| Config model / merge / converters | `projects/player/src/lib/utils/balloon-config.ts` (+ interfaces in `src/lib/types`) | `apps/cms-frontend/src/app/core/models/balloon-config.model.ts` |

Per project convention ("change rendering behavior in the player, not by
forking it into the CMS"), the player is the canonical renderer. The CMS fork
exists because the editor draws balloons with **Canvas 2D `Path2D`** (via the
public `createSquirclePath` / `createThoughtBalloonPath` / `createShoutBalloonPath`
methods) instead of SVG, and additionally auto-sizes bubbles by running this
same renderer headless (its `BalloonMeasurementService`). Any divergence in
the *geometry* between the two copies is therefore a WYSIWYG bug.

## Policy

- **Rendering/geometry changes land in the player first**, then get ported to
  the CMS fork **in the same change set** (path formulas, the superellipse
  exponent `n = 2 + (1 - cornerRadius) * 3`, tail math, padding, dash
  patterns, hideBorder behavior, default values in `DEFAULT_BALLOON_CONFIG`,
  `mergeBalloonConfig`, `balloonConfigToRenderOptions` / `balloonConfigToTailOptions`).
- **Editor-only surface stays in the CMS** and must not be ported here:
  `BALLOON_FONTS` / `getBalloonFontGroups` (UI font registry),
  `diffBalloonConfig`, `normalizeBalloonOverride` (override-diff editing), and
  the CMS's shared tail-drag math (`core/utils/balloon-geometry.ts`).
- **Player-only surface:** interface definitions live in
  `projects/player/src/lib/types` (aligned with `@panelwave/types`) rather than
  in the utils file; stylistic/lint differences are fine.

## How to check for drift

From the player repo root (umbrella workspace layout):

```powershell
git diff --no-index `
  ../panelwave-cms/apps/cms-frontend/src/app/core/utils/comic-balloon.ts `
  projects/player/src/lib/utils/comic-balloon.ts

git diff --no-index `
  ../panelwave-cms/apps/cms-frontend/src/app/core/models/balloon-config.model.ts `
  projects/player/src/lib/utils/balloon-config.ts
```

Classify every hunk as **geometry** (must be identical — port it),
**editor-only** (leave in CMS), or **organizational/stylistic** (fine).

## Last audit: 2026-07-02

Result: **no geometry drift.**

- `comic-balloon.ts`: differences are lint-level (explicit types vs inferred,
  `self` alias vs arrow-function `this`) plus the player's removal of the
  CMS's `textExtraPad` block — verified dead code in the CMS (computed, never
  read).
- `balloon-config`: the player imports its interfaces from `../types` instead
  of declaring them inline, and correctly omits the CMS editor-only utilities
  listed above. `DEFAULT_BALLOON_CONFIG`, `mergeBalloonConfig` and both
  converter functions are semantically identical (only TS parameter/return
  typing differs).
