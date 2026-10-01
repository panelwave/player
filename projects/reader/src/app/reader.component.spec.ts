import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { PlayerShellComponent } from 'player';
import { ReaderComponent } from './reader.component';

const validManifest = (defaultLocale = 'en-US', extraPanel = {}) => ({
  panelwave: { version: '1.0.0' },
  meta: { id: 'w', title: { 'en-US': 'W' }, locales: ['en-US', 'de-DE'], default_locale: defaultLocale },
  chapters: [
    {
      id: 'c',
      panels: { a: { id: 'a' }, ...extraPanel },
      graph: { entry: 'a', edges: [] },
    },
  ],
});

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

  it('shows a spinner, then mounts the shell with the locked adapter', async () => {
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false, locale: 'de-DE', title: 'My Work' });
    expect(fixture.nativeElement.querySelector('.pwr-spinner')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('pw-player-shell')).toBeNull();
    expect(document.title).toBe('My Work');

    const manifest = validManifest('en-US', { b: { id: 'b', 'x-locked': true } });
    http.expectOne('https://x/m.json').flush(manifest);
    fixture.detectChanges();

    const shell = fixture.nativeElement.querySelector('pw-player-shell');
    expect(shell).toBeTruthy();
    expect(shell.classList).toContain('pw-reader-shell');
    expect(fixture.nativeElement.querySelector('.pwr-spinner')).toBeNull();
    expect(fixture.nativeElement.querySelector('a.pw-badge')).toBeTruthy();

    const dbg = fixture.debugElement.children.find((d) => d.componentInstance instanceof PlayerShellComponent);
    const inst = dbg?.componentInstance as PlayerShellComponent;
    expect(inst.locale).toBe('de-DE'); // boot locale wins over manifest default
    expect(inst.showToolbar).toBeFalse();
    expect(await inst.entitlementAdapter?.hasAccess('b')).toBeFalse();
    expect(await inst.entitlementAdapter?.hasAccess('a')).toBeTrue();
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

  it('falls back to the manifest default_locale, then ignores concurrent retries', () => {
    const fixture = setup({ manifestUrl: 'https://x/m.json', embed: false });
    fixture.componentInstance.load();
    fixture.componentInstance.load();
    http.expectOne('https://x/m.json').flush(validManifest('de-DE'));
    fixture.detectChanges();
    expect(fixture.componentInstance.locale()).toBe('de-DE');
  });

  it('shows "Nothing to read here." without a manifest URL', () => {
    const fixture = setup(undefined);
    expect(fixture.nativeElement.textContent).toContain('Nothing to read here.');
    http.expectNone(() => true);
  });
});
