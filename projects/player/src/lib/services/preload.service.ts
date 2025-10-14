/**
 * Preload Service
 * Intelligently preloads content based on prediction and priority
 */

import { Injectable } from '@angular/core';
import { Subject, Observable } from 'rxjs';
import { ImageCacheService } from './image-cache.service';

/**
 * Preload priority
 */
export type PreloadPriority = 'high' | 'medium' | 'low';

/**
 * Preload item
 */
export interface PreloadItem {
  id: string;
  type: 'image' | 'audio' | 'video';
  url: string;
  priority: PreloadPriority;
  panelId?: string;
  chapterId?: string;
}

/**
 * Preload status
 */
export interface PreloadStatus {
  itemId: string;
  status: 'queued' | 'loading' | 'loaded' | 'error';
  progress?: number;
  error?: string;
}

/**
 * Network information
 */
interface NetworkInfo {
  effectiveType: '4g' | '3g' | '2g' | 'slow-2g';
  downlink: number;
  rtt: number;
  saveData: boolean;
}

/**
 * Preload Service
 * Manages intelligent content preloading with priority queue and network awareness
 */
@Injectable({
  providedIn: 'root',
})
export class PreloadService {
  /**
   * Preload queue (priority-based)
   */
  private queue: PreloadItem[] = [];

  /**
   * Currently loading items
   */
  private loading = new Map<string, Promise<void>>();

  /**
   * Loaded items
   */
  private loaded = new Set<string>();

  /**
   * Status subject
   */
  private statusSubject = new Subject<PreloadStatus>();

  /**
   * Status observable
   */
  readonly status$: Observable<PreloadStatus> = this.statusSubject.asObservable();

  /**
   * Max concurrent requests
   */
  private maxConcurrent = 3;

  /**
   * Current concurrent count
   */
  private currentConcurrent = 0;

  /**
   * Network-aware throttling enabled
   */
  private networkAware = true;

  /**
   * Network connection info
   */
  private networkInfo?: NetworkInfo;

  /**
   * Idle callback ID
   */
  private idleCallbackId?: number;

  constructor(private imageCache: ImageCacheService) {
    this.detectNetwork();
    this.adjustConcurrencyByNetwork();
  }

  /**
   * Add item to preload queue
   */
  add(item: PreloadItem): void {
    // Check if already loaded or in queue
    if (this.loaded.has(item.id) || this.isInQueue(item.id)) {
      return;
    }

    // Add to queue
    this.queue.push(item);

    // Sort by priority
    this.sortQueue();

    // Emit queued status
    this.emitStatus(item.id, 'queued');

    // Start processing
    this.processQueue();
  }

  /**
   * Add multiple items
   */
  addBatch(items: PreloadItem[]): void {
    items.forEach((item) => this.add(item));
  }

  /**
   * Preload next N panels
   */
  preloadNext(currentPanelIndex: number, panelUrls: string[], count = 3): void {
    const items: PreloadItem[] = [];

    for (let i = 1; i <= count; i++) {
      const index = currentPanelIndex + i;
      if (index < panelUrls.length) {
        const priority = i === 1 ? 'high' : i === 2 ? 'medium' : 'low';
        items.push({
          id: `panel-${index}`,
          type: 'image',
          url: panelUrls[index],
          priority,
          panelId: `${index}`,
        });
      }
    }

    this.addBatch(items);
  }

  /**
   * Predict and preload based on direction
   */
  predictAndPreload(
    currentIndex: number,
    totalPanels: number,
    direction: 'forward' | 'backward' | 'auto',
    panelUrls: string[]
  ): void {
    const predictedIndices = this.predict(currentIndex, totalPanels, direction);

    const items = predictedIndices
      .map((index, i) => {
        if (index >= 0 && index < panelUrls.length) {
          const priority: PreloadPriority = i === 0 ? 'high' : i === 1 ? 'medium' : 'low';
          return {
            id: `panel-${index}`,
            type: 'image' as const,
            url: panelUrls[index],
            priority,
            panelId: `${index}`,
          };
        }
        return null;
      })
      .filter((item): item is PreloadItem => item !== null);

    this.addBatch(items);
  }

  /**
   * Predict next indices based on direction
   */
  private predict(
    currentIndex: number,
    totalPanels: number,
    direction: 'forward' | 'backward' | 'auto'
  ): number[] {
    const indices: number[] = [];

    if (direction === 'forward' || direction === 'auto') {
      // Predict forward: next 3 panels
      indices.push(currentIndex + 1, currentIndex + 2, currentIndex + 3);
    }

    if (direction === 'backward') {
      // Predict backward: previous 3 panels
      indices.push(currentIndex - 1, currentIndex - 2, currentIndex - 3);
    }

    if (direction === 'auto') {
      // Also predict one backward
      indices.push(currentIndex - 1);
    }

    // Filter valid indices
    return indices.filter((i) => i >= 0 && i < totalPanels);
  }

  /**
   * Clear queue
   */
  clearQueue(): void {
    this.queue = [];
  }

  /**
   * Remove item from queue
   */
  remove(itemId: string): void {
    this.queue = this.queue.filter((item) => item.id !== itemId);
  }

  /**
   * Check if item is in queue
   */
  private isInQueue(itemId: string): boolean {
    return this.queue.some((item) => item.id === itemId);
  }

  /**
   * Sort queue by priority
   */
  private sortQueue(): void {
    const priorityOrder: Record<PreloadPriority, number> = {
      high: 0,
      medium: 1,
      low: 2,
    };

    this.queue.sort((a, b) => priorityOrder[a.priority] - priorityOrder[b.priority]);
  }

  /**
   * Process queue
   */
  private processQueue(): void {
    // Check concurrency limit
    while (this.currentConcurrent < this.maxConcurrent && this.queue.length > 0) {
      const item = this.queue.shift();
      if (!item) break;

      // Use idle callback for low priority
      if (item.priority === 'low' && 'requestIdleCallback' in window) {
        this.scheduleIdleLoad(item);
      } else {
        this.loadItem(item);
      }
    }
  }

  /**
   * Schedule load during idle time
   */
  private scheduleIdleLoad(item: PreloadItem): void {
    const callback = () => {
      this.loadItem(item);
    };

    if ('requestIdleCallback' in window) {
      this.idleCallbackId = (window as any).requestIdleCallback(callback, { timeout: 2000 });
    } else {
      // Fallback to setTimeout
      setTimeout(callback, 100);
    }
  }

  /**
   * Load individual item
   */
  private async loadItem(item: PreloadItem): Promise<void> {
    // Check if already loading
    if (this.loading.has(item.id)) {
      return this.loading.get(item.id);
    }

    this.currentConcurrent++;
    this.emitStatus(item.id, 'loading');

    const loadPromise = this.performLoad(item);
    this.loading.set(item.id, loadPromise);

    try {
      await loadPromise;
      this.loaded.add(item.id);
      this.emitStatus(item.id, 'loaded');
    } catch (error) {
      console.error(`Failed to preload ${item.id}:`, error);
      this.emitStatus(item.id, 'error', (error as Error).message);
    } finally {
      this.currentConcurrent--;
      this.loading.delete(item.id);

      // Process next items
      this.processQueue();
    }
  }

  /**
   * Perform actual load
   */
  private async performLoad(item: PreloadItem): Promise<void> {
    switch (item.type) {
      case 'image':
        await this.imageCache.preload(item.url);
        break;
      case 'audio':
        await this.preloadAudio(item.url);
        break;
      case 'video':
        await this.preloadVideo(item.url);
        break;
    }
  }

  /**
   * Preload audio
   */
  private async preloadAudio(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const audio = new Audio(url);
      audio.addEventListener('canplaythrough', () => resolve(), { once: true });
      audio.addEventListener('error', () => reject(new Error('Audio load failed')), { once: true });
      audio.load();
    });
  }

  /**
   * Preload video
   */
  private async preloadVideo(url: string): Promise<void> {
    return new Promise((resolve, reject) => {
      const video = document.createElement('video');
      video.src = url;
      video.preload = 'metadata';
      video.addEventListener('loadedmetadata', () => resolve(), { once: true });
      video.addEventListener('error', () => reject(new Error('Video load failed')), { once: true });
      video.load();
    });
  }

  /**
   * Detect network connection
   */
  private detectNetwork(): void {
    const nav = navigator as any;
    if ('connection' in nav) {
      const conn = nav.connection;
      this.networkInfo = {
        effectiveType: conn.effectiveType || '4g',
        downlink: conn.downlink || 10,
        rtt: conn.rtt || 50,
        saveData: conn.saveData || false,
      };

      // Listen for changes
      conn.addEventListener('change', () => {
        this.detectNetwork();
        this.adjustConcurrencyByNetwork();
      });
    }
  }

  /**
   * Adjust concurrency based on network
   */
  private adjustConcurrencyByNetwork(): void {
    if (!this.networkAware || !this.networkInfo) {
      this.maxConcurrent = 3;
      return;
    }

    // Don't preload on save-data mode
    if (this.networkInfo.saveData) {
      this.maxConcurrent = 0;
      this.clearQueue();
      return;
    }

    // Adjust based on connection type
    switch (this.networkInfo.effectiveType) {
      case '4g':
        this.maxConcurrent = 5;
        break;
      case '3g':
        this.maxConcurrent = 2;
        break;
      case '2g':
      case 'slow-2g':
        this.maxConcurrent = 1;
        break;
      default:
        this.maxConcurrent = 3;
    }
  }

  /**
   * Set max concurrent requests
   */
  setMaxConcurrent(max: number): void {
    this.maxConcurrent = Math.max(0, max);
  }

  /**
   * Enable/disable network-aware throttling
   */
  setNetworkAware(enabled: boolean): void {
    this.networkAware = enabled;
    if (enabled) {
      this.adjustConcurrencyByNetwork();
    }
  }

  /**
   * Get queue status
   */
  getQueueStatus() {
    return {
      queued: this.queue.length,
      loading: this.currentConcurrent,
      loaded: this.loaded.size,
      maxConcurrent: this.maxConcurrent,
    };
  }

  /**
   * Emit status event
   */
  private emitStatus(itemId: string, status: PreloadStatus['status'], error?: string): void {
    this.statusSubject.next({
      itemId,
      status,
      error,
    });
  }

  /**
   * Cleanup
   */
  destroy(): void {
    this.clearQueue();
    this.loading.clear();
    this.loaded.clear();
    
    if (this.idleCallbackId && 'cancelIdleCallback' in window) {
      (window as any).cancelIdleCallback(this.idleCallbackId);
    }
    
    this.statusSubject.complete();
  }
}
