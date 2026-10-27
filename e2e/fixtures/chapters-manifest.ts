/**
 * Three-chapter manifest for the chapter-embed E2E tests
 * (docs/MULTI_CHAPTER_EMBED.md). Panel view only (no pages), no cover.
 *
 * - c1: a1 → a2
 * - c2 (CMS uuid `7c1e0000-…-0002`): b1 → b2 → b3; b2 has a hotspot
 *   "Skip ahead" that jumps to c3's c3-1 (inert in a c2 chapter embed)
 * - c3: c3-1 → c3-2
 *
 * Layers are named `ly-<panelId>-bg` so `expectPanel` works.
 */
const panel = (id: string, extra: Record<string, unknown> = {}) => ({
  title: { 'en-US': id },
  durationMs: 1500,
  layers: [{ kind: 'image', id: `ly-${id}-bg`, assetId: `img-${id}`, z: 0 }],
  ...extra,
});

const ids = ['a1', 'a2', 'b1', 'b2', 'b3', 'c3-1', 'c3-2'];

export const C2_UUID = '7c1e0000-0000-4000-8000-000000000002';

export const chaptersManifest = {
  panelwave: {
    version: '1.9.0',
    schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
    generator: 'panelwave-e2e/1.0',
  },
  meta: {
    id: 'work-e2e-chapters',
    title: { 'en-US': 'Chapters E2E' },
    locales: ['en-US'],
    default_locale: 'en-US',
  },
  assets: {
    catalog: ids.map((id, i) => ({
      id: `img-${id}`,
      category: 'image',
      alt: { 'en-US': `Panel ${id}` },
      variants: [{ src: `https://picsum.photos/id/${1040 + i}/1280/720`, w: 1280, h: 720, mime: 'image/jpeg' }],
    })),
  },
  chapters: [
    {
      id: 'c1',
      title: { 'en-US': 'Chapter One' },
      panels: { a1: panel('a1'), a2: panel('a2') },
      graph: { entry: 'a1', edges: [{ from: 'a1', to: 'a2' }] },
    },
    {
      id: 'c2',
      chapterId: C2_UUID,
      title: { 'en-US': 'Chapter Two' },
      panels: {
        b1: panel('b1'),
        b2: panel('b2', {
          hotspots: [
            {
              id: 'hs-skip',
              shape: { type: 'rect', x: 0.6, y: 0.6, w: 0.3, h: 0.3 },
              label: { 'en-US': 'Skip ahead' },
              action: { type: 'goTo', to: 'c3-1' },
            },
          ],
        }),
        b3: panel('b3'),
      },
      graph: { entry: 'b1', edges: [{ from: 'b1', to: 'b2' }, { from: 'b2', to: 'b3' }] },
    },
    {
      id: 'c3',
      title: { 'en-US': 'Chapter Three' },
      panels: { 'c3-1': panel('c3-1'), 'c3-2': panel('c3-2') },
      graph: { entry: 'c3-1', edges: [{ from: 'c3-1', to: 'c3-2' }] },
    },
  ],
};
