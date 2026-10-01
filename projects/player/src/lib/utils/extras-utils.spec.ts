import { catalogSrc, extraFromBlock, extrasFromManifest, sheetCharacterIds, type AssetLookup, type CatalogLike } from './extras-utils';

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

  it('an image extra linked by url only (CMS export) is its own thumbnail', () => {
    const cover = extraFromBlock({ id: 'c', contentType: 'image', url: 'https://s3/cover.jpg' }, 'cover', lookup);
    expect(cover.asset).toBe('https://s3/cover.jpg');
    expect(cover.thumbnail).toBe('https://s3/cover.jpg');
    const pdf = extraFromBlock({ id: 'p', contentType: 'pdf', url: 'https://x/doc.pdf' }, 'other', lookup);
    expect(pdf.thumbnail).toBeUndefined();
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

  it('lists every alternative cover: single block or array form (schema 1.6)', () => {
    const single = extrasFromManifest({ alt_cover: { id: 'alt-a', images: [ { assetId: 'img-1' } ] } }, lookup);
    expect(single.map((e) => `${e.type}:${e.id}`)).toEqual([ 'cover:alt-a' ]);

    const several = extrasFromManifest({
      cover: { id: 'cover', images: [ { assetId: 'img-1' } ] },
      alt_cover: [
        { id: 'alt-a', images: [ { assetId: 'img-1' } ] },
        { id: 'alt-b', images: [ { assetId: 'img-1' } ] },
      ],
    }, lookup);
    expect(several.map((e) => `${e.type}:${e.id}`)).toEqual([ 'cover:cover', 'cover:alt-a', 'cover:alt-b' ]);
  });

  describe('character sheets', () => {
    const names: Record<string, { 'en-US': string }> = {
      ferdl: { 'en-US': 'Ferdl' },
      lena: { 'en-US': 'Lena' },
    };
    const characterName = (id: string) => names[id];

    it('sheetCharacterIds prefers characterIds over characterId and de-duplicates', () => {
      expect(sheetCharacterIds({ characterId: 'ferdl' })).toEqual([ 'ferdl' ]);
      expect(sheetCharacterIds({ characterId: 'ferdl', characterIds: [ 'ferdl', 'lena', 'ferdl' ] })).toEqual([ 'ferdl', 'lena' ]);
      expect(sheetCharacterIds({ characterIds: [] , characterId: 'lena' })).toEqual([ 'lena' ]);
      expect(sheetCharacterIds({})).toEqual([]);
    });

    it('carries the names of the characters an (ensemble) sheet shows', () => {
      const list = extrasFromManifest({
        character_sheets: [
          { id: 'solo', characterId: 'ferdl', images: [ { assetId: 'img-1' } ] },
          { id: 'cast', characterId: 'ferdl', characterIds: [ 'ferdl', 'lena', 'unknown' ], images: [ { assetId: 'img-1' } ] },
        ],
      }, lookup, characterName);
      expect(list[0].characters).toEqual([ { 'en-US': 'Ferdl' } ]);
      // Unknown ids are skipped instead of showing a raw id.
      expect(list[1].characters).toEqual([ { 'en-US': 'Ferdl' }, { 'en-US': 'Lena' } ]);
    });

    it('omits characters when no name lookup is given', () => {
      const [ sheet ] = extrasFromManifest({ character_sheets: [ { id: 'solo', characterId: 'ferdl' } ] }, lookup);
      expect(sheet.characters).toBeUndefined();
    });
  });
});
