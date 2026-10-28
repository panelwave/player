/**
 * Manifest for the timed-balloon E2E tests (schema 1.10 `SpeechBubble.showAtMs`).
 *
 * - pTalk: image panel. `b-now` shows with the panel, `b-later` 1.5 s after
 *   the panel is shown.
 * - pClip: video panel with an on-click video (it never autoplays, so the
 *   test decides when "playback" starts). `b-clip-now` shows at once,
 *   `b-clip` 0.8 s after the video starts playing.
 */
const image = (id: string, picsum: number) => ({
  id,
  category: 'image',
  alt: { 'en-US': id },
  variants: [{ src: `https://picsum.photos/id/${picsum}/1280/720`, w: 1280, h: 720, mime: 'image/jpeg' }],
});

const balloon = (id: string, text: string, x: number, showAtMs?: number) => ({
  id,
  text: { 'en-US': text, 'de-DE': `${text} (DE)` },
  shape: { x, y: 0.08, w: 0.3, h: 0.18 },
  ...(showAtMs !== undefined ? { showAtMs } : {}),
});

export const bubbleTimingManifest = {
  panelwave: {
    version: '1.10.0',
    schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
    generator: 'panelwave-e2e/1.0',
  },
  meta: {
    id: 'work-e2e-bubble-timing',
    title: { 'en-US': 'Timed balloons E2E' },
    locales: ['en-US', 'de-DE'],
    default_locale: 'en-US',
  },
  assets: {
    catalog: [
      image('img-talk', 1060),
      {
        id: 'vid-clip',
        category: 'video',
        durationMs: 2000,
        alt: { 'en-US': 'Test clip' },
        poster: { src: 'assets/video/video-demo-a-poster.jpg', w: 160, h: 90 },
        variants: [{ src: 'assets/video/video-demo-a.mp4', w: 160, h: 90, fps: 12 }],
      },
    ],
  },
  chapters: [
    {
      id: 'ch-e2e-timing',
      title: { 'en-US': 'Chapter' },
      panels: {
        pTalk: {
          title: { 'en-US': 'Two speakers' },
          layers: [{ kind: 'image', id: 'ly-pTalk-bg', assetId: 'img-talk', z: 0 }],
          speechBubbles: [balloon('b-now', 'You came back.', 0.6), balloon('b-later', 'I never left.', 0.08, 1500)],
        },
        pClip: {
          title: { 'en-US': 'Dialogue on a clip' },
          layers: [
            { kind: 'video', id: 'ly-pClip-bg', assetId: 'vid-clip', z: 0, muted: true, playMode: 'once', startMode: 'on-click' },
          ],
          speechBubbles: [balloon('b-clip-now', 'Watch this.', 0.6), balloon('b-clip', 'Wow.', 0.08, 800)],
        },
      },
      graph: { entry: 'pTalk', edges: [{ from: 'pTalk', to: 'pClip' }] },
    },
  ],
};
