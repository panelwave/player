/**
 * Thumbnails for navigation surfaces (thumbnail strip, TOC) and the work's
 * cover. Panels carry no thumbnail field of their own: the thumbnail is a
 * small rendition of the panel's artwork, resolved through the asset catalog.
 */
import type { Layer, Panel, PanelWaveManifest } from '../types';
import { catalogSrc, type AssetLookup } from './extras-utils';

/** Width (physical px) a thumbnail tile is rendered at. */
export const THUMBNAIL_WIDTH = 320;

interface ThumbSourceLayer {
  kind?: string;
  assetId?: unknown;
  src?: unknown;
  poster?: unknown;
  visible?: boolean;
  z?: number;
}

const isUrl = (value: string): boolean => /^(https?:|data:|blob:|\/)/i.test(value);

/**
 * An asset id or a link: the catalog rendition for `width`, else the value
 * itself — any path for a field that holds links (`thumbnail`, `src`,
 * `url`), only an absolute URL for one that may hold an unknown asset id.
 */
function refSrc(lookup: AssetLookup, ref: unknown, width: number, anyPath = false): string {
  if (typeof ref !== 'string' || ref.length === 0) return '';
  return catalogSrc(lookup, ref, width) || (anyPath || isUrl(ref) ? ref : '');
}

/** Poster of a video layer: its own `poster`, else the catalog item's poster. */
function videoPosterSrc(lookup: AssetLookup, layer: ThumbSourceLayer, width: number): string {
  const own = refSrc(lookup, layer.poster, width, true);
  if (own) return own;
  return typeof layer.assetId === 'string' ? lookup(layer.assetId)?.poster?.src ?? '' : '';
}

/**
 * The thumbnail source of a panel: an explicit `thumbnail`, else its
 * bottom-most visible image layer (the artwork the panel is drawn on), else
 * the poster of its first video layer. Empty when the panel has no artwork.
 */
export function panelThumbnailSrc(
  panel: Panel | null | undefined,
  lookup: AssetLookup,
  width = THUMBNAIL_WIDTH
): string {
  if (!panel) return '';
  const explicit = refSrc(lookup, (panel as Panel & { thumbnail?: unknown }).thumbnail, width, true);
  if (explicit) return explicit;

  const layers = [...((panel.layers ?? []) as (Layer & ThumbSourceLayer)[])]
    .filter((layer) => layer && layer.visible !== false)
    .sort((a, b) => (a.z ?? 0) - (b.z ?? 0));
  for (const layer of layers) {
    if (layer.kind === 'image') {
      const src = refSrc(lookup, layer.assetId, width) || refSrc(lookup, layer.src, width, true);
      if (src) return src;
    }
  }
  for (const layer of layers) {
    if (layer.kind === 'video') {
      const src = videoPosterSrc(lookup, layer, width);
      if (src) return src;
    }
  }
  return '';
}

interface CoverBlockLike {
  url?: unknown;
  thumbnail?: unknown;
  images?: { assetId?: unknown }[];
  gated?: boolean;
}

/**
 * The work's cover image: `meta.cover` (asset id or URL), else the
 * `extras.cover` block (its image, link or thumbnail). A gated cover block
 * is not shown. Empty when the work has no cover.
 */
export function coverImageSrc(
  manifest: PanelWaveManifest | null | undefined,
  lookup: AssetLookup,
  width = 0
): string {
  if (!manifest) return '';
  const fromMeta = refSrc(lookup, manifest.meta?.cover, width);
  if (fromMeta) return fromMeta;

  const block = (manifest.extras as { cover?: CoverBlockLike } | undefined)?.cover;
  if (!block || typeof block !== 'object' || block.gated === true) return '';
  const imageId = block.images?.find((image) => typeof image?.assetId === 'string')?.assetId;
  return refSrc(lookup, imageId, width) || refSrc(lookup, block.url, width, true) || refSrc(lookup, block.thumbnail, width, true);
}
