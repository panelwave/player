# Balloon Renderer Sync (CMS → Player)

The ComicBalloon speech-balloon engine exists in two places, deliberately. Since
2026-09-27 the **CMS editor holds the master copy**: balloons are designed and
tested in the editor, and the player carries a byte-for-byte synced copy so the
reader and the CMS preview render balloons exactly like the editor.

| File | Master (edit here) | Synced copy in this repo |
|---|---|---|
| SVG renderer | `panelwave-cms/apps/cms-frontend/src/app/core/utils/comic-balloon.ts` | `projects/player/src/lib/utils/comic-balloon.ts` |
| Tail / geometry helpers | `panelwave-cms/apps/cms-frontend/src/app/core/utils/balloon-geometry.ts` | `projects/player/src/lib/utils/balloon-geometry.ts` |

Both synced files start with a `SYNCED FROM … — DO NOT EDIT HERE` banner.

**Player-owned (not synced):** `projects/player/src/lib/utils/balloon-config.ts`
(`DEFAULT_BALLOON_CONFIG`, `mergeBalloonConfig`, the render/tail option
converters) and the interfaces in `projects/player/src/lib/types` (aligned with
`@panelwave/types`). Keep their semantics aligned with the CMS's
`balloon-config.model.ts` by hand.

## Workflow for a rendering change

1. Edit the master files in `panelwave-cms` and test in the editor.
2. In `panelwave-cms`, run `npm run sync:balloon` (copies the files into the
   sibling `../panelwave-player` checkout). `npm run check:balloon` reports drift
   without copying.
3. Commit the synced copy in this repo, run `ng test player`, and release the
   player when due.
4. Refresh the CMS preview embed (`scripts/update-player-embed.ps1` in
   `panelwave-cms`).

Never fix balloon geometry in this repo directly: the next sync overwrites it.
