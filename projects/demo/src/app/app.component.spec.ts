import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { ManifestService } from 'player';
import type { PanelWaveManifest, PlayerPanelChangeEvent } from 'player';
import { AppComponent } from './app.component';

/** Dispatch a host message the way the browser delivers a cross-document postMessage. */
function post(data: unknown, origin = window.location.origin): void {
  window.dispatchEvent(new MessageEvent('message', { data, origin }));
}

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

  describe('entitlements (CMS preview simulator)', () => {
    const manifest = { panelwave: { version: '1.6.0' }, meta: {}, chapters: [] };

    it('maps the embed config entitlements onto the shell snapshot', () => {
      const { fixture, app } = create();
      fixture.detectChanges();
      http.match(() => true).forEach((r) => r.flush(manifest));
      expect(app.entitlementSnapshot).toBeUndefined();

      post({ type: 'config', data: { entitlements: ['free', 'premium', 'purchased:prod-123', 'age-verified'] } });
      expect(app.entitlementSnapshot).toEqual({
        subscriptionTier: 'premium',
        purchasedProductIds: ['prod-123'],
        ageVerified: true,
        age: 99,
      });
      expect(app.entitlementTokens).toEqual(['free', 'premium', 'purchased:prod-123', 'age-verified']);

      // A config without entitlements drops the override again.
      post({ type: 'config', data: {} });
      expect(app.entitlementSnapshot).toBeUndefined();
      expect(app.entitlementTokens).toBeNull();
      fixture.destroy();
    });

    it('reads ?entitlements= for the standalone demo', () => {
      const original = window.location.href;
      history.replaceState(null, '', '?entitlements=purchased:book,age-verified');
      try {
        const { fixture, app } = create();
        fixture.detectChanges();
        http.match(() => true).forEach((r) => r.flush(manifest));
        expect(app.entitlementSnapshot).toEqual({
          subscriptionTier: null,
          purchasedProductIds: ['book'],
          ageVerified: true,
          age: 99,
        });
        fixture.destroy();
      } finally {
        history.replaceState(null, '', original);
      }
    });
  });
});

/**
 * Embed bridge protocol v1 (docs/EMBED_PROTOCOL.md). The shell itself is
 * replaced by a fake: the bridge's job is routing messages to the shell's
 * public API and reporting back to the host.
 */
describe('AppComponent embed bridge (protocol v1)', () => {
  const ORIGIN = window.location.origin;

  const manifest = (): PanelWaveManifest =>
    ({
      panelwave: { version: '1.7.0' },
      meta: { id: 'w1', title: { 'en-US': 'Work' } },
      chapters: [
        {
          id: 'c1',
          panels: { p1: { layers: [] }, p2: { title: { 'en-US': 'Two' }, layers: [] } },
          graph: { entry: 'p1', edges: [{ from: 'p1', to: 'p2' }] },
        },
      ],
    }) as unknown as PanelWaveManifest;

  interface FakeShell {
    currentChapter: unknown;
    currentPage?: { id: string };
    viewMode: string;
    coverVisible: boolean;
    visitedPanelIds: string[];
    paywallVisible: boolean;
    paywallGate: unknown;
    variableDefinitions: { id: string; scope: string; default?: unknown }[];
    getCurrentPanelId: jasmine.Spy;
    seedVariable: jasmine.Spy;
    navigateToPanel: jasmine.Spy;
    hideCover: jasmine.Spy;
    setAudioEnabled: jasmine.Spy;
    onLocaleChange: jasmine.Spy;
  }

  let app: AppComponent;
  let host: { postMessage: jasmine.Spy };
  let shell: FakeShell;

  const posted = (type: string) => host.postMessage.calls.allArgs().filter(([m]) => m.type === type).map(([m]) => m);

  beforeEach(async () => {
    jasmine.clock().install();
    const work = manifest();
    await TestBed.configureTestingModule({
      imports: [AppComponent],
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        {
          provide: ManifestService,
          useValue: {
            getPanel: (id: string) => {
              const panel = (work.chapters[0].panels as Record<string, unknown>)[id];
              return panel ? { panel, chapterId: 'c1' } : null;
            },
          },
        },
      ],
    })
      .overrideComponent(AppComponent, { set: { template: '', imports: [] } })
      .compileComponents();

    const fixture = TestBed.createComponent(AppComponent);
    app = fixture.componentInstance;
    host = { postMessage: jasmine.createSpy('host.postMessage') };
    spyOn(app as unknown as { isFramed(): boolean }, 'isFramed').and.returnValue(true);
    spyOn(app as unknown as { hostWindow(): unknown }, 'hostWindow').and.returnValue(host);

    shell = {
      currentChapter: work.chapters[0],
      currentPage: undefined,
      viewMode: 'panel',
      coverVisible: false,
      visitedPanelIds: ['p1'],
      paywallVisible: false,
      paywallGate: null,
      variableDefinitions: [{ id: 'tries', scope: 'session', default: 0 }],
      getCurrentPanelId: jasmine.createSpy('getCurrentPanelId').and.returnValue('p1'),
      seedVariable: jasmine.createSpy('seedVariable'),
      navigateToPanel: jasmine.createSpy('navigateToPanel').and.returnValue(Promise.resolve()),
      hideCover: jasmine.createSpy('hideCover'),
      setAudioEnabled: jasmine.createSpy('setAudioEnabled'),
      onLocaleChange: jasmine.createSpy('onLocaleChange'),
    };
    fixture.detectChanges();
  });

  afterEach(() => {
    jasmine.clock().uninstall();
  });

  /** The shell exists once a manifest is loaded: route `shell()` to the fake. */
  function mountShell(): void {
    Object.defineProperty(app, 'shell', { value: () => shell, configurable: true });
  }

  function loadWork(data: Record<string, unknown> = {}): PanelWaveManifest {
    const work = manifest();
    post({ type: 'config', data: { manifest: work, locale: 'de-DE', variables: { tries: 1 }, ...data } });
    jasmine.clock().tick(1);
    mountShell();
    return work;
  }

  it('greets the host on load, only at the host origin', () => {
    expect(host.postMessage).toHaveBeenCalledWith({ type: 'pw:hello', protocol: 2 }, ORIGIN);
    expect(app.hostOrigin).toBe(ORIGIN);
    expect(app.embedMode).toBeTrue();
  });

  it('ignores messages from another origin', () => {
    post({ type: 'config', data: { manifest: manifest() } }, 'https://evil.example');
    jasmine.clock().tick(1);
    expect(app.manifest).toBeNull();
  });

  it('creates the shell on the first config and seeds locale, variables and inputs', () => {
    const work = loadWork({
      entitlements: ['premium'],
      autoplay: true,
      muted: true,
      viewMode: 'panel',
      pageFormat: 'phone-portrait',
      secondsPerPanel: 3,
      showCover: false,
      reducedMotion: true,
      initialPanelId: 'p2',
      initialViewMode: 'page',
    });
    expect(app.manifest).toBe(work);
    expect(app.locale).toBe('de-DE');
    expect(app.initialVariables).toEqual({ tries: 1 });
    expect(app.entitlementSnapshot?.subscriptionTier).toBe('premium');
    expect(app.autoplay).toBeTrue();
    expect(app.muted).toBeTrue();
    expect(app.viewModeOverride).toBe('panel');
    expect(app.pageFormat).toBe('phone-portrait');
    expect(app.secondsPerPanel).toBe(3);
    expect(app.showCover).toBeFalse();
    expect(app.reducedMotion).toBeTrue();
    expect(app.initialPanelId).toBe('p2');
    expect(app.initialViewMode).toBe('page');
  });

  it('keeps the running story on a re-posted config with the same manifest (old consumer) and diffs variables', () => {
    const work = loadWork();
    const again = JSON.parse(JSON.stringify(work));
    post({ type: 'config', data: { manifest: again, locale: 'en-US', variables: { tries: 2, flag: true }, autoplay: true } });
    jasmine.clock().tick(1);

    expect(app.manifest).toBe(work);
    expect(shell.seedVariable.calls.allArgs()).toEqual([
      ['tries', 2],
      ['flag', true],
    ]);
    expect(shell.onLocaleChange).toHaveBeenCalledWith('en-US');
    expect(app.autoplay).toBeTrue();

    // A removed override returns to the definition's default.
    shell.seedVariable.calls.reset();
    post({ type: 'config', data: { manifest: again, variables: { flag: true } } });
    expect(shell.seedVariable.calls.allArgs()).toEqual([['tries', 0]]);
  });

  it('restarts on a changed manifest, on restart: true and on a restart message', () => {
    const work = loadWork();
    const changed = manifest();
    (changed.chapters[0].panels as Record<string, unknown>)['p3'] = { layers: [] };
    post({ type: 'config', data: { manifest: changed } });
    expect(app.manifest).toBeNull();
    jasmine.clock().tick(1);
    expect(app.manifest).toBe(changed);

    post({ type: 'config', data: { manifest: JSON.parse(JSON.stringify(changed)), restart: true, variables: { tries: 7 } } });
    expect(app.manifest).toBeNull();
    jasmine.clock().tick(1);
    expect(app.manifest).not.toBe(changed);
    expect(app.initialVariables).toEqual({ tries: 7 });
    expect(app.manifest).not.toBe(work);

    const current = app.manifest;
    post({ type: 'restart' });
    expect(app.manifest).toBeNull();
    jasmine.clock().tick(1);
    expect(app.manifest).toBe(current);
    expect(app.initialVariables).toEqual({ tries: 7 });
  });

  it('applies setVariable, setLocale, setEntitlements and setOptions live, without a restart', () => {
    const work = loadWork();

    post({ type: 'setVariable', key: 'tries', value: 3 });
    expect(shell.seedVariable).toHaveBeenCalledWith('tries', 3);

    post({ type: 'setLocale', locale: 'fr-FR' });
    expect(app.locale).toBe('fr-FR');
    expect(shell.onLocaleChange).toHaveBeenCalledWith('fr-FR');

    post({ type: 'setEntitlements', entitlements: ['pro', 'age-verified'] });
    expect(app.entitlementSnapshot).toEqual(jasmine.objectContaining({ subscriptionTier: 'pro', ageVerified: true }));
    expect(app.entitlementTokens).toEqual(['pro', 'age-verified']);

    shell.coverVisible = true;
    post({
      type: 'setOptions',
      data: { autoplay: true, muted: true, viewMode: 'canvas', pageFormat: 'a4', secondsPerPanel: 2, reducedMotion: true, showCover: false },
    });
    expect(app.autoplay).toBeTrue();
    expect(app.viewModeOverride).toBe('canvas');
    expect(app.pageFormat).toBe('a4');
    expect(app.secondsPerPanel).toBe(2);
    expect(app.reducedMotion).toBeTrue();
    expect(app.showCover).toBeFalse();
    expect(shell.hideCover).toHaveBeenCalled();
    expect(shell.setAudioEnabled).toHaveBeenCalledWith(false);

    post({ type: 'setOptions', data: { muted: false } });
    expect(shell.setAudioEnabled).toHaveBeenCalledWith(true);

    expect(app.manifest).toBe(work);
  });

  it('navigates to a panel of the work and reports unknown panels in the state', async () => {
    loadWork();
    shell.coverVisible = true;
    post({ type: 'navigate', panelId: 'p2' });
    await Promise.resolve();
    expect(shell.navigateToPanel).toHaveBeenCalledWith('c1', 'p2');
    expect(shell.hideCover).toHaveBeenCalled();

    post({ type: 'navigate', panelId: 'nope' });
    expect(shell.navigateToPanel.calls.count()).toBe(1);
    expect(app.buildState().errors).toEqual(['navigate: unknown panel "nope"']);
  });

  it('answers getState with the live snapshot', () => {
    loadWork({ entitlements: ['basic'] });
    shell.visitedPanelIds = ['p1', 'p2'];
    shell.getCurrentPanelId.and.returnValue('p1');
    post({ type: 'getState' });

    const [state] = posted('pw:state');
    expect(state.data).toEqual(
      jasmine.objectContaining({
        chapterId: 'c1',
        pageId: null,
        panelId: 'p1',
        viewMode: 'panel',
        entitlements: ['basic'],
        history: ['p1', 'p2'],
        nextPanels: [{ panelId: 'p2', title: 'Two' }],
        paywallGate: null,
        errors: [],
        loadTimeMs: null,
      })
    );
    expect(state.data.preloadStatus).toEqual(jasmine.objectContaining({ queued: 0 }));
    expect(host.postMessage.calls.mostRecent().args[1]).toBe(ORIGIN);
  });

  it('forwards shell outputs as pw:event (ids only for panelChange) and pushes one debounced pw:state', () => {
    loadWork();
    host.postMessage.calls.reset();
    const chapter = manifest().chapters[0];
    const event = { panelId: 'p2', previousPanelId: 'p1', chapter, panel: chapter.panels['p2'] } as unknown as PlayerPanelChangeEvent;
    app.onPanelChange(event);
    app.onShellEvent('variableChange', { key: 'tries', value: 2 });
    app.onChapterChange(chapter);

    expect(posted('pw:event')).toEqual([
      { type: 'pw:event', name: 'panelChange', data: { panelId: 'p2', previousPanelId: 'p1', chapterId: 'c1' } },
      { type: 'pw:event', name: 'variableChange', data: { key: 'tries', value: 2 } },
      { type: 'pw:event', name: 'chapterChange', data: { chapterId: 'c1', title: null } },
    ]);
    expect(posted('pw:state')).toEqual([]);
    jasmine.clock().tick(100);
    expect(posted('pw:state').length).toBe(1);
  });

  it('reports ready with the load time and applies the host mute', () => {
    loadWork({ muted: true });
    host.postMessage.calls.reset();
    jasmine.clock().tick(5);
    app.onPlayerReady();
    expect(shell.setAudioEnabled).toHaveBeenCalledWith(false);
    expect(posted('pw:ready')).toEqual([{ type: 'pw:ready' }]);
    expect(posted('pw:event')).toEqual([{ type: 'pw:event', name: 'ready', data: {} }]);
    expect(app.loadMs).not.toBeNull();
    jasmine.clock().tick(100);
    expect(posted('pw:state')[0].data.loadTimeMs).toBe(app.loadMs);
  });

  it('collects errors for the state and forwards them', () => {
    loadWork();
    host.postMessage.calls.reset();
    spyOn(console, 'error');
    app.onError(new Error('boom'));
    expect(posted('pw:event')).toEqual([{ type: 'pw:event', name: 'error', data: { message: 'boom' } }]);
    expect(app.buildState().errors).toEqual(['boom']);
  });
});
