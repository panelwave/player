import type { Panel, PanelWaveManifest } from '../types';
import type { CatalogLike } from './extras-utils';
import { coverImageSrc, panelThumbnailSrc } from './thumbnail-utils';

const catalog: Record<string, CatalogLike> = {
  bg: {
    category: 'image',
    variants: [
      { src: 'https://cdn/bg-1920.webp', w: 1920 },
      { src: 'https://cdn/bg-400.webp', w: 400 },
      { src: 'https://cdn/bg-640.webp', w: 640 },
    ],
  },
  fg: { category: 'image', variants: [{ src: 'https://cdn/fg.webp', w: 800 }] },
  vid: { category: 'video', variants: [{ src: 'https://cdn/v.mp4' }], poster: { src: 'https://cdn/v-poster.jpg' } },
  cover: { category: 'image', variants: [{ src: 'https://cdn/cover-2560.jpg', w: 2560 }, { src: 'https://cdn/cover-400.jpg', w: 400 }] },
};
const lookup = (id: string): CatalogLike | null => catalog[id] ?? null;

const panel = (layers: unknown[], extra: Record<string, unknown> = {}): Panel =>
  ({ layers, ...extra }) as unknown as Panel;

describe('thumbnail-utils', () => {
  describe('panelThumbnailSrc', () => {
    it('uses the bottom-most image layer, at the smallest rendition covering the width', () => {
      const p = panel([
        { id: 'a', kind: 'image', z: 2, assetId: 'fg' },
        { id: 'b', kind: 'image', z: 0, assetId: 'bg' },
      ]);
      expect(panelThumbnailSrc(p, lookup)).toBe('https://cdn/bg-400.webp');
      expect(panelThumbnailSrc(p, lookup, 600)).toBe('https://cdn/bg-640.webp');
    });

    it('skips hidden layers and unknown assets', () => {
      const p = panel([
        { id: 'a', kind: 'image', z: 0, assetId: 'bg', visible: false },
        { id: 'b', kind: 'image', z: 1, assetId: 'nope' },
        { id: 'c', kind: 'image', z: 2, assetId: 'fg' },
      ]);
      expect(panelThumbnailSrc(p, lookup)).toBe('https://cdn/fg.webp');
    });

    it('prefers an explicit thumbnail (asset id or link)', () => {
      expect(panelThumbnailSrc(panel([{ id: 'a', kind: 'image', assetId: 'bg' }], { thumbnail: 'thumbs/x.png' }), lookup)).toBe('thumbs/x.png');
      expect(panelThumbnailSrc(panel([], { thumbnail: 'fg' }), lookup)).toBe('https://cdn/fg.webp');
    });

    it('falls back to a video poster, else nothing', () => {
      expect(panelThumbnailSrc(panel([{ id: 'v', kind: 'video', assetId: 'vid' }]), lookup)).toBe('https://cdn/v-poster.jpg');
      expect(panelThumbnailSrc(panel([{ id: 't', kind: 'text' }]), lookup)).toBe('');
      expect(panelThumbnailSrc(undefined, lookup)).toBe('');
    });
  });

  describe('coverImageSrc', () => {
    const manifest = (meta: Record<string, unknown>, extras?: Record<string, unknown>): PanelWaveManifest =>
      ({ meta, extras, chapters: [] }) as unknown as PanelWaveManifest;

    it('resolves meta.cover through the catalog', () => {
      expect(coverImageSrc(manifest({ cover: 'cover' }), lookup, 2000)).toBe('https://cdn/cover-2560.jpg');
      expect(coverImageSrc(manifest({ cover: 'cover' }), lookup, 320)).toBe('https://cdn/cover-400.jpg');
    });

    it('falls back to the extras cover block when meta.cover is not in the catalog (CMS export)', () => {
      const m = manifest({ cover: 'sha256-unknown' }, { cover: { id: 'c', url: 'https://s3/tarmac_cover.jpg', contentType: 'image' } });
      expect(coverImageSrc(m, lookup)).toBe('https://s3/tarmac_cover.jpg');
      expect(coverImageSrc(manifest({}, { cover: { id: 'c', images: [{ assetId: 'cover' }] } }), lookup, 320)).toBe(
        'https://cdn/cover-400.jpg'
      );
    });

    it('takes a meta.cover link as is, never a gated cover block', () => {
      expect(coverImageSrc(manifest({ cover: 'https://x/c.png' }), lookup)).toBe('https://x/c.png');
      expect(coverImageSrc(manifest({}, { cover: { id: 'c', url: 'https://x/c.png', gated: true } }), lookup)).toBe('');
      expect(coverImageSrc(manifest({}), lookup)).toBe('');
      expect(coverImageSrc(null, lookup)).toBe('');
    });
  });
});
