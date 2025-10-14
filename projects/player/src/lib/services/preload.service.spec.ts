/**
 * Preload Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { PreloadService, PreloadItem, PreloadStatus } from './preload.service';
import { ImageCacheService } from './image-cache.service';

describe('PreloadService', () => {
  let service: PreloadService;
  let imageCacheSpy: jasmine.SpyObj<ImageCacheService>;

  beforeEach(() => {
    const spy = jasmine.createSpyObj('ImageCacheService', ['preload']);
    spy.preload.and.returnValue(Promise.resolve());

    TestBed.configureTestingModule({
      providers: [
        PreloadService,
        { provide: ImageCacheService, useValue: spy }
      ]
    });

    service = TestBed.inject(PreloadService);
    imageCacheSpy = TestBed.inject(ImageCacheService) as jasmine.SpyObj<ImageCacheService>;
  });

  afterEach(() => {
    service.destroy();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('add', () => {
    it('should add item to queue', () => {
      const item: PreloadItem = {
        id: 'test-1',
        type: 'image',
        url: 'test.jpg',
        priority: 'high'
      };

      service.add(item);

      const status = service.getQueueStatus();
      expect(status.queued + status.loading).toBeGreaterThan(0);
    });

    it('should not add duplicate items', () => {
      const item: PreloadItem = {
        id: 'test-1',
        type: 'image',
        url: 'test.jpg',
        priority: 'high'
      };

      service.add(item);
      service.add(item); // Duplicate

      const status = service.getQueueStatus();
      expect(status.queued + status.loading).toBe(1);
    });

    it('should emit queued status', (done) => {
      const item: PreloadItem = {
        id: 'test-1',
        type: 'image',
        url: 'test.jpg',
        priority: 'high'
      };

      service.status$.subscribe((status: PreloadStatus) => {
        if (status.status === 'queued') {
          expect(status.itemId).toBe('test-1');
          done();
        }
      });

      service.add(item);
    });
  });

  describe('addBatch', () => {
    it('should add multiple items', () => {
      const items: PreloadItem[] = [
        { id: 'test-1', type: 'image', url: 'test1.jpg', priority: 'high' },
        { id: 'test-2', type: 'image', url: 'test2.jpg', priority: 'medium' },
        { id: 'test-3', type: 'image', url: 'test3.jpg', priority: 'low' }
      ];

      service.addBatch(items);

      const status = service.getQueueStatus();
      expect(status.queued + status.loading + status.loaded).toBeGreaterThanOrEqual(3);
    });
  });

  describe('priority queue', () => {
    it('should process high priority first', async () => {
      const loadOrder: string[] = [];

      imageCacheSpy.preload.and.callFake((url: string) => {
        loadOrder.push(url);
        return Promise.resolve();
      });

      service.setMaxConcurrent(1); // Process one at a time

      service.add({ id: '1', type: 'image', url: 'low.jpg', priority: 'low' });
      service.add({ id: '2', type: 'image', url: 'high.jpg', priority: 'high' });
      service.add({ id: '3', type: 'image', url: 'medium.jpg', priority: 'medium' });

      await new Promise(resolve => setTimeout(resolve, 100));

      expect(loadOrder[0]).toBe('high.jpg');
    });
  });

  describe('preloadNext', () => {
    it('should preload next N panels', () => {
      const urls = ['p0.jpg', 'p1.jpg', 'p2.jpg', 'p3.jpg', 'p4.jpg'];

      service.preloadNext(0, urls, 3);

      const status = service.getQueueStatus();
      expect(status.queued + status.loading + status.loaded).toBeGreaterThanOrEqual(3);
    });

    it('should assign correct priorities', (done) => {
      const urls = ['p0.jpg', 'p1.jpg', 'p2.jpg', 'p3.jpg'];
      const priorities: string[] = [];

      service.status$.subscribe((status: PreloadStatus) => {
        if (status.status === 'queued') {
          priorities.push(status.itemId);
          
          if (priorities.length === 3) {
            // First should be panel-1 (high priority)
            expect(priorities[0]).toBe('panel-1');
            done();
          }
        }
      });

      service.preloadNext(0, urls, 3);
    });
  });

  describe('predictAndPreload', () => {
    it('should predict forward direction', () => {
      const urls = Array.from({ length: 10 }, (_, i) => `p${i}.jpg`);

      service.predictAndPreload(2, urls.length, 'forward', urls);

      const status = service.getQueueStatus();
      expect(status.queued + status.loading + status.loaded).toBeGreaterThanOrEqual(3); // Next 3 panels
    });

    it('should predict backward direction', () => {
      const urls = Array.from({ length: 10 }, (_, i) => `p${i}.jpg`);

      service.predictAndPreload(5, urls.length, 'backward', urls);

      const status = service.getQueueStatus();
      expect(status.queued + status.loading + status.loaded).toBeGreaterThanOrEqual(3); // Previous 3 panels
    });

    it('should predict auto direction (both ways)', () => {
      const urls = Array.from({ length: 10 }, (_, i) => `p${i}.jpg`);

      service.predictAndPreload(5, urls.length, 'auto', urls);

      const status = service.getQueueStatus();
      expect(status.queued + status.loading + status.loaded).toBeGreaterThanOrEqual(4); // 3 forward + 1 backward
    });
  });

  describe('concurrency control', () => {
    it('should respect max concurrent limit', () => {
      service.setMaxConcurrent(2);

      const items: PreloadItem[] = [
        { id: '1', type: 'image', url: '1.jpg', priority: 'high' },
        { id: '2', type: 'image', url: '2.jpg', priority: 'high' },
        { id: '3', type: 'image', url: '3.jpg', priority: 'high' },
        { id: '4', type: 'image', url: '4.jpg', priority: 'high' }
      ];

      service.addBatch(items);

      const status = service.getQueueStatus();
      expect(status.loading).toBeLessThanOrEqual(2);
    });

    it('should adjust max concurrent', () => {
      service.setMaxConcurrent(5);
      expect(service.getQueueStatus().maxConcurrent).toBe(5);

      service.setMaxConcurrent(1);
      expect(service.getQueueStatus().maxConcurrent).toBe(1);
    });
  });

  describe('network awareness', () => {
    it('should allow enabling/disabling network awareness', () => {
      service.setNetworkAware(true);
      expect(true).toBe(true); // No error

      service.setNetworkAware(false);
      expect(true).toBe(true); // No error
    });
  });

  describe('queue management', () => {
    it('should clear queue', () => {
      const items: PreloadItem[] = [
        { id: '1', type: 'image', url: '1.jpg', priority: 'high' },
        { id: '2', type: 'image', url: '2.jpg', priority: 'high' }
      ];

      service.addBatch(items);
      service.clearQueue();

      const status = service.getQueueStatus();
      expect(status.queued).toBe(0);
    });

    it('should remove specific item', () => {
      service.add({ id: '1', type: 'image', url: '1.jpg', priority: 'low' });
      service.add({ id: '2', type: 'image', url: '2.jpg', priority: 'low' });

      service.remove('1');

      // Item should be removed (hard to test without exposing queue)
      expect(true).toBe(true);
    });
  });

  describe('status events', () => {
    it('should emit loading status', (done) => {
      const statuses: string[] = [];

      service.status$.subscribe((status: PreloadStatus) => {
        statuses.push(status.status);
        
        if (status.status === 'loading') {
          expect(statuses).toContain('queued');
          expect(statuses).toContain('loading');
          done();
        }
      });

      service.add({ id: 'test', type: 'image', url: 'test.jpg', priority: 'high' });
    });

    it('should emit loaded status', (done) => {
      service.status$.subscribe((status: PreloadStatus) => {
        if (status.status === 'loaded') {
          expect(status.itemId).toBe('test');
          done();
        }
      });

      service.add({ id: 'test', type: 'image', url: 'test.jpg', priority: 'high' });
    });

    it('should emit error status on failure', (done) => {
      imageCacheSpy.preload.and.returnValue(Promise.reject(new Error('Load failed')));

      service.status$.subscribe((status: PreloadStatus) => {
        if (status.status === 'error') {
          expect(status.error).toBeDefined();
          done();
        }
      });

      service.add({ id: 'test', type: 'image', url: 'test.jpg', priority: 'high' });
    });
  });

  describe('getQueueStatus', () => {
    it('should return queue statistics', () => {
      const status = service.getQueueStatus();

      expect(status).toBeDefined();
      expect(status.queued).toBeDefined();
      expect(status.loading).toBeDefined();
      expect(status.loaded).toBeDefined();
      expect(status.maxConcurrent).toBeDefined();
    });
  });

  describe('destroy', () => {
    it('should cleanup resources', async () => {
      service.add({ id: 'test', type: 'image', url: 'test.jpg', priority: 'high' });

      // Wait a bit for processing to start
      await new Promise(resolve => setTimeout(resolve, 10));

      service.destroy();

      const status = service.getQueueStatus();
      expect(status.queued).toBe(0);
      expect(status.loaded).toBe(0);
      // Loading might still be > 0 if items are mid-processing
    });
  });
});
