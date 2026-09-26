/**
 * Map the manifest's keyed `extras` blocks (schema $defs/ExtraBlock) to the
 * flat list the extras viewer renders — including the media each block
 * carries, resolved through the asset catalog.
 *
 * ExtraBlock media, in schema terms:
 *   - `images[] { assetId, caption }`, `video[] (VideoLayer)`, `audio[] (AudioTrack)`
 *     reference catalog assets by id;
 *   - `url` / `thumbnail` are direct links (thumbnail may also be an asset id);
 *   - `contentType` (image | video | audio | pdf | text) states the kind explicitly.
 * Previously only id/title/text were passed on, so every extra rendered as an
 * empty image.
 */
import type { Extra, ExtraType } from '../components/modals/extras-viewer/extras-viewer.component';
import type { LocalizedString } from '../types';
import { selectImageVariantForWidth } from './image-variant-utils';
import type { ImageVariant } from '../types';

/** Just the catalog shape this module reads (image / video / audio items). */
export interface CatalogLike {
  category?: string;
  variants?: { src: string; w?: number; direction?: string }[];
  poster?: { src: string };
}

export type AssetLookup = (assetId: string) => CatalogLike | null | undefined;

interface ExtraBlockLike {
  id?: string;
  title?: LocalizedString;
  text?: LocalizedString;
  images?: { assetId?: string }[];
  video?: { assetId?: string }[];
  audio?: { assetId?: string }[];
  contentType?: 'image' | 'video' | 'audio' | 'pdf' | 'text';
  url?: string;
  thumbnail?: string;
  gated?: boolean;
}

/** Thumbnail width to aim for (the grid tiles are small). */
const THUMB_WIDTH = 320;

function firstId(list: { assetId?: string }[] | undefined): string | undefined {
  return list?.find((item) => typeof item?.assetId === 'string' && item.assetId.length > 0)?.assetId;
}

/** Source URL of a catalog asset: forward video variant, else the image variant for `width`, else the first. */
export function catalogSrc(lookup: AssetLookup, assetId: string | undefined, width = 0): string {
  if (!assetId) return '';
  const asset = lookup(assetId);
  const variants = asset?.variants ?? [];
  if (variants.length === 0) return '';
  if (asset?.category === 'video') {
    return (variants.find((v) => v.direction !== 'reverse') ?? variants[0]).src ?? '';
  }
  return selectImageVariantForWidth(variants as unknown as ImageVariant[], width)?.src ?? variants[0].src ?? '';
}

export function extraFromBlock(block: ExtraBlockLike, type: ExtraType, lookup: AssetLookup): Extra {
  const imageId = firstId(block.images);
  const videoId = firstId(block.video);
  const audioId = firstId(block.audio);
  const ct = block.contentType;

  let mediaType: Extra['mediaType'];
  if (ct === 'video' || (!ct && videoId)) mediaType = 'video';
  else if (ct === 'audio' || (!ct && audioId)) mediaType = 'audio';
  else if (ct === 'pdf' || ct === 'text') mediaType = 'document';
  else if (ct === 'image' || imageId || block.url) mediaType = 'image';
  else mediaType = 'document'; // text-only block (e.g. author info)

  const mediaId = mediaType === 'video' ? videoId : mediaType === 'audio' ? audioId : imageId;
  const asset = block.url || catalogSrc(lookup, mediaId) || undefined;

  // Thumbnail: explicit (asset id or URL), else a small rendition of the first
  // image, else the video's poster.
  let thumbnail: string | undefined;
  if (block.thumbnail) {
    thumbnail = catalogSrc(lookup, block.thumbnail, THUMB_WIDTH) || block.thumbnail;
  } else if (imageId) {
    thumbnail = catalogSrc(lookup, imageId, THUMB_WIDTH) || undefined;
  } else if (videoId) {
    thumbnail = lookup(videoId)?.poster?.src || undefined;
  }

  return {
    id: block.id ?? '',
    type,
    title: block.title ?? {},
    description: block.text,
    mediaType,
    // An image extra whose media cannot be resolved is shown as text only.
    ...(mediaType === 'image' && !asset ? { mediaType: 'document' as const } : {}),
    asset,
    thumbnail,
    gated: block.gated === true,
  };
}

/** Flatten the keyed extras object in the order the viewer lists it. */
export function extrasFromManifest(extras: Record<string, unknown> | undefined, lookup: AssetLookup): Extra[] {
  if (!extras) return [];
  const out: Extra[] = [];
  const push = (block: unknown, type: ExtraType): void => {
    const b = block as ExtraBlockLike | null;
    if (b && typeof b === 'object' && b.id) out.push(extraFromBlock(b, type, lookup));
  };
  const each = (key: string, type: ExtraType): void => {
    const list = extras[key];
    if (Array.isArray(list)) list.forEach((b) => push(b, type));
  };
  push(extras['cover'], 'cover');
  push(extras['alt_cover'], 'cover');
  push(extras['author_info'], 'other');
  each('author_interviews', 'interview');
  each('bonus_art', 'art');
  each('fan_art', 'art');
  each('behind_the_scenes', 'bts');
  each('character_sheets', 'other');
  return out;
}
