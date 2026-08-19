/**
 * Manifest for the variable-seeding E2E tests: manifest-defined variable
 * definitions drive panel variants.
 *
 * - `user.age` — number, GLOBAL scope, `readOnly`, `private`: only the
 *   host can supply it (initialVariables / entitlement context); the
 *   in-story "hack" hotspot and the settings UI must not change it.
 *   Panel pAge renders its violent base art only for age >= 16; the
 *   `var-younger` variant replaces it below that.
 * - `style.mode` — enum us|eu, SESSION scope, public (default `us`):
 *   editable by the reader in the settings modal's Variables tab.
 *   Panel pStyle's `var-eu` variant swaps the conflict-resolution art.
 */
export const variablesManifest = {
  panelwave: {
    version: '1.0.0',
    schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
    generator: 'panelwave-e2e/1.0',
  },
  meta: {
    id: 'work-e2e-variables',
    title: { 'en-US': 'Variables E2E' },
    locales: ['en-US'],
    default_locale: 'en-US',
  },
  variables: {
    definitions: [
      {
        id: 'user.age',
        description: 'Verified reader age from the host system',
        type: 'number',
        scope: 'global',
        visibility: 'private',
        readOnly: true,
        min: 0,
        max: 130,
      },
      {
        id: 'style.mode',
        description: 'Storytelling style',
        type: 'enum',
        enum: ['us', 'eu'],
        default: 'us',
        scope: 'session',
        visibility: 'public',
      },
    ],
  },
  assets: {
    catalog: [
      { id: 'img-violent', category: 'image', alt: { 'en-US': 'Confrontation.' },
        variants: [{ src: 'https://picsum.photos/id/1040/1280/720', w: 1280, h: 720, mime: 'image/jpeg' }] },
      { id: 'img-safe', category: 'image', alt: { 'en-US': 'Tense standoff, softened.' },
        variants: [{ src: 'https://picsum.photos/id/1041/1280/720', w: 1280, h: 720, mime: 'image/jpeg' }] },
      { id: 'img-us', category: 'image', alt: { 'en-US': 'Showdown.' },
        variants: [{ src: 'https://picsum.photos/id/1042/1280/720', w: 1280, h: 720, mime: 'image/jpeg' }] },
      { id: 'img-eu', category: 'image', alt: { 'en-US': 'Committee session.' },
        variants: [{ src: 'https://picsum.photos/id/1043/1280/720', w: 1280, h: 720, mime: 'image/jpeg' }] },
    ],
  },
  chapters: [
    {
      id: 'ch-e2e-vars',
      title: { 'en-US': 'Chapter' },
      pages: [
        {
          id: 'pg-vars',
          title: { 'en-US': 'Page 1' },
          layout: {
            format: 'bigscreen-landscape',
            canvasSize: { width: 3840, height: 2160 },
            placements: [
              { panelId: 'pAge', x: 0, y: 0, w: 0.5, h: 1 },
              { panelId: 'pStyle', x: 0.5, y: 0, w: 0.5, h: 1 },
            ],
          },
          readingOrder: ['pAge', 'pStyle'],
        },
      ],
      panels: {
        pAge: {
          title: { 'en-US': 'Confrontation' },
          layers: [{ kind: 'image', id: 'ly-violent', assetId: 'img-violent', z: 0 }],
          variants: [
            {
              id: 'var-younger',
              when: { '!': { '>=': [{ var: 'user.age' }, 16] } },
              overrides: {
                title: { 'en-US': 'Confrontation (softened)' },
                layers: [{ kind: 'image', id: 'ly-safe', assetId: 'img-safe', z: 0 }],
              },
            },
          ],
          hotspots: [
            {
              id: 'hs-hack-age',
              shape: { type: 'rect', x: 0.05, y: 0.05, w: 0.25, h: 0.25 },
              label: { 'en-US': 'Hack the age' },
              action: {
                type: 'setVariables',
                mutations: [{ op: 'set', var: 'user.age', value: 99 }],
              },
            },
          ],
        },
        pStyle: {
          title: { 'en-US': 'Resolution' },
          layers: [{ kind: 'image', id: 'ly-us', assetId: 'img-us', z: 0 }],
          variants: [
            {
              id: 'var-eu',
              when: { '==': [{ var: 'style.mode' }, 'eu'] },
              overrides: {
                title: { 'en-US': 'Resolution (committee)' },
                layers: [{ kind: 'image', id: 'ly-eu', assetId: 'img-eu', z: 0 }],
              },
            },
          ],
        },
      },
      graph: {
        entry: 'pAge',
        edges: [{ from: 'pAge', to: 'pStyle' }],
      },
    },
  ],
};
