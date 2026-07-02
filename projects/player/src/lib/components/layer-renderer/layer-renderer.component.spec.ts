/**
 * Layer Renderer Component Tests
 * Focused on video poster resolution (schema 1.1+ `AssetCatalogItemVideo.poster`).
 */

import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { LayerRendererComponent } from './layer-renderer.component';
import { ManifestService } from '../../services/manifest.service';
import type { AssetCatalogItemVideo } from '../../types';
import type { VideoLayer } from '../../types/panel.types';

describe('LayerRendererComponent', () => {
  let fixture: ComponentFixture<LayerRendererComponent>;
  let component: LayerRendererComponent;
  let manifestService: ManifestService;

  const videoLayer: VideoLayer = {
    kind: 'video',
    id: 'video-1',
    assetId: 'asset-video-1',
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayerRendererComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();

    fixture = TestBed.createComponent(LayerRendererComponent);
    component = fixture.componentInstance;
    manifestService = TestBed.inject(ManifestService);
    component.layer = videoLayer;
  });

  describe('getVideoPoster', () => {
    it('resolves the poster src from the catalog asset', () => {
      const asset: AssetCatalogItemVideo = {
        id: 'asset-video-1',
        category: 'video',
        variants: [{ src: 'clip.mp4', mime: 'video/mp4', w: 1920, h: 1080 }],
        poster: { src: 'clip-poster.jpg', mime: 'image/jpeg', w: 1920, h: 1080 },
      };
      spyOn(manifestService, 'getAsset').and.returnValue(asset);

      expect(component.getVideoPoster()).toBe('clip-poster.jpg');
    });

    it('returns an empty string when the asset has no poster', () => {
      const asset: AssetCatalogItemVideo = {
        id: 'asset-video-1',
        category: 'video',
        variants: [{ src: 'clip.mp4', mime: 'video/mp4', w: 1920, h: 1080 }],
      };
      spyOn(manifestService, 'getAsset').and.returnValue(asset);

      expect(component.getVideoPoster()).toBe('');
    });

    it('returns an empty string without crashing when the asset is not found', () => {
      spyOn(manifestService, 'getAsset').and.returnValue(null);

      expect(component.getVideoPoster()).toBe('');
    });

    it('returns an empty string for a non-video layer', () => {
      component.layer = { kind: 'image', id: 'img-1', assetId: 'asset-1' };

      expect(component.getVideoPoster()).toBe('');
    });
  });
});
