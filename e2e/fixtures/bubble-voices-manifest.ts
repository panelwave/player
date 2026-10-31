/**
 * Manifest for the spoken-lines E2E tests (format 1.12: `SpeechBubble.audioAssetId`
 * with one `AudioVariant` per locale, the reader's Voices toggle).
 *
 * - pGate: two voiced balloons; `b-now` shows with the panel, `b-later`
 *   1.2 s after it. Both lines exist in en-US and de-DE.
 * - pHall: one voiced balloon with a language-neutral line.
 * - pQuiet: a balloon without a line.
 *
 * The audio is a tiny silent WAV data URI, so no file is fetched; the specs
 * stub `HTMLMediaElement.play` and fire `ended` themselves.
 */

/** 0.1 s of silence, 8 kHz mono 16-bit PCM, as a data URI. */
function silentWav(tag: string): string {
  const samples = 800;
  const data = new Uint8Array(44 + samples * 2);
  const view = new DataView(data.buffer);
  const str = (offset: number, s: string) => [...s].forEach((c, i) => view.setUint8(offset + i, c.charCodeAt(0)));
  str(0, 'RIFF');
  view.setUint32(4, 36 + samples * 2, true);
  str(8, 'WAVEfmt ');
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  str(36, 'data');
  view.setUint32(40, samples * 2, true);
  // The tag lands in the (silent) sample data so each line has a distinct URL.
  str(44, tag.slice(0, 16));
  return `data:audio/wav;base64,${Buffer.from(data).toString('base64')}`;
}

export const VOICE_SRC = {
  nowEn: silentWav('now-en'),
  nowDe: silentWav('now-de'),
  laterEn: silentWav('later-en'),
  laterDe: silentWav('later-de'),
  hall: silentWav('hall'),
};

const image = (id: string, picsum: number) => ({
  id,
  category: 'image',
  alt: { 'en-US': id },
  variants: [{ src: `https://picsum.photos/id/${picsum}/1280/720`, w: 1280, h: 720, mime: 'image/jpeg' }],
});

const balloon = (id: string, text: string, x: number, audioAssetId?: string, showAtMs?: number) => ({
  id,
  text: { 'en-US': text, 'de-DE': `${text} (DE)` },
  shape: { x, y: 0.08, w: 0.3, h: 0.18 },
  ...(audioAssetId ? { audioAssetId } : {}),
  ...(showAtMs !== undefined ? { showAtMs } : {}),
});

export function bubbleVoicesManifest(options: { voicesDefault?: boolean } = {}) {
  return {
    panelwave: {
      version: '1.12.0',
      schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
      generator: 'panelwave-e2e/1.0',
    },
    meta: {
      id: 'work-e2e-bubble-voices',
      title: { 'en-US': 'Spoken lines E2E' },
      locales: ['en-US', 'de-DE'],
      default_locale: 'en-US',
    },
    settings: {
      ui: options.voicesDefault === undefined ? {} : { voicesDefault: options.voicesDefault },
    },
    assets: {
      catalog: [
        image('img-gate', 1060),
        image('img-hall', 1062),
        image('img-quiet', 1064),
        {
          id: 'voice-now',
          category: 'audio',
          role: 'voiceover',
          variants: [
            { src: VOICE_SRC.nowEn, mime: 'audio/wav', locale: 'en-US' },
            { src: VOICE_SRC.nowDe, mime: 'audio/wav', locale: 'de-DE' },
          ],
        },
        {
          id: 'voice-later',
          category: 'audio',
          role: 'voiceover',
          variants: [
            { src: VOICE_SRC.laterEn, mime: 'audio/wav', locale: 'en-US' },
            { src: VOICE_SRC.laterDe, mime: 'audio/wav', locale: 'de-DE' },
          ],
        },
        { id: 'voice-hall', category: 'audio', role: 'voiceover', variants: [{ src: VOICE_SRC.hall, mime: 'audio/wav' }] },
      ],
    },
    chapters: [
      {
        id: 'ch-e2e-voices',
        title: { 'en-US': 'Chapter' },
        panels: {
          pGate: {
            title: { 'en-US': 'Gate' },
            layers: [{ kind: 'image', id: 'ly-pGate-bg', assetId: 'img-gate', z: 0 }],
            speechBubbles: [balloon('b-now', 'Open it. Now.', 0.6, 'voice-now'), balloon('b-later', "I can't.", 0.08, 'voice-later', 1200)],
          },
          pHall: {
            title: { 'en-US': 'Hall' },
            layers: [{ kind: 'image', id: 'ly-pHall-bg', assetId: 'img-hall', z: 0 }],
            speechBubbles: [balloon('b-hall', 'Where is he?', 0.1, 'voice-hall')],
          },
          pQuiet: {
            title: { 'en-US': 'Quiet' },
            layers: [{ kind: 'image', id: 'ly-pQuiet-bg', assetId: 'img-quiet', z: 0 }],
            speechBubbles: [balloon('b-quiet', '…', 0.1)],
          },
        },
        graph: {
          entry: 'pGate',
          edges: [
            { from: 'pGate', to: 'pHall', transition: { type: 'none' } },
            { from: 'pHall', to: 'pQuiet', transition: { type: 'none' } },
          ],
        },
      },
    ],
  };
}
