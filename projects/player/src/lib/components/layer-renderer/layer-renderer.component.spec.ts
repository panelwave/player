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

  describe('video variant selection', () => {
    it('picks the forward (non-reverse) variant for src and streaming', () => {
      const asset: AssetCatalogItemVideo = {
        id: 'asset-video-1',
        category: 'video',
        variants: [
          { src: 'clip-rev.mp4', mime: 'video/mp4', w: 1920, h: 1080, direction: 'reverse' },
          { src: 'clip.mp4', mime: 'video/mp4', w: 1920, h: 1080, streaming: true },
        ],
      } as AssetCatalogItemVideo;
      spyOn(manifestService, 'getAsset').and.returnValue(asset);

      expect(component.getVideoSrc()).toBe('clip.mp4');
      expect(component.getVideoReverseSrc()).toBe('clip-rev.mp4');
      expect(component.getVideoStreaming()).toBeTrue();
    });

    it('falls back to the first variant when none is marked forward', () => {
      const asset: AssetCatalogItemVideo = {
        id: 'asset-video-1',
        category: 'video',
        variants: [{ src: 'only.mp4', mime: 'video/mp4', w: 1, h: 1 }],
      };
      spyOn(manifestService, 'getAsset').and.returnValue(asset);

      expect(component.getVideoSrc()).toBe('only.mp4');
      expect(component.getVideoReverseSrc()).toBe('');
    });

    it('returns the RAW direct src (URL resolution happens downstream, not double-applied)', () => {
      spyOn(manifestService, 'getAsset').and.returnValue(null);
      component.layer = { kind: 'video', id: 'v1', src: 'clip.mp4' } as unknown as VideoLayer;

      // No resolution here — pw-video-layer (AssetUrlService) owns it.
      expect(component.getVideoSrc()).toBe('clip.mp4');
    });
  });

  describe('getTextStyles with styleRef presets (schema 1.3+)', () => {
    const manifestWithPresets = {
      settings: {
        typography: {
          textStyles: {
            caption: { font: 'CrimsonPro', sizePt: 14, color: '#fdf6e3', strokeColor: '#0a1a24', strokeWidth: 3 },
          },
        },
      },
    } as never;

    it('resolves a styleRef against settings.typography.textStyles', () => {
      spyOn(manifestService, 'getManifest').and.returnValue(manifestWithPresets);
      component.layer = { kind: 'text', id: 't1', text: { 'en-US': 'Hi' }, styleRef: 'caption' };

      const styles = component.getTextStyles();
      expect(styles['font-family']).toBe('CrimsonPro');
      expect(styles['font-size']).toBe('14pt');
      expect(styles['color']).toBe('#fdf6e3');
      expect(styles['-webkit-text-stroke']).toBe('3px #0a1a24');
    });

    it('lets inline style fields override the referenced preset', () => {
      spyOn(manifestService, 'getManifest').and.returnValue(manifestWithPresets);
      component.layer = {
        kind: 'text', id: 't1', text: { 'en-US': 'Hi' },
        styleRef: 'caption', style: { color: '#ff0000', sizePt: 20 },
      };

      const styles = component.getTextStyles();
      expect(styles['color']).toBe('#ff0000');
      expect(styles['font-size']).toBe('20pt');
      expect(styles['font-family']).toBe('CrimsonPro'); // still from the preset
    });

    it('lets flat editor props win over the preset', () => {
      spyOn(manifestService, 'getManifest').and.returnValue(manifestWithPresets);
      component.layer = {
        kind: 'text', id: 't1', text: { 'en-US': 'Hi' },
        styleRef: 'caption', fontSize: 22, color: '#00ff00',
      };

      const styles = component.getTextStyles();
      expect(styles['font-size']).toBe('22px');
      expect(styles['color']).toBe('#00ff00');
    });

    it('ignores an unknown styleRef', () => {
      spyOn(manifestService, 'getManifest').and.returnValue(manifestWithPresets);
      component.layer = { kind: 'text', id: 't1', text: { 'en-US': 'Hi' }, styleRef: 'does-not-exist' };

      expect(component.getTextStyles()).toEqual({});
    });

    it('applies an inline style object without any styleRef', () => {
      spyOn(manifestService, 'getManifest').and.returnValue(null);
      component.layer = {
        kind: 'text', id: 't1', text: { 'en-US': 'Hi' },
        style: { font: 'Helvetica', sizePt: 12 },
      };

      const styles = component.getTextStyles();
      expect(styles['font-family']).toBe('Helvetica');
      expect(styles['font-size']).toBe('12pt');
    });
  });
  describe('reference-space placement (panelLayers)', () => {
    // 2:1 artwork → reference space 2048 × 1024.
    const background = { kind: 'image', id: 'bg', assetId: 'art', z: 0, x: -9, y: -20 } as any;
    const inset = { kind: 'image', id: 'inset', assetId: 'art', z: 1, x: 512, y: 256, width: 1024, height: 512 } as any;
    const caption = { kind: 'text', id: 'cap', z: 2, x: 0, y: 768, width: 2048, height: 256, fontSize: 64, text: { 'en-US': 'Hi' } } as any;
    const layers = [background, inset, caption];

    beforeEach(() => {
      spyOn(manifestService, 'getAsset').and.returnValue({ id: 'art', variants: [{ src: 'a.png', w: 2000, h: 1000 }] } as any);
      spyOn(manifestService, 'getManifest').and.returnValue(null);
    });

    it('pins the background to the whole panel, ignoring its stored offset', () => {
      component.layer = background;
      component.panelLayers = layers;
      const styles = component.getLayerStyles();
      expect([styles['left'], styles['top'], styles['width'], styles['height']]).toEqual(['0%', '0%', '100%', '100%']);
    });

    it('places other layers in percent of the reference space', () => {
      component.layer = inset;
      component.panelLayers = layers;
      const styles = component.getLayerStyles();
      expect([styles['left'], styles['top'], styles['width'], styles['height']]).toEqual(['25%', '25%', '50%', '50%']);
      expect(styles['z-index']).toBe('1');
    });

    it('scales a text layer font with its box', () => {
      component.layer = caption;
      component.panelLayers = layers;
      expect(component.getLayerStyles()['container-type']).toBe('size');
      // 64 reference px in a 256 reference-px-tall box = a quarter of it.
      expect(component.getTextStyles()['font-size']).toBe('calc(64 * 100cqh / 256)');
    });

    it('keeps raw px offsets without panelLayers (legacy hosts)', () => {
      component.layer = inset;
      const styles = component.getLayerStyles();
      expect([styles['left'], styles['top'], styles['width'], styles['height']]).toEqual(['512px', '256px', '100%', '100%']);
    });
  });
});

describe('LayerRendererComponent image loading priority', () => {
  let fixture: ComponentFixture<LayerRendererComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LayerRendererComponent],
      providers: [provideHttpClient(withInterceptorsFromDi()), provideHttpClientTesting()],
    }).compileComponents();
    fixture = TestBed.createComponent(LayerRendererComponent);
    fixture.componentInstance.layer = { kind: 'image', id: 'img-1', assetId: 'asset-1' };
  });

  const img = () => fixture.nativeElement.querySelector('img.layer-image') as HTMLImageElement;

  it('loads the current panel eagerly at high priority (largest contentful paint)', () => {
    fixture.componentInstance.viewActive = true;
    fixture.detectChanges();
    expect(img().getAttribute('loading')).toBe('eager');
    expect(img().getAttribute('fetchpriority')).toBe('high');
  });

  it('keeps every other panel lazy', () => {
    fixture.componentInstance.viewActive = false;
    fixture.detectChanges();
    expect(img().getAttribute('loading')).toBe('lazy');
    expect(img().hasAttribute('fetchpriority')).toBeFalse();
  });
});
