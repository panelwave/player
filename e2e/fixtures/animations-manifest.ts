/**
 * Manifest for the panel-animation E2E tests (schema `PanelAnimations`).
 *
 * - pSlide: layer keyframes. The hero layer (its own opacity 0.8, never
 *   animated) slides in from outside the panel's left edge and the caption
 *   layer fades in — the slide must be clipped by the panel box.
 * - pCamera: a camera move only — push-in from the whole panel to its
 *   bottom-right quarter.
 * - pBoth: keyframes and a camera move on one timeline, plus a hotspot that
 *   moves with the camera.
 * - pStill: no animation (control).
 *
 * Durations are short so the end state is reached quickly; assertions are
 * made on the end state (or on "changed since the start"), never on a
 * wall-clock midpoint.
 */
const image = (id: string, picsum: number) => ({
  id,
  category: 'image',
  alt: { 'en-US': id },
  variants: [{ src: `https://picsum.photos/id/${picsum}/1280/720`, w: 1280, h: 720, mime: 'image/jpeg' }],
});

export const animationsManifest = {
  panelwave: {
    version: '1.6.0',
    schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
    generator: 'panelwave-e2e/1.0',
  },
  meta: {
    id: 'work-e2e-animations',
    title: { 'en-US': 'Animations E2E' },
    locales: ['en-US'],
    default_locale: 'en-US',
  },
  assets: {
    catalog: [image('img-slide', 1050), image('img-hero', 1051), image('img-camera', 1052), image('img-both', 1053), image('img-still', 1054)],
  },
  chapters: [
    {
      id: 'ch-e2e-anim',
      title: { 'en-US': 'Chapter' },
      pages: [
        {
          id: 'pg-anim',
          title: { 'en-US': 'Page 1' },
          layout: {
            format: 'bigscreen-landscape',
            canvasSize: { width: 3840, height: 2160 },
            placements: [
              { panelId: 'pSlide', x: 0, y: 0, w: 0.5, h: 0.5 },
              { panelId: 'pCamera', x: 0.5, y: 0, w: 0.5, h: 0.5 },
              { panelId: 'pBoth', x: 0, y: 0.5, w: 0.5, h: 0.5 },
              { panelId: 'pStill', x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
            ],
          },
          readingOrder: ['pSlide', 'pCamera', 'pBoth', 'pStill'],
        },
      ],
      panels: {
        pSlide: {
          title: { 'en-US': 'Slide in' },
          layers: [
            { kind: 'image', id: 'ly-pSlide-bg', assetId: 'img-slide', z: 0 },
            { kind: 'image', id: 'ly-hero', assetId: 'img-hero', z: 1, opacity: 0.8 },
            { kind: 'image', id: 'ly-caption', assetId: 'img-hero', z: 2 },
          ],
          animations: {
            name: 'Hero entrance',
            durationMs: 600,
            keyframes: [
              { layerId: 'ly-hero', property: 'transform.x', timeMs: 0, value: -1, easing: 'ease-out' },
              { layerId: 'ly-hero', property: 'transform.x', timeMs: 600, value: 0 },
              { layerId: 'ly-caption', property: 'opacity', timeMs: 0, value: 0 },
              { layerId: 'ly-caption', property: 'opacity', timeMs: 400, value: 1 },
            ],
          },
        },
        pCamera: {
          title: { 'en-US': 'Push in' },
          layers: [{ kind: 'image', id: 'ly-pCamera-bg', assetId: 'img-camera', z: 0 }],
          animations: {
            startViewportRect: { x: 0, y: 0, w: 1, h: 1 },
            endViewportRect: { x: 0.5, y: 0.5, w: 0.5, h: 0.5 },
            durationMs: 600,
            easing: 'ease-in-out',
          },
        },
        pBoth: {
          title: { 'en-US': 'Both' },
          layers: [{ kind: 'image', id: 'ly-pBoth-bg', assetId: 'img-both', z: 0 }],
          hotspots: [
            {
              id: 'hs-corner',
              shape: { type: 'rect', x: 0, y: 0, w: 0.25, h: 0.25 },
              label: { 'en-US': 'Corner detail' },
              action: { type: 'goTo', to: 'pStill' },
            },
          ],
          animations: {
            endViewportRect: { x: 0, y: 0, w: 0.5, h: 0.5 },
            durationMs: 600,
            keyframes: [
              { layerId: 'ly-pBoth-bg', property: 'saturate', timeMs: 0, value: 0 },
              { layerId: 'ly-pBoth-bg', property: 'saturate', timeMs: 600, value: 1 },
            ],
          },
        },
        pStill: {
          title: { 'en-US': 'Still' },
          layers: [{ kind: 'image', id: 'ly-pStill-bg', assetId: 'img-still', z: 0 }],
        },
      },
      graph: {
        entry: 'pSlide',
        edges: [
          { from: 'pSlide', to: 'pCamera' },
          { from: 'pCamera', to: 'pBoth' },
          { from: 'pBoth', to: 'pStill' },
        ],
      },
    },
  ],
};
