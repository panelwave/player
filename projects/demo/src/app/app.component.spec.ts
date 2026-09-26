import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { AppComponent } from './app.component';

describe('AppComponent (demo)', () => {
  let http: HttpTestingController;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [provideHttpClient(), provideHttpClientTesting()],
    }).compileComponents();
    http = TestBed.inject(HttpTestingController);
  });

  function create() {
    const fixture = TestBed.createComponent(AppComponent);
    // Karma runs specs inside an iframe; the demo would treat that as the
    // CMS embed and hide its chrome.
    spyOn(fixture.componentInstance as unknown as { isFramed(): boolean }, 'isFramed').and.returnValue(false);
    return { fixture, app: fixture.componentInstance };
  }

  it('renders the demo title', () => {
    const { fixture } = create();
    fixture.detectChanges();
    http.match(() => true).forEach((r) => r.flush({}));
    expect((fixture.nativeElement as HTMLElement).querySelector('h1')?.textContent).toContain('PanelWave Player Demo');
  });

  it('loads the bundled sample manifest by default and records the load time', () => {
    const { fixture, app } = create();
    fixture.detectChanges();
    const req = http.expectOne('assets/sample-manifest.json');
    req.flush({ panelwave: { version: '1.5.0' }, meta: {}, chapters: [] });
    expect(app.loading).toBeFalse();
    expect(app.loadMs).not.toBeNull();
    expect(app.events[0].type).toBe('manifestLoaded');
  });

  it('sizes the preview frame from the selected device', () => {
    const { app } = create();
    expect(app.frameWidth).toBeNull();
    app.setDevice('phone');
    expect(app.frameWidth).toBe('390px');
    expect(app.frameHeight).toBe('844px');
    app.setDevice('no-such-device');
    expect(app.device).toBe('phone');
  });

  it('keeps the event log newest-first and capped', () => {
    const { app } = create();
    for (let i = 0; i < 250; i++) app.log('tick', { i });
    expect(app.events.length).toBe(200);
    expect(app.events[0].detail).toBe('{"i":249}');
  });

  it('loads a manifest from a URL and ignores empty input', () => {
    const { app } = create();
    app.loadFromUrl(new Event('submit'), '   ');
    http.expectNone('   ');
    app.loadFromUrl(new Event('submit'), 'https://example.test/m.json');
    http.expectOne('https://example.test/m.json').flush({ panelwave: {}, meta: {}, chapters: [] });
    expect(app.activeDemo).toBe('');
    expect(app.manifest).not.toBeNull();
  });

  afterEach(() => {
    http.match(() => true).forEach((r) => r.flush({}));
  });
});
