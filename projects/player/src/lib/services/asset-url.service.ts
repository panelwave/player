import { inject, Injectable } from '@angular/core';
import type { AssetCategory } from '../types';
import { resolveManifestAssetUrl } from '../utils/asset-utils';
import { ManifestService } from './manifest.service';

/**
 * Turns manifest asset references (`src`, poster, portrait, thumbnail…) into
 * loadable URLs: absolute ones pass through, relative ones resolve against
 * the loaded manifest's `assets.base` (per category, then `mediaBase`) and,
 * failing that, the URL the manifest itself came from. One place for the
 * rule every layer/overlay used to re-implement with `baseUrl + src`.
 */
@Injectable({ providedIn: 'root' })
export class AssetUrlService {
  private readonly manifestService = inject(ManifestService);

  resolve(src: string | undefined | null, category?: AssetCategory): string {
    const manifest = this.manifestService.getManifest();
    return resolveManifestAssetUrl(src, manifest?.assets?.base, category, this.manifestService.getManifestUrl());
  }
}
