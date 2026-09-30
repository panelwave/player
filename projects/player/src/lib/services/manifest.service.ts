/**
 * Manifest Service
 * Handles loading, validation, and indexing of PanelWave manifests
 */

import { inject, Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import { catchError, map } from 'rxjs/operators';
import type {
  PanelWaveManifest,
  Panel,
  Chapter,
  AssetCatalogItem,
} from '../types';

/**
 * Manifest indexes for fast lookups
 */
interface ManifestIndexes {
  panels: Map<string, { panel: Panel; chapterId: string }>;
  chapters: Map<string, Chapter>;
  assets: Map<string, AssetCatalogItem>;
}

/**
 * Manifest Service
 * Provides manifest loading, validation, and indexed access
 */
@Injectable({
  providedIn: 'root',
})
export class ManifestService {
  private manifest: PanelWaveManifest | null = null;
  private indexes: ManifestIndexes | null = null;
  /** Absolute URL the current manifest was fetched from (null for object manifests). */
  private manifestUrl: string | null = null;

  private readonly http = inject(HttpClient);

  /**
   * Load manifest from a URL
   * @param url - URL to the manifest JSON file
   * @returns Observable of the loaded manifest
   */
  loadManifestFromUrl(url: string): Observable<PanelWaveManifest> {
    return this.http.get<PanelWaveManifest>(url).pipe(
      map((manifest) => {
        this.validateManifest(manifest);
        this.setManifest(manifest);
        this.manifestUrl = absoluteDocumentUrl(url);
        return manifest;
      }),
      catchError((error) => {
        const errorMessage = error.message || 'Failed to load manifest';
        return throwError(() => new Error(`Manifest load failed: ${errorMessage}`));
      })
    );
  }

  /**
   * Load manifest from an object
   * @param manifest - Manifest object
   * @returns Observable of the validated manifest
   */
  loadManifestFromObject(manifest: PanelWaveManifest): Observable<PanelWaveManifest> {
    try {
      this.validateManifest(manifest);
      this.setManifest(manifest);
      this.manifestUrl = null;
      return of(manifest);
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Validation failed';
      return throwError(() => new Error(`Manifest validation failed: ${errorMessage}`));
    }
  }

  /**
   * Set the current manifest and build indexes
   */
  private setManifest(manifest: PanelWaveManifest): void {
    this.manifest = manifest;
    this.indexes = this.buildIndexes(manifest);
  }

  /**
   * Get the current manifest
   */
  getManifest(): PanelWaveManifest | null {
    return this.manifest;
  }

  /**
   * The URL the current manifest was loaded from, absolute — the last
   * fallback for relative asset references (AssetUrlService); null when the
   * manifest was supplied as an object.
   */
  getManifestUrl(): string | null {
    return this.manifestUrl;
  }

  /**
   * Check if a manifest is loaded
   */
  hasManifest(): boolean {
    return this.manifest !== null;
  }

  /**
   * Clear the current manifest and indexes
   */
  clearManifest(): void {
    this.manifest = null;
    this.indexes = null;
    this.manifestUrl = null;
  }

  /**
   * Validate manifest structure
   */
  private validateManifest(manifest: unknown): asserts manifest is PanelWaveManifest {
    if (!manifest || typeof manifest !== 'object') {
      throw new Error('Manifest must be an object');
    }

    const m = manifest as Partial<PanelWaveManifest>;

    // Validate panelwave header
    if (!m.panelwave || typeof m.panelwave !== 'object') {
      throw new Error('Missing or invalid "panelwave" header');
    }

    if (!m.panelwave.version) {
      throw new Error('Missing "panelwave.version"');
    }

    // Validate meta
    if (!m.meta || typeof m.meta !== 'object') {
      throw new Error('Missing or invalid "meta" section');
    }

    if (!m.meta.id) {
      throw new Error('Missing "meta.id"');
    }

    if (!m.meta.title || typeof m.meta.title !== 'object') {
      throw new Error('Missing or invalid "meta.title"');
    }

    if (!Array.isArray(m.meta.locales) || m.meta.locales.length === 0) {
      throw new Error('Missing or empty "meta.locales"');
    }

    if (!m.meta.default_locale) {
      throw new Error('Missing "meta.default_locale"');
    }

    // Validate chapters
    if (!Array.isArray(m.chapters) || m.chapters.length === 0) {
      throw new Error('Missing or empty "chapters" array');
    }

    // Validate each chapter
    m.chapters.forEach((chapter, index) => {
      if (!chapter.id) {
        throw new Error(`Chapter at index ${index} missing "id"`);
      }

      if (!chapter.panels || typeof chapter.panels !== 'object') {
        throw new Error(`Chapter "${chapter.id}" missing or invalid "panels"`);
      }

      if (Object.keys(chapter.panels).length === 0) {
        throw new Error(`Chapter "${chapter.id}" has no panels`);
      }

      if (!chapter.graph || typeof chapter.graph !== 'object') {
        throw new Error(`Chapter "${chapter.id}" missing or invalid "graph"`);
      }

      if (!chapter.graph.entry) {
        throw new Error(`Chapter "${chapter.id}" missing "graph.entry"`);
      }

      if (!Array.isArray(chapter.graph.edges)) {
        throw new Error(`Chapter "${chapter.id}" missing or invalid "graph.edges"`);
      }
    });
  }

  /**
   * Build indexes for fast lookups
   */
  private buildIndexes(manifest: PanelWaveManifest): ManifestIndexes {
    const panels = new Map<string, { panel: Panel; chapterId: string }>();
    const chapters = new Map<string, Chapter>();
    const assets = new Map<string, AssetCatalogItem>();

    // Index chapters and panels
    manifest.chapters.forEach((chapter) => {
      chapters.set(chapter.id, chapter);

      Object.entries(chapter.panels).forEach(([panelId, panel]) => {
        panels.set(panelId, { panel, chapterId: chapter.id });
      });
    });

    // Index assets
    if (manifest.assets?.catalog) {
      manifest.assets.catalog.forEach((asset) => {
        assets.set(asset.id, asset);
      });
    }

    return { panels, chapters, assets };
  }

  /**
   * Get a panel by ID
   * @param panelId - Panel identifier
   * @returns Panel and its chapter ID, or null if not found
   */
  getPanel(panelId: string): { panel: Panel; chapterId: string } | null {
    if (!this.indexes) {
      return null;
    }

    return this.indexes.panels.get(panelId) || null;
  }

  /**
   * Get a chapter by ID
   * @param chapterId - Chapter identifier
   * @returns Chapter, or null if not found
   */
  getChapter(chapterId: string): Chapter | null {
    if (!this.indexes) {
      return null;
    }

    return this.indexes.chapters.get(chapterId) || null;
  }

  /**
   * Get an asset by ID
   * @param assetId - Asset identifier
   * @returns Asset catalog item, or null if not found
   */
  getAsset(assetId: string): AssetCatalogItem | null {
    if (!this.indexes) {
      return null;
    }

    return this.indexes.assets.get(assetId) || null;
  }

  /**
   * Get all panels in a chapter
   * @param chapterId - Chapter identifier
   * @returns Array of panel IDs and panels, or empty array if chapter not found
   */
  getPanelsInChapter(chapterId: string): { id: string; panel: Panel }[] {
    const chapter = this.getChapter(chapterId);
    if (!chapter) {
      return [];
    }

    return Object.entries(chapter.panels).map(([id, panel]) => ({ id, panel }));
  }

  /**
   * Get all chapter IDs
   * @returns Array of chapter IDs
   */
  getChapterIds(): string[] {
    if (!this.indexes) {
      return [];
    }

    return Array.from(this.indexes.chapters.keys());
  }

  /**
   * Get all panel IDs
   * @returns Array of panel IDs
   */
  getPanelIds(): string[] {
    if (!this.indexes) {
      return [];
    }

    return Array.from(this.indexes.panels.keys());
  }

  /**
   * Get all asset IDs
   * @returns Array of asset IDs
   */
  getAssetIds(): string[] {
    if (!this.indexes) {
      return [];
    }

    return Array.from(this.indexes.assets.keys());
  }

  /**
   * Check if a panel exists
   * @param panelId - Panel identifier
   * @returns True if panel exists
   */
  hasPanel(panelId: string): boolean {
    return this.getPanel(panelId) !== null;
  }

  /**
   * Check if a chapter exists
   * @param chapterId - Chapter identifier
   * @returns True if chapter exists
   */
  hasChapter(chapterId: string): boolean {
    return this.getChapter(chapterId) !== null;
  }

  /**
   * Check if an asset exists
   * @param assetId - Asset identifier
   * @returns True if asset exists
   */
  hasAsset(assetId: string): boolean {
    return this.getAsset(assetId) !== null;
  }

  /**
   * Get entry panel for a chapter
   * @param chapterId - Chapter identifier
   * @returns Entry panel ID(s), or null if chapter not found
   */
  getChapterEntry(chapterId: string): string | string[] | null {
    const chapter = this.getChapter(chapterId);
    return chapter?.graph.entry || null;
  }

  /**
   * Get total panel count
   * @returns Number of panels across all chapters
   */
  getPanelCount(): number {
    if (!this.indexes) {
      return 0;
    }

    return this.indexes.panels.size;
  }

  /**
   * Get total chapter count
   * @returns Number of chapters
   */
  getChapterCount(): number {
    if (!this.indexes) {
      return 0;
    }

    return this.indexes.chapters.size;
  }

  /**
   * Get total asset count
   * @returns Number of assets
   */
  getAssetCount(): number {
    if (!this.indexes) {
      return 0;
    }

    return this.indexes.assets.size;
  }
}

/** `url` made absolute against the document (relative manifest URLs are common in demos); unchanged when that fails. */
function absoluteDocumentUrl(url: string): string {
  try {
    const base = typeof document !== 'undefined' ? document.baseURI : undefined;
    return new URL(url, base).toString();
  } catch {
    return url;
  }
}
