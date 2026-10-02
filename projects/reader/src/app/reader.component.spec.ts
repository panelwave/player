import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PaywallService, PlayerShellComponent } from 'player';
import { ReaderComponent } from './reader.component';

const validManifest = (defaultLocale = 'en-US', extraPanel = {}, rules?: unknown[]) => ({
  panelwave: { version: '1.0.0' },
  meta: {
    id: 'w',
    title: { 'en-US': 'W' },
    locales: ['en-US', 'de-DE'],
    default_locale: defaultLocale,
  },
  chapters: [
    {
      id: 'c',
      panels: { a: { id: 'a' }, ...extraPanel },
      graph: { entry: 'a', edges: [] },
    },
  ],
  ...(rules ? { paywall: { rules } } : {}),
});

/** A public manifest: b is sold (stripped), c is age-gated (kept). */
const gatedRules = [
  {
    id: 'sale',
    scope: 'panel',
    refId: 'b',
    entitlementType: 'purchase',
    requiredProductIds: ['b-product'],
  },
  { id: 'adult', scope: 'panel', refId: 'c', entitlementType: 'age_gate', minimumAge: 18 },
  {
    id: 'club',
    scope: 'extras',
    refId: 'bonus',
    entitlementType: 'subscription',
    subscriptionTiers: ['gold'],
  },
];
const gatedPanels = { b: { id: 'b', 'x-locked': true }, c: { id: 'c' } };

describe('ReaderComponent', () => {
  let http: HttpTestingController;

  function setup(boot?: unknown) {
    (window as unknown as { __PW_READER__?: unknown }).__PW_READER__ = boot;
    TestBed.configureTestingModule({
      imports: [ReaderComponent],
      providers: [provideHttpClient(), provideHttpClientTesting(), provideTranslateService()],
    });
    http = TestBed.inject(HttpTestingController);
    const fixture = TestBed.createComponent(ReaderComponent);
    fixture.detectChanges();
    return fixture;
  }

  afterEach(() => {
    delete (window as unknown as { __PW_READER__?: unknown }).__PW_READER__;
  });

  function shellOf(fixture: ReturnType<typeof setup>): PlayerShellComponent {
    const dbg = fixture.debugElement.children.find(
      (d) => d.componentInstance instanceof PlayerShellComponent
    );
    return dbg?.componentInstance as PlayerShellComponent;
  }

  it('shows a spinner, then mounts the shell', () => {
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false, locale: 'de-DE' });
    expect(fixture.nativeElement.querySelector('.pwr-spinner')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('pw-player-shell')).toBeNull();

    http.expectOne('https://x/m.json').flush(validManifest());
    fixture.detectChanges();

    const shell = fixture.nativeElement.querySelector('pw-player-shell');
    expect(shell).toBeTruthy();
    expect(shell.classList).toContain('pw-reader-shell');
    expect(fixture.nativeElement.querySelector('.pwr-spinner')).toBeNull();
    expect(fixture.nativeElement.querySelector('a.pw-badge')).toBeNull(); // the shell's PanelWave icon replaced the badge

    const inst = shellOf(fixture);
    expect(inst.locale).toBe('de-DE'); // boot locale wins over manifest default
    expect(inst.showToolbar).toBeFalse();
  });

  it('leaves document.title to the server', () => {
    document.title = 'Server Title';
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false, title: 'Boot Title' });
    http.expectOne('https://x/m.json').flush(validManifest());
    fixture.detectChanges();
    expect(document.title).toBe('Server Title');
  });

  it('read mode: no adapter and no snapshot override, so the shell evaluates paywall and age gates', async () => {
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false });
    http.expectOne('https://x/m.json').flush(validManifest('en-US', gatedPanels, gatedRules));
    fixture.detectChanges();
    // The shell initialises asynchronously (manifest, paywall, first panel).
    await new Promise((resolve) => setTimeout(resolve));
    await new Promise((resolve) => setTimeout(resolve));

    const inst = shellOf(fixture);
    expect(inst.entitlementAdapter).toBeUndefined();
    expect(inst.entitlementSnapshot).toBeUndefined();
    // Nothing bypasses the shell's PaywallService, which loaded the rules:
    // the age gate is reachable.
    const paywall = TestBed.inject(PaywallService);
    expect(paywall.evaluate('c').reason).toBe('age_verification_required');
    expect(paywall.canAccess('b')).toBeFalse();
    expect(paywall.canAccess('a')).toBeTrue();
  });

  /** Load in review mode and let the shell initialise its PaywallService. */
  async function review(rules: unknown[]) {
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false, mode: 'review' });
    http
      .expectOne('https://x/m.json')
      .flush(validManifest('en-US', { b: { id: 'b' }, c: { id: 'c' } }, rules));
    fixture.detectChanges();
    await new Promise((resolve) => setTimeout(resolve));
    await new Promise((resolve) => setTimeout(resolve));
    return fixture;
  }

  it('review mode: purchase and subscription rules are dropped, everything is readable', async () => {
    const fixture = await review([
      {
        id: 'sale',
        scope: 'panel',
        refId: 'b',
        entitlementType: 'purchase',
        requiredProductIds: ['b-product'],
      },
      { id: 'club', scope: 'work', entitlementType: 'subscription', subscriptionTiers: ['gold'] },
    ]);
    const inst = shellOf(fixture);
    expect(inst.entitlementAdapter).toBeUndefined();
    expect(inst.entitlementSnapshot).toBeUndefined();
    expect(inst.manifest?.paywall?.rules).toEqual([]);
    const paywall = TestBed.inject(PaywallService);
    for (const id of ['a', 'b', 'c']) {
      expect(paywall.canAccess(id)).withContext(id).toBeTrue();
    }
  });

  it('review mode: a purchase rule with an age keeps only its age gate', async () => {
    await review([
      {
        id: 'adult-sale',
        scope: 'panel',
        refId: 'c',
        entitlementType: 'purchase',
        requiredProductIds: ['p'],
        minimumAge: 18,
      },
    ]);
    const paywall = TestBed.inject(PaywallService);
    expect(paywall.evaluate('c').reason).toBe('age_verification_required');
    paywall.setSnapshot({
      subscriptionTier: null,
      purchasedProductIds: [],
      ageVerified: true,
      age: 30,
    });
    expect(paywall.canAccess('c')).toBeTrue(); // nothing left to buy
  });

  it('shows an error with retry when the fetch fails', () => {
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false });
    http.expectOne('https://x/m.json').flush('boom', { status: 500, statusText: 'Server Error' });
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.textContent).toContain('This work could not be loaded. Please try again later.');

    (el.querySelector('.pwr-retry') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(el.querySelector('.pwr-spinner')).toBeTruthy();
    http.expectOne('https://x/m.json').flush(validManifest());
  });

  it('falls back to the manifest default_locale', () => {
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false });
    http.expectOne('https://x/m.json').flush(validManifest('de-DE'));
    fixture.detectChanges();
    expect(fixture.componentInstance.locale()).toBe('de-DE');
  });

  it('ignores retries while a load is in flight', () => {
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false });
    fixture.componentInstance.load();
    fixture.componentInstance.load();
    http.expectOne('https://x/m.json').flush(validManifest());
    fixture.detectChanges();
    expect(fixture.componentInstance.state()).toBe('ready');
  });

  describe('reading position in the URL', () => {
    let originalUrl: string;

    beforeEach(() => {
      originalUrl = window.location.href;
    });

    afterEach(() => {
      window.history.replaceState(window.history.state, '', originalUrl);
    });

    it('opens the page or panel the URL links to', () => {
      window.history.replaceState(null, '', '/team/work?page=pg-D3');
      const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false });
      expect(fixture.componentInstance.start).toEqual({ pageId: 'pg-D3' });
      http.expectOne('https://x/m.json').flush(validManifest());
      fixture.detectChanges();
      expect(shellOf(fixture).initialPageId).toBe('pg-D3');
      expect(shellOf(fixture).initialPanelId).toBeUndefined();
    });

    it('writes the position into the address bar without adding history entries', () => {
      window.history.replaceState(null, '', '/team/work?embed=1');
      const fixture = setup({ manifestUrl: 'https://x/m.json', embed: true });
      const push = spyOn(window.history, 'pushState');

      fixture.componentInstance.onLocationChange({ view: 'panel', chapterId: 'c', panelId: 'ch1-p022' });
      expect(window.location.pathname + window.location.search).toBe('/team/work?embed=1&panel=ch1-p022');

      fixture.componentInstance.onLocationChange({ view: 'page', chapterId: 'c', panelId: 'a', pageId: 'pg-D1' });
      expect(window.location.search).toBe('?embed=1&page=pg-D1');

      fixture.componentInstance.onLocationChange({ view: 'cover', chapterId: 'c', panelId: 'a' });
      expect(window.location.search).toBe('?embed=1');
      expect(push).not.toHaveBeenCalled();
    });
  });

  it('shows "Nothing to read here." without a manifest URL', () => {
    const fixture = setup(undefined);
    expect(fixture.nativeElement.textContent).toContain('Nothing to read here.');
    http.expectNone(() => true);
  });
});
