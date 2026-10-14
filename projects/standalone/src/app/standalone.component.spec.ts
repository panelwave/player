import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import type { PanelWaveManifest } from 'player';
import { BundledTranslateLoader } from './app.config';
import { StandaloneComponent } from './standalone.component';

const manifest = {
  panelwave: { version: '1.6.0' },
  meta: { title: { 'en-US': 'Packaged Work' }, locales: ['en-US'], default_locale: 'en-US' },
  chapters: [],
} as unknown as PanelWaveManifest;

interface Globals {
  PANELWAVE_MANIFEST?: unknown;
  PANELWAVE_CONFIG?: unknown;
}

describe('StandaloneComponent', () => {
  const globals = window as unknown as Globals;
  let savedTitle: string;

  beforeEach(() => {
    savedTitle = document.title;
    TestBed.configureTestingModule({
      imports: [StandaloneComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    });
    // Keep the player shell out of these tests: only the boot is under test.
    TestBed.overrideComponent(StandaloneComponent, { set: { template: '' } });
  });

  afterEach(() => {
    delete globals.PANELWAVE_MANIFEST;
    delete globals.PANELWAVE_CONFIG;
    document.title = savedTitle;
  });

  it('starts from the inline manifest and config without any request', () => {
    globals.PANELWAVE_MANIFEST = manifest;
    globals.PANELWAVE_CONFIG = { showCover: false, showToolbar: false };
    const fixture = TestBed.createComponent(StandaloneComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(c.state()).toBe('ready');
    expect(c.manifest()).toBe(manifest);
    expect(c.config()).toEqual({ locale: undefined, showCover: false, showToolbar: false });
    expect(c.locale()).toBe('en-US');
    TestBed.inject(HttpTestingController).verify();
  });

  it('names the tab after the work when index.html kept the placeholder title', () => {
    document.title = 'PanelWave';
    globals.PANELWAVE_MANIFEST = manifest;
    TestBed.createComponent(StandaloneComponent).detectChanges();
    expect(document.title).toBe('Packaged Work');
  });

  it('keeps a title the export wrote into index.html', () => {
    document.title = 'My Site';
    globals.PANELWAVE_MANIFEST = manifest;
    TestBed.createComponent(StandaloneComponent).detectChanges();
    expect(document.title).toBe('My Site');
  });

  it('fetches panelwave.json + panelwave.config.json without an inline manifest (karma runs on http)', () => {
    const fixture = TestBed.createComponent(StandaloneComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('./panelwave.json').flush(manifest);
    http.expectOne('./panelwave.config.json').flush({ showToolbar: false });
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.config().showToolbar).toBeFalse();
  });

  it('uses defaults when the config file is missing', () => {
    const fixture = TestBed.createComponent(StandaloneComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('./panelwave.json').flush(manifest);
    http.expectOne('./panelwave.config.json').flush('', { status: 404, statusText: 'Not Found' });
    expect(fixture.componentInstance.state()).toBe('ready');
    expect(fixture.componentInstance.config().showCover).toBeTrue();
  });

  it('shows the error state when panelwave.json is not a manifest', () => {
    const fixture = TestBed.createComponent(StandaloneComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    http.expectOne('./panelwave.json').flush({ hello: 'world' });
    http.expectOne('./panelwave.config.json').flush({});
    expect(fixture.componentInstance.state()).toBe('error');
  });

  it('shows the error state when panelwave.json cannot be loaded', () => {
    const fixture = TestBed.createComponent(StandaloneComponent);
    fixture.detectChanges();
    const http = TestBed.inject(HttpTestingController);
    const config = http.expectOne('./panelwave.config.json');
    http.expectOne('./panelwave.json').flush('', { status: 404, statusText: 'Not Found' });
    expect(fixture.componentInstance.state()).toBe('error');
    // forkJoin drops the sibling request once the manifest fails.
    expect(config.cancelled).toBeTrue();
  });

  it('a print config marks <html> with pw-print and forces the static page view', () => {
    globals.PANELWAVE_MANIFEST = manifest;
    globals.PANELWAVE_CONFIG = { print: true, pageFormat: 'a4-portrait' };
    const fixture = TestBed.createComponent(StandaloneComponent);
    fixture.detectChanges();
    const c = fixture.componentInstance;
    expect(document.documentElement.classList.contains('pw-print')).toBeTrue();
    expect(c.config()).toEqual(jasmine.objectContaining({
      showCover: false, showToolbar: false, viewMode: 'page', reducedMotion: true, pageFormat: 'a4-portrait',
    }));
    document.documentElement.classList.remove('pw-print');
  });

  it('leaves <html> alone without print', () => {
    globals.PANELWAVE_MANIFEST = manifest;
    TestBed.createComponent(StandaloneComponent).detectChanges();
    expect(document.documentElement.classList.contains('pw-print')).toBeFalse();
  });
});

describe('BundledTranslateLoader', () => {
  it('serves the bundled language and falls back to English', async () => {
    const loader = new BundledTranslateLoader();
    const de = (await firstValueFrom(loader.getTranslation('de-DE'))) as Record<string, Record<string, string>>;
    const fr = (await firstValueFrom(loader.getTranslation('fr'))) as Record<string, Record<string, string>>;
    expect(de['toolbar']['view']).toBe('Ansicht');
    expect(fr['toolbar']['view']).toBe('View');
  });
});
