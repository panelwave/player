import { catalogSrc, extraFromBlock, extrasFromManifest, type AssetLookup, type CatalogLike } from './extras-utils';

describe('extras-utils', () => {
  const catalog: Record<string, CatalogLike> = {
    'img-1': { category: 'image', variants: [ { src: 'https://cdn/img-1-1280.webp', w: 1280 }, { src: 'https://cdn/img-1-320.webp', w: 320 } ] },
    'vid-1': {
      category: 'video',
      variants: [ { src: 'https://cdn/vid-1-rev.mp4', direction: 'reverse' }, { src: 'https://cdn/vid-1.mp4' } ],
      poster: { src: 'https://cdn/vid-1-poster.jpg' },
    },
    'aud-1': { category: 'audio', variants: [ { src: 'https://cdn/aud-1.mp3' } ] },
  };
  const lookup: AssetLookup = (id) => catalog[id] ?? null;

  it('catalogSrc picks the forward video variant and the width-appropriate image', () => {
    expect(catalogSrc(lookup, 'vid-1')).toBe('https://cdn/vid-1.mp4');
    expect(catalogSrc(lookup, 'img-1', 320)).toBe('https://cdn/img-1-320.webp');
    expect(catalogSrc(lookup, 'img-1')).toBe('https://cdn/img-1-1280.webp');
    expect(catalogSrc(lookup, 'missing')).toBe('');
    expect(catalogSrc(lookup, undefined)).toBe('');
  });

  it('an image block gets the full image as asset and a small thumbnail', () => {
    const e = extraFromBlock({ id: 'a', title: { 'en-US': 'Art' }, images: [ { assetId: 'img-1' } ] }, 'art', lookup);
    expect(e.mediaType).toBe('image');
    expect(e.asset).toBe('https://cdn/img-1-1280.webp');
    expect(e.thumbnail).toBe('https://cdn/img-1-320.webp');
    expect(e.gated).toBeFalse();
  });

  it('a video block plays the forward variant with its poster as thumbnail', () => {
    const e = extraFromBlock({ id: 'v', video: [ { assetId: 'vid-1' } ] }, 'bts', lookup);
    expect(e.mediaType).toBe('video');
    expect(e.asset).toBe('https://cdn/vid-1.mp4');
    expect(e.thumbnail).toBe('https://cdn/vid-1-poster.jpg');
  });

  it('an audio block resolves its track', () => {
    const e = extraFromBlock({ id: 'i', audio: [ { assetId: 'aud-1' } ] }, 'interview', lookup);
    expect(e.mediaType).toBe('audio');
    expect(e.asset).toBe('https://cdn/aud-1.mp3');
  });

  it('honours contentType and direct urls (pdf becomes a document link)', () => {
    const pdf = extraFromBlock({ id: 'p', contentType: 'pdf', url: 'https://x/doc.pdf' }, 'other', lookup);
    expect(pdf.mediaType).toBe('document');
    expect(pdf.asset).toBe('https://x/doc.pdf');
    const linked = extraFromBlock({ id: 'l', url: 'https://x/pic.png', thumbnail: 'img-1' }, 'art', lookup);
    expect(linked.mediaType).toBe('image');
    expect(linked.thumbnail).toBe('https://cdn/img-1-320.webp');
  });

  it('text-only and unresolvable image blocks render as text, never as a broken image', () => {
    expect(extraFromBlock({ id: 't', text: { 'en-US': 'About the author' } }, 'other', lookup).mediaType).toBe('document');
    const broken = extraFromBlock({ id: 'b', images: [ { assetId: 'missing' } ] }, 'art', lookup);
    expect(broken.mediaType).toBe('document');
    expect(broken.asset).toBeUndefined();
  });

  it('carries the gated flag', () => {
    expect(extraFromBlock({ id: 'g', gated: true, images: [ { assetId: 'img-1' } ] }, 'art', lookup).gated).toBeTrue();
  });

  it('flattens the keyed extras in viewer order and skips blocks without an id', () => {
    const list = extrasFromManifest({
      cover: { id: 'cover', images: [ { assetId: 'img-1' } ] },
      author_info: { id: 'author', text: { 'en-US': 'Bio' } },
      bonus_art: [ { id: 'art-1', images: [ { assetId: 'img-1' } ] }, { title: { 'en-US': 'no id' } } ],
      behind_the_scenes: [ { id: 'bts-1', video: [ { assetId: 'vid-1' } ] } ],
    }, lookup);
    expect(list.map((e) => `${e.type}:${e.id}:${e.mediaType}`)).toEqual([
      'cover:cover:image', 'other:author:document', 'art:art-1:image', 'bts:bts-1:video',
    ]);
    expect(extrasFromManifest(undefined, lookup)).toEqual([]);
  });
});
