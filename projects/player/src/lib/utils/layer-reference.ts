/**
 * Layer reference space — the coordinate system layer `x`/`y`/`width`/`height`
 * are authored in (CMS editor, `CoordinateTransformer`): 1024 px tall and
 * `1024 × aspect` wide, where `aspect` is the panel's artwork aspect. The
 * background layer (first image at z 0) is pinned to the whole panel; every
 * other layer sits at its rect in this space, so the player places it in
 * percent of the panel box — independent of the size the box is shown at.
 */
import type { Layer } from '../types';

export const LAYER_REFERENCE_HEIGHT = 1024;

export interface LayerReference {
  width: number;
  height: number;
  /** The panel's background layer (pinned full-panel), if any. */
  background: Layer | null;
}

type AssetDimensions = { variants?: { w?: number; h?: number }[]; width?: number; height?: number } | null | undefined;

/** The background layer: first image layer at z 0 (missing z = 0). */
export function backgroundLayerOf(layers: readonly Layer[]): Layer | null {
  return layers.find((l) => l.kind === 'image' && (l.z ?? 0) === 0) ?? null;
}

/**
 * Aspect ratio (w / h) of a panel's artwork: its background image's largest
 * variant, else the first image or video asset with known dimensions, else
 * 16:9 — the same reference the CMS editor sizes its panel-view content
 * rect from.
 */
export function panelArtworkAspect(layers: readonly Layer[], getAsset: (assetId: string) => unknown): number {
  const candidates = [
    ...layers.filter((l) => (l.z ?? 0) === 0 && l.kind === 'image'),
    ...layers.filter((l) => l.kind === 'image' || l.kind === 'video'),
  ];
  for (const layer of candidates) {
    const assetId = (layer as { assetId?: string }).assetId;
    if (!assetId) continue;
    const asset = getAsset(assetId) as AssetDimensions;
    let w = 0;
    let h = 0;
    for (const v of asset?.variants ?? []) {
      if ((v.w ?? 0) > w && (v.h ?? 0) > 0) { w = v.w ?? 0; h = v.h ?? 0; }
    }
    if (!(w > 0 && h > 0) && (asset?.width ?? 0) > 0 && (asset?.height ?? 0) > 0) {
      w = asset!.width!;
      h = asset!.height!;
    }
    if (w > 0 && h > 0) return w / h;
  }
  return 16 / 9;
}

/** Reference space of a panel's layers. */
export function layerReferenceOf(layers: readonly Layer[], getAsset: (assetId: string) => unknown): LayerReference {
  const aspect = panelArtworkAspect(layers, getAsset);
  return {
    width: LAYER_REFERENCE_HEIGHT * aspect,
    height: LAYER_REFERENCE_HEIGHT,
    background: backgroundLayerOf(layers),
  };
}

/**
 * Box of a layer in percent of the panel box: the background fills it;
 * other layers use their reference-space rect (a missing size is the full
 * reference extent, as the editor draws it).
 */
export function layerBoxPercent(
  layer: Layer,
  reference: LayerReference
): { left: number; top: number; width: number; height: number } {
  if (layer === reference.background) {
    return { left: 0, top: 0, width: 100, height: 100 };
  }
  const l = layer as Record<string, unknown>;
  const num = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const x = num(l['x']) ?? 0;
  const y = num(l['y']) ?? 0;
  // `w`/`h`: the spelling this renderer used to read; kept as a fallback.
  const width = num(l['width']) ?? num(l['w']) ?? reference.width;
  const height = num(l['height']) ?? num(l['h']) ?? reference.height;
  return {
    left: (x / reference.width) * 100,
    top: (y / reference.height) * 100,
    width: (width / reference.width) * 100,
    height: (height / reference.height) * 100,
  };
}
