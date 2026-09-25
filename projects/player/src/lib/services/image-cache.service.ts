/**
 * Image Cache Service
 * LRU cache for images with memory budget management
 */

import { Injectable } from '@angular/core';

/**
 * Cache entry
 */
interface CacheEntry {
  url: string;
  bitmap: ImageBitmap | HTMLImageElement;
  size: number;
  timestamp: number;
  accessCount: number;
}

/**
 * Image Cache Service
 * Provides LRU caching for images with memory budget control
 */
@Injectable({
  providedIn: 'root',
})
export class ImageCacheService {
  /**
   * Cache storage (Map maintains insertion order)
   */
  private cache = new Map<string, CacheEntry>();

  /**
   * In-flight requests (for deduplication)
   */
  private inflightRequests = new Map<string, Promise<ImageBitmap | HTMLImageElement>>();

  /**
   * Memory budget in bytes (default: 100MB)
   */
  private readonly MEMORY_BUDGET = 100 * 1024 * 1024;

  /**
   * Current memory usage in bytes
   */
  private currentMemoryUsage = 0;

  /**
   * Support for createImageBitmap
   */
  private readonly supportsImageBitmap = typeof createImageBitmap === 'function';

  /**
   * Load an image from cache or network
   */
  async load(url: string): Promise<ImageBitmap | HTMLImageElement> {
    // Check cache first
    const cached = this.cache.get(url);
    if (cached) {
      // Update access statistics
      cached.timestamp = Date.now();
      cached.accessCount++;
      
      // Move to end (most recently used)
      this.cache.delete(url);
      this.cache.set(url, cached);
      
      return cached.bitmap;
    }

    // Check if request is already in flight
    const inflight = this.inflightRequests.get(url);
    if (inflight) {
      return inflight;
    }

    // Start new request
    const request = this.fetchImage(url);
    this.inflightRequests.set(url, request);

    try {
      const bitmap = await request;
      
      // Calculate size
      const size = this.estimateImageSize(bitmap);
      
      // Ensure we have space
      this.ensureSpace(size);
      
      // Add to cache
      const entry: CacheEntry = {
        url,
        bitmap,
        size,
        timestamp: Date.now(),
        accessCount: 1,
      };
      
      this.cache.set(url, entry);
      this.currentMemoryUsage += size;
      
      return bitmap;
    } finally {
      // Remove from in-flight
      this.inflightRequests.delete(url);
    }
  }

  /**
   * Fetch image from network
   */
  private async fetchImage(url: string): Promise<ImageBitmap | HTMLImageElement> {
    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Failed to fetch image: ${response.statusText}`);
    }

    const blob = await response.blob();

    // Use createImageBitmap if supported
    if (this.supportsImageBitmap) {
      try {
        return await createImageBitmap(blob);
      } catch (error) {
        console.warn('createImageBitmap failed, falling back to Image:', error);
      }
    }

    // Fallback to HTMLImageElement
    return this.createImage(blob);
  }

  /**
   * Create HTMLImageElement from blob
   */
  private createImage(blob: Blob): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(blob);

      img.onload = () => {
        URL.revokeObjectURL(url);
        resolve(img);
      };

      img.onerror = () => {
        URL.revokeObjectURL(url);
        reject(new Error('Failed to load image'));
      };

      img.src = url;
    });
  }

  /**
   * Estimate image size in bytes
   */
  private estimateImageSize(bitmap: ImageBitmap | HTMLImageElement): number {
    const width = bitmap.width;
    const height = bitmap.height;
    
    // Estimate: width × height × 4 bytes per pixel (RGBA)
    return width * height * 4;
  }

  /**
   * Ensure we have enough space in cache
   */
  private ensureSpace(requiredSize: number): void {
    // If single image exceeds budget, clear entire cache
    if (requiredSize > this.MEMORY_BUDGET) {
      console.warn(`Image size (${requiredSize} bytes) exceeds memory budget (${this.MEMORY_BUDGET} bytes)`);
      this.clear();
      return;
    }

    // Evict entries until we have enough space
    while (this.currentMemoryUsage + requiredSize > this.MEMORY_BUDGET) {
      this.evictLRU();
    }
  }

  /**
   * Evict least recently used entry
   */
  private evictLRU(): void {
    // Get first entry (oldest/least recently used)
    const firstKey = this.cache.keys().next().value;
    if (!firstKey) return;

    const entry = this.cache.get(firstKey);
    if (!entry) return;

    // Close ImageBitmap if applicable
    if ('close' in entry.bitmap && typeof entry.bitmap.close === 'function') {
      entry.bitmap.close();
    }

    // Remove from cache
    this.cache.delete(firstKey);
    this.currentMemoryUsage -= entry.size;
  }

  /**
   * Preload an image
   */
  async preload(url: string): Promise<void> {
    try {
      await this.load(url);
    } catch (error) {
      console.error(`Failed to preload image: ${url}`, error);
    }
  }

  /**
   * Preload multiple images
   */
  async preloadBatch(urls: string[]): Promise<void> {
    await Promise.all(urls.map((url) => this.preload(url)));
  }

  /**
   * Check if URL is cached
   */
  has(url: string): boolean {
    return this.cache.has(url);
  }

  /**
   * Remove specific URL from cache
   */
  remove(url: string): void {
    const entry = this.cache.get(url);
    if (!entry) return;

    // Close ImageBitmap if applicable
    if ('close' in entry.bitmap && typeof entry.bitmap.close === 'function') {
      entry.bitmap.close();
    }

    this.cache.delete(url);
    this.currentMemoryUsage -= entry.size;
  }

  /**
   * Clear entire cache
   */
  clear(): void {
    // Close all ImageBitmaps
    this.cache.forEach((entry) => {
      if ('close' in entry.bitmap && typeof entry.bitmap.close === 'function') {
        entry.bitmap.close();
      }
    });

    this.cache.clear();
    this.currentMemoryUsage = 0;
  }

  /**
   * Get cache statistics
   */
  getStats() {
    return {
      entries: this.cache.size,
      memoryUsage: this.currentMemoryUsage,
      memoryBudget: this.MEMORY_BUDGET,
      utilizationPercent: (this.currentMemoryUsage / this.MEMORY_BUDGET) * 100,
      inflightRequests: this.inflightRequests.size,
    };
  }

  /**
   * Get all cached URLs
   */
  getCachedUrls(): string[] {
    return Array.from(this.cache.keys());
  }

  /**
   * Set memory budget (in bytes)
   */
  setMemoryBudget(bytes: number): void {
    const oldBudget = this.MEMORY_BUDGET;
    (this as unknown as { MEMORY_BUDGET: number }).MEMORY_BUDGET = bytes;

    // If new budget is smaller, evict entries
    if (bytes < oldBudget) {
      while (this.currentMemoryUsage > bytes) {
        this.evictLRU();
      }
    }
  }
}
