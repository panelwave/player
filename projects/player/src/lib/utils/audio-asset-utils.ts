/**
 * Audio asset resolution shared by the panel audio and timeline (sequence)
 * audio services: catalog id → the first variant the browser can play →
 * absolute URL, plus the asset's own role / loop hints.
 */

import { resolveAssetUrl, guessMimeType } from './asset-utils';
import type { AssetBase, AssetCatalogItem, AssetCatalogItemAudio, AudioVariant, PanelAudioRole } from '../types';

export interface ResolvedAudioAsset {
  url: string;
  /** The catalog item's role, if any. */
  role?: PanelAudioRole;
  /** The chosen variant's loop hint, if any. */
  loop?: boolean;
}

export type AudioAssetResult = ResolvedAudioAsset | { error: string };

/**
 * Resolve an audio asset; `{ error }` explains why it cannot be played (not
 * in the catalog, not audio, no variants, no URL).
 */
export function resolveAudioAsset(
  asset: AssetCatalogItem | null | undefined,
  assetsBase: AssetBase | undefined
): AudioAssetResult {
  if (!asset) {
    return { error: 'is not in the asset catalog' };
  }
  if (asset.category !== 'audio') {
    return { error: 'is not an audio asset' };
  }
  const audioAsset = asset as AssetCatalogItemAudio;
  const variant = pickPlayableVariant(audioAsset.variants ?? []);
  if (!variant) {
    return { error: 'has no audio variants' };
  }
  const url = resolveAssetUrl(variant.src, assetsBase, 'audio');
  if (!url) {
    return { error: 'has no usable URL' };
  }
  return { url, role: audioAsset.role as PanelAudioRole | undefined, loop: variant.loop };
}

/**
 * First variant the browser reports it can play; otherwise the first one
 * (the element will surface the real error).
 */
export function pickPlayableVariant(variants: AudioVariant[]): AudioVariant | undefined {
  if (variants.length <= 1) {
    return variants[0];
  }
  const probe = createProbe();
  if (!probe) {
    return variants[0];
  }
  const playable = variants.find((variant) => {
    const mime = variant.mime || guessMimeType(variant.src);
    return mime ? probe.canPlayType(mime) !== '' : false;
  });
  return playable ?? variants[0];
}

function createProbe(): HTMLAudioElement | null {
  if (typeof document === 'undefined') {
    return null;
  }
  try {
    const element = document.createElement('audio');
    return typeof element.canPlayType === 'function' ? element : null;
  } catch {
    return null;
  }
}
