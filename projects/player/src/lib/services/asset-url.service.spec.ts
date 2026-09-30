import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AssetUrlService } from './asset-url.service';
import { ManifestService } from './manifest.service';
import type { PanelWaveManifest } from '../types';

describe('AssetUrlService', () => {
  const minimal = (assets?: PanelWaveManifest['assets']): PanelWaveManifest =>
    ({
      panelwave: { version: '1.6.0' },
      meta: { id: 'w', title: { 'en-US': 'W' }, locales: ['en-US'], default_locale: 'en-US' },
      chapters: [{ id: 'c', panels: { p: { layers: [] } }, graph: { entry: 'p', edges: [{ from: 'p', to: 'p' }] } }],
      ...(assets ? { assets } : {}),
    }) as unknown as PanelWaveManifest;

  let service: AssetUrlService;
  let manifests: ManifestService;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideHttpClient(), provideHttpClientTesting()] });
    service = TestBed.inject(AssetUrlService);
    manifests = TestBed.inject(ManifestService);
    http = TestBed.inject(HttpTestingController);
  });

  it('resolves against assets.base of the loaded manifest', () => {
    manifests.loadManifestFromObject(minimal({ base: { mediaBase: 'https://cdn/x/' }, catalog: [] })).subscribe();
    expect(service.resolve('image/a.webp', 'image')).toBe('https://cdn/x/image/a.webp');
    expect(service.resolve('https://abs/a.webp', 'image')).toBe('https://abs/a.webp');
  });

  it('falls back to the URL the manifest was loaded from', () => {
    manifests.loadManifestFromUrl('https://host/works/tarmac/manifest.json').subscribe();
    http.expectOne('https://host/works/tarmac/manifest.json').flush(minimal());
    expect(service.resolve('assets/sha256-a/w640.webp', 'image')).toBe('https://host/works/tarmac/assets/sha256-a/w640.webp');
  });

  it('returns relative references unchanged for object manifests without a base', () => {
    manifests.loadManifestFromObject(minimal()).subscribe();
    expect(service.resolve('a.webp', 'image')).toBe('a.webp');
    expect(service.resolve(undefined)).toBe('');
  });
});
