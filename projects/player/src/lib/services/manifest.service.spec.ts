/**
 * Unit tests for ManifestService
 */

import { TestBed } from '@angular/core/testing';
import { HttpClientTestingModule, HttpTestingController } from '@angular/common/http/testing';
import { ManifestService } from './manifest.service';
import type { PanelWaveManifest } from '../types';

describe('ManifestService', () => {
  let service: ManifestService;
  let httpMock: HttpTestingController;

  // Valid test manifest
  const validManifest: PanelWaveManifest = {
    panelwave: {
      version: '1.0.0',
      schema: 'https://panelwave.org/schema/1.0/panelwave.schema.json',
    },
    meta: {
      id: 'test-work',
      title: { 'en-US': 'Test Work' },
      locales: ['en-US', 'de-DE'],
      default_locale: 'en-US',
    },
    chapters: [
      {
        id: 'ch-1',
        panels: {
          'p-1': { layers: [] },
          'p-2': { layers: [] },
        },
        graph: {
          entry: 'p-1',
          edges: [{ from: 'p-1', to: 'p-2' }],
        },
      },
      {
        id: 'ch-2',
        panels: {
          'p-3': { layers: [] },
        },
        graph: {
          entry: 'p-3',
          edges: [],
        },
      },
    ],
    assets: {
      catalog: [
        {
          id: 'img-1',
          category: 'image',
          variants: [{ src: 'test.jpg', mime: 'image/jpeg', w: 800, h: 600 }],
        },
        {
          id: 'aud-1',
          category: 'audio',
          variants: [{ src: 'test.mp3', mime: 'audio/mpeg' }],
        },
      ],
    },
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      imports: [HttpClientTestingModule],
      providers: [ManifestService],
    });

    service = TestBed.inject(ManifestService);
    httpMock = TestBed.inject(HttpTestingController);
  });

  afterEach(() => {
    httpMock.verify();
    service.clearManifest();
  });

  describe('Initialization', () => {
    it('should be created', () => {
      expect(service).toBeTruthy();
    });

    it('should have no manifest initially', () => {
      expect(service.hasManifest()).toBe(false);
      expect(service.getManifest()).toBeNull();
    });
  });

  describe('loadManifestFromUrl', () => {
    it('should load manifest from URL', (done) => {
      const url = 'https://example.com/manifest.json';

      service.loadManifestFromUrl(url).subscribe({
        next: (manifest) => {
          expect(manifest).toEqual(validManifest);
          expect(service.hasManifest()).toBe(true);
          expect(service.getManifest()).toEqual(validManifest);
          done();
        },
      });

      const req = httpMock.expectOne(url);
      expect(req.request.method).toBe('GET');
      req.flush(validManifest);
    });

    it('should handle HTTP errors', (done) => {
      const url = 'https://example.com/manifest.json';

      service.loadManifestFromUrl(url).subscribe({
        error: (error) => {
          expect(error.message).toContain('Manifest load failed');
          done();
        },
      });

      const req = httpMock.expectOne(url);
      req.error(new ProgressEvent('error'));
    });

    it('should validate loaded manifest', (done) => {
      const url = 'https://example.com/manifest.json';
      const invalidManifest = { invalid: 'data' };

      service.loadManifestFromUrl(url).subscribe({
        error: (error) => {
          expect(error.message).toContain('Manifest load failed');
          done();
        },
      });

      const req = httpMock.expectOne(url);
      req.flush(invalidManifest);
    });
  });

  describe('loadManifestFromObject', () => {
    it('should load manifest from object', (done) => {
      service.loadManifestFromObject(validManifest).subscribe({
        next: (manifest) => {
          expect(manifest).toEqual(validManifest);
          expect(service.hasManifest()).toBe(true);
          done();
        },
      });
    });

    it('should validate manifest object', (done) => {
      const invalidManifest = { invalid: 'data' } as any;

      service.loadManifestFromObject(invalidManifest).subscribe({
        error: (error) => {
          expect(error.message).toContain('Manifest validation failed');
          done();
        },
      });
    });
  });

  describe('Validation', () => {
    it('should reject null manifest', (done) => {
      service.loadManifestFromObject(null as any).subscribe({
        error: (error) => {
          expect(error.message).toContain('Manifest must be an object');
          done();
        },
      });
    });

    it('should reject manifest without panelwave header', (done) => {
      const invalid = { ...validManifest, panelwave: undefined } as any;

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('Missing or invalid "panelwave" header');
          done();
        },
      });
    });

    it('should reject manifest without version', (done) => {
      const invalid = {
        ...validManifest,
        panelwave: { ...validManifest.panelwave, version: undefined as any },
      };

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('Missing "panelwave.version"');
          done();
        },
      });
    });

    it('should reject manifest without meta', (done) => {
      const invalid = { ...validManifest, meta: undefined } as any;

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('Missing or invalid "meta" section');
          done();
        },
      });
    });

    it('should reject manifest without meta.id', (done) => {
      const invalid = {
        ...validManifest,
        meta: { ...validManifest.meta, id: undefined as any },
      };

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('Missing "meta.id"');
          done();
        },
      });
    });

    it('should reject manifest without meta.title', (done) => {
      const invalid = {
        ...validManifest,
        meta: { ...validManifest.meta, title: undefined as any },
      };

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('Missing or invalid "meta.title"');
          done();
        },
      });
    });

    it('should reject manifest without meta.locales', (done) => {
      const invalid = {
        ...validManifest,
        meta: { ...validManifest.meta, locales: [] },
      };

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('Missing or empty "meta.locales"');
          done();
        },
      });
    });

    it('should reject manifest without chapters', (done) => {
      const invalid = { ...validManifest, chapters: [] };

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('Missing or empty "chapters" array');
          done();
        },
      });
    });

    it('should reject chapter without id', (done) => {
      const invalid = {
        ...validManifest,
        chapters: [{ ...validManifest.chapters[0], id: undefined as any }],
      };

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('missing "id"');
          done();
        },
      });
    });

    it('should reject chapter without panels', (done) => {
      const invalid = {
        ...validManifest,
        chapters: [{ ...validManifest.chapters[0], panels: {} }],
      };

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('has no panels');
          done();
        },
      });
    });

    it('should reject chapter without graph', (done) => {
      const invalid = {
        ...validManifest,
        chapters: [{ ...validManifest.chapters[0], graph: undefined as any }],
      };

      service.loadManifestFromObject(invalid).subscribe({
        error: (error) => {
          expect(error.message).toContain('missing or invalid "graph"');
          done();
        },
      });
    });
  });

  describe('Panel Lookups', () => {
    beforeEach((done) => {
      service.loadManifestFromObject(validManifest).subscribe(() => done());
    });

    it('should get panel by ID', () => {
      const result = service.getPanel('p-1');
      expect(result).toBeTruthy();
      expect(result?.panel).toBeDefined();
      expect(result?.chapterId).toBe('ch-1');
    });

    it('should return null for non-existent panel', () => {
      const result = service.getPanel('non-existent');
      expect(result).toBeNull();
    });

    it('should check if panel exists', () => {
      expect(service.hasPanel('p-1')).toBe(true);
      expect(service.hasPanel('non-existent')).toBe(false);
    });

    it('should get all panel IDs', () => {
      const ids = service.getPanelIds();
      expect(ids).toContain('p-1');
      expect(ids).toContain('p-2');
      expect(ids).toContain('p-3');
      expect(ids.length).toBe(3);
    });

    it('should get panel count', () => {
      expect(service.getPanelCount()).toBe(3);
    });
  });

  describe('Chapter Lookups', () => {
    beforeEach((done) => {
      service.loadManifestFromObject(validManifest).subscribe(() => done());
    });

    it('should get chapter by ID', () => {
      const chapter = service.getChapter('ch-1');
      expect(chapter).toBeTruthy();
      expect(chapter?.id).toBe('ch-1');
    });

    it('should return null for non-existent chapter', () => {
      const chapter = service.getChapter('non-existent');
      expect(chapter).toBeNull();
    });

    it('should check if chapter exists', () => {
      expect(service.hasChapter('ch-1')).toBe(true);
      expect(service.hasChapter('non-existent')).toBe(false);
    });

    it('should get all chapter IDs', () => {
      const ids = service.getChapterIds();
      expect(ids).toContain('ch-1');
      expect(ids).toContain('ch-2');
      expect(ids.length).toBe(2);
    });

    it('should get chapter count', () => {
      expect(service.getChapterCount()).toBe(2);
    });

    it('should get panels in chapter', () => {
      const panels = service.getPanelsInChapter('ch-1');
      expect(panels.length).toBe(2);
      expect(panels.find((p) => p.id === 'p-1')).toBeTruthy();
      expect(panels.find((p) => p.id === 'p-2')).toBeTruthy();
    });

    it('should return empty array for non-existent chapter', () => {
      const panels = service.getPanelsInChapter('non-existent');
      expect(panels).toEqual([]);
    });

    it('should get chapter entry', () => {
      const entry = service.getChapterEntry('ch-1');
      expect(entry).toBe('p-1');
    });

    it('should return null for non-existent chapter entry', () => {
      const entry = service.getChapterEntry('non-existent');
      expect(entry).toBeNull();
    });
  });

  describe('Asset Lookups', () => {
    beforeEach((done) => {
      service.loadManifestFromObject(validManifest).subscribe(() => done());
    });

    it('should get asset by ID', () => {
      const asset = service.getAsset('img-1');
      expect(asset).toBeTruthy();
      expect(asset?.id).toBe('img-1');
      expect(asset?.category).toBe('image');
    });

    it('should return null for non-existent asset', () => {
      const asset = service.getAsset('non-existent');
      expect(asset).toBeNull();
    });

    it('should check if asset exists', () => {
      expect(service.hasAsset('img-1')).toBe(true);
      expect(service.hasAsset('non-existent')).toBe(false);
    });

    it('should get all asset IDs', () => {
      const ids = service.getAssetIds();
      expect(ids).toContain('img-1');
      expect(ids).toContain('aud-1');
      expect(ids.length).toBe(2);
    });

    it('should get asset count', () => {
      expect(service.getAssetCount()).toBe(2);
    });
  });

  describe('Manifest without assets', () => {
    beforeEach((done) => {
      const manifestWithoutAssets = {
        ...validManifest,
        assets: undefined,
      };
      service.loadManifestFromObject(manifestWithoutAssets).subscribe(() => done());
    });

    it('should handle manifest without assets', () => {
      expect(service.getAssetCount()).toBe(0);
      expect(service.getAssetIds()).toEqual([]);
      expect(service.hasAsset('any-id')).toBe(false);
    });
  });

  describe('clearManifest', () => {
    beforeEach((done) => {
      service.loadManifestFromObject(validManifest).subscribe(() => done());
    });

    it('should clear manifest and indexes', () => {
      expect(service.hasManifest()).toBe(true);

      service.clearManifest();

      expect(service.hasManifest()).toBe(false);
      expect(service.getManifest()).toBeNull();
      expect(service.getPanel('p-1')).toBeNull();
      expect(service.getChapter('ch-1')).toBeNull();
      expect(service.getAsset('img-1')).toBeNull();
    });
  });

  describe('Operations without manifest', () => {
    it('should return empty/null results when no manifest loaded', () => {
      expect(service.getPanel('any-id')).toBeNull();
      expect(service.getChapter('any-id')).toBeNull();
      expect(service.getAsset('any-id')).toBeNull();
      expect(service.getPanelIds()).toEqual([]);
      expect(service.getChapterIds()).toEqual([]);
      expect(service.getAssetIds()).toEqual([]);
      expect(service.getPanelCount()).toBe(0);
      expect(service.getChapterCount()).toBe(0);
      expect(service.getAssetCount()).toBe(0);
      expect(service.hasPanel('any-id')).toBe(false);
      expect(service.hasChapter('any-id')).toBe(false);
      expect(service.hasAsset('any-id')).toBe(false);
    });
  });
});
