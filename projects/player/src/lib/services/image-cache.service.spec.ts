/**
 * Image Cache Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { ImageCacheService } from './image-cache.service';

describe('ImageCacheService', () => {
  let service: ImageCacheService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(ImageCacheService);
  });

  afterEach(() => {
    service.clear();
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('load', () => {
    it('should load an image', async () => {
      const mockUrl = 'https://example.com/image.jpg';
      
      // Mock fetch
      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      // Mock createImageBitmap or Image
      const mockBitmap = { width: 100, height: 100 } as any;
      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      const result = await service.load(mockUrl);

      expect(result).toBeTruthy();
      expect(window.fetch).toHaveBeenCalledWith(mockUrl);
    });

    it('should return cached image on second load', async () => {
      const mockUrl = 'https://example.com/image.jpg';
      const mockBitmap = { width: 100, height: 100 } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      // First load
      const result1 = await service.load(mockUrl);

      // Second load
      const result2 = await service.load(mockUrl);

      expect(result1).toBe(result2);
      expect(window.fetch).toHaveBeenCalledTimes(1); // Only once
    });

    it('should deduplicate in-flight requests', async () => {
      const mockUrl = 'https://example.com/image.jpg';
      const mockBitmap = { width: 100, height: 100 } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      // Start two loads simultaneously
      const promise1 = service.load(mockUrl);
      const promise2 = service.load(mockUrl);

      const [result1, result2] = await Promise.all([promise1, promise2]);

      expect(result1).toBe(result2);
      expect(window.fetch).toHaveBeenCalledTimes(1); // Only once
    });

    it('should handle fetch errors', async () => {
      const mockUrl = 'https://example.com/image.jpg';

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(null, { status: 404, statusText: 'Not Found' })
        )
      );

      await expectAsync(service.load(mockUrl)).toBeRejectedWithError(
        'Failed to fetch image: Not Found'
      );
    });
  });

  describe('has', () => {
    it('should return true for cached URLs', async () => {
      const mockUrl = 'https://example.com/image.jpg';
      const mockBitmap = { width: 100, height: 100 } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      expect(service.has(mockUrl)).toBe(false);

      await service.load(mockUrl);

      expect(service.has(mockUrl)).toBe(true);
    });
  });

  describe('remove', () => {
    it('should remove entry from cache', async () => {
      const mockUrl = 'https://example.com/image.jpg';
      const mockBitmap = { width: 100, height: 100, close: jasmine.createSpy('close') } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      await service.load(mockUrl);
      expect(service.has(mockUrl)).toBe(true);

      service.remove(mockUrl);

      expect(service.has(mockUrl)).toBe(false);
      expect(mockBitmap.close).toHaveBeenCalled();
    });
  });

  describe('clear', () => {
    it('should clear all entries', async () => {
      const mockUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ];

      const mockBitmap = { width: 100, height: 100, close: jasmine.createSpy('close') } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      await service.load(mockUrls[0]);
      await service.load(mockUrls[1]);

      const stats = service.getStats();
      expect(stats.entries).toBe(2);

      service.clear();

      const statsAfter = service.getStats();
      expect(statsAfter.entries).toBe(0);
      expect(statsAfter.memoryUsage).toBe(0);
    });
  });

  describe('LRU eviction', () => {
    it('should evict least recently used entry when budget exceeded', async () => {
      // Set small budget
      service.setMemoryBudget(100000); // 100KB

      const mockUrl1 = 'https://example.com/image1.jpg';
      const mockUrl2 = 'https://example.com/image2.jpg';
      
      // Large bitmap (exceeds half budget)
      const mockBitmap = { 
        width: 200, 
        height: 200, 
        close: jasmine.createSpy('close') 
      } as any; // 200 * 200 * 4 = 160KB

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      await service.load(mockUrl1);
      expect(service.has(mockUrl1)).toBe(true);

      // Loading second image should evict first (budget exceeded)
      await service.load(mockUrl2);

      expect(service.has(mockUrl1)).toBe(false);
      expect(service.has(mockUrl2)).toBe(true);
    });
  });

  describe('preload', () => {
    it('should preload single image', async () => {
      const mockUrl = 'https://example.com/image.jpg';
      const mockBitmap = { width: 100, height: 100 } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      await service.preload(mockUrl);

      expect(service.has(mockUrl)).toBe(true);
    });

    it('should preload batch of images', async () => {
      const mockUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
        'https://example.com/image3.jpg',
      ];

      const mockBitmap = { width: 100, height: 100 } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      await service.preloadBatch(mockUrls);

      mockUrls.forEach((url) => {
        expect(service.has(url)).toBe(true);
      });
    });
  });

  describe('getStats', () => {
    it('should return correct statistics', async () => {
      const mockUrl = 'https://example.com/image.jpg';
      const mockBitmap = { width: 100, height: 100 } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      const statsBefore = service.getStats();
      expect(statsBefore.entries).toBe(0);
      expect(statsBefore.memoryUsage).toBe(0);

      await service.load(mockUrl);

      const statsAfter = service.getStats();
      expect(statsAfter.entries).toBe(1);
      expect(statsAfter.memoryUsage).toBeGreaterThan(0);
      expect(statsAfter.utilizationPercent).toBeGreaterThan(0);
    });
  });

  describe('getCachedUrls', () => {
    it('should return array of cached URLs', async () => {
      const mockUrls = [
        'https://example.com/image1.jpg',
        'https://example.com/image2.jpg',
      ];

      const mockBitmap = { width: 100, height: 100 } as any;

      spyOn(window, 'fetch').and.returnValue(
        Promise.resolve(
          new Response(new Blob(['fake-image'], { type: 'image/jpeg' }), {
            status: 200,
          })
        )
      );

      spyOn(window as any, 'createImageBitmap').and.returnValue(
        Promise.resolve(mockBitmap)
      );

      await service.load(mockUrls[0]);
      await service.load(mockUrls[1]);

      const cachedUrls = service.getCachedUrls();

      expect(cachedUrls.length).toBe(2);
      expect(cachedUrls).toContain(mockUrls[0]);
      expect(cachedUrls).toContain(mockUrls[1]);
    });
  });
});
