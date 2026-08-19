/**
 * Minimal manifest for the conditional-content E2E tests: a hotspot
 * mutation (setVariables) flips both JSON-Logic `visibleIf` conditions
 * AND a panel-level variant.
 *
 * Panel `pA` starts with only "Take the lantern" visible. Activating it
 * sets `hasLantern = true` (session scope), which (a) hides that hotspot
 * and reveals "Use the lantern" (visibleIf), and (b) applies the
 * `var-lit` variant, replacing the panel's layers (the variant does not
 * override `hotspots`, so the base hotspots stay). "Use the lantern"
 * goes to `pB`.
 */
export const conditionalManifest = {
  panelwave: {
    version: '1.0.0',
    schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
    generator: 'panelwave-e2e/1.0',
  },
  meta: {
    id: 'work-e2e-conditional',
    title: { 'en-US': 'Conditional Content E2E' },
    locales: ['en-US'],
    default_locale: 'en-US',
  },
  assets: {
    catalog: [
      {
        id: 'img-a',
        category: 'image',
        alt: { 'en-US': 'Dark room.' },
        variants: [
          { src: 'https://picsum.photos/id/1031/1280/720', w: 1280, h: 720, mime: 'image/jpeg' },
        ],
      },
      {
        id: 'img-b',
        category: 'image',
        alt: { 'en-US': 'Lit corridor.' },
        variants: [
          { src: 'https://picsum.photos/id/1032/1280/720', w: 1280, h: 720, mime: 'image/jpeg' },
        ],
      },
    ],
  },
  chapters: [
    {
      id: 'ch-e2e',
      title: { 'en-US': 'Chapter' },
      pages: [
        {
          id: 'pg-e2e',
          title: { 'en-US': 'Page 1' },
          layout: {
            format: 'bigscreen-landscape',
            canvasSize: { width: 3840, height: 2160 },
            placements: [
              { panelId: 'pA', x: 0, y: 0, w: 0.5, h: 1 },
              { panelId: 'pB', x: 0.5, y: 0, w: 0.5, h: 1 },
            ],
          },
          readingOrder: ['pA', 'pB'],
        },
      ],
      panels: {
        pA: {
          title: { 'en-US': 'Dark Room' },
          layers: [{ kind: 'image', id: 'ly-pA-bg', assetId: 'img-a', z: 0 }],
          variants: [
            {
              id: 'var-lit',
              when: { '==': [{ var: 'hasLantern' }, true] },
              overrides: {
                title: { 'en-US': 'Lit Room' },
                layers: [{ kind: 'image', id: 'ly-pA-lit', assetId: 'img-b', z: 0 }],
              },
            },
          ],
          hotspots: [
            {
              id: 'hs-take',
              shape: { type: 'rect', x: 0.1, y: 0.1, w: 0.3, h: 0.3 },
              label: { 'en-US': 'Take the lantern' },
              visibleIf: { '!': { var: 'hasLantern' } },
              action: {
                type: 'setVariables',
                mutations: [{ op: 'set', var: 'hasLantern', value: true }],
              },
            },
            {
              id: 'hs-use',
              shape: { type: 'rect', x: 0.6, y: 0.6, w: 0.3, h: 0.3 },
              label: { 'en-US': 'Use the lantern' },
              visibleIf: { '==': [{ var: 'hasLantern' }, true] },
              action: { type: 'goTo', to: 'pB' },
            },
          ],
        },
        pB: {
          title: { 'en-US': 'Lit Corridor' },
          layers: [{ kind: 'image', id: 'ly-pB-bg', assetId: 'img-b', z: 0 }],
        },
      },
      graph: {
        entry: 'pA',
        edges: [{ from: 'pA', to: 'pB' }],
      },
    },
  ],
};
