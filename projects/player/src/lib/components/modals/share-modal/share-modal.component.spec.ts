import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed, fakeAsync, flushMicrotasks, tick } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { ShareModalComponent, type SharePlatform } from './share-modal.component';

type NavigatorOverrides = Partial<Record<'share' | 'clipboard', unknown>>;

describe('ShareModalComponent', () => {
  let fixture: ComponentFixture<ShareModalComponent>;
  let component: ShareModalComponent;
  let shared: SharePlatform[];
  let closed: number;
  const overridden: string[] = [];

  /** Shadow a navigator property with an own property; removed in afterEach. */
  function overrideNavigator(overrides: NavigatorOverrides): void {
    Object.entries(overrides).forEach(([key, value]) => {
      Object.defineProperty(navigator, key, { configurable: true, writable: true, value });
      overridden.push(key);
    });
  }

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function render(): void {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  function create(inputs: Record<string, unknown> = {}): void {
    fixture = TestBed.createComponent(ShareModalComponent);
    component = fixture.componentInstance;
    const defaults = {
      visible: true,
      shareUrl: 'https://read.example/w/1?p=a b',
      shareTitle: 'Night & Day',
      shareDescription: 'A tale',
    };
    Object.entries({ ...defaults, ...inputs }).forEach(([k, v]) => fixture.componentRef.setInput(k, v));
    fixture.detectChanges();
    shared = [];
    closed = 0;
    component.share.subscribe((p) => shared.push(p));
    component.close.subscribe(() => closed++);
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ShareModalComponent], providers: [provideTranslateService()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      share: { title: 'Share', copy: 'Copy', copied: 'Copied!', not_shareable: 'Not shareable', twitter: 'X' },
    });
    translate.use('en');
  });

  afterEach(() => {
    while (overridden.length) {
      delete (navigator as unknown as Record<string, unknown>)[overridden.pop() as string];
    }
  });

  it('renders nothing while hidden', () => {
    create({ visible: false });
    expect(el().querySelector('.share-overlay')).toBeNull();
  });

  it('renders the share URL and translated labels', () => {
    create();
    expect(el().querySelector('.share-title')?.textContent?.trim()).toBe('Share');
    expect((el().querySelector('.link-input') as HTMLInputElement).value).toBe('https://read.example/w/1?p=a b');
    expect(el().querySelector('.copy-btn')?.textContent?.trim()).toBe('Copy');
    expect(el().querySelector('.social-btn.twitter')?.getAttribute('aria-label')).toBe('Share on X');
  });

  it('shows a not-shareable message instead of share options', () => {
    create({ shareable: false });
    expect(el().querySelector('.not-shareable')?.textContent?.trim()).toBe('Not shareable');
    expect(el().querySelector('.copy-btn')).toBeNull();
    expect(el().querySelector('.social-buttons')).toBeNull();
  });

  describe('copy link', () => {
    it('writes to the clipboard, emits copy, and resets the success flag after 2s', fakeAsync(() => {
      const writeText = jasmine.createSpy('writeText').and.returnValue(Promise.resolve());
      overrideNavigator({ clipboard: { writeText } });
      create();

      (el().querySelector('.copy-btn') as HTMLButtonElement).click();
      flushMicrotasks();
      expect(writeText).toHaveBeenCalledWith('https://read.example/w/1?p=a b');
      expect(component.copySuccess).toBeTrue();
      expect(shared).toEqual(['copy']);
      render();
      expect(el().querySelector('.copy-btn')?.classList).toContain('success');
      expect(el().querySelector('.copy-btn')?.textContent?.trim()).toBe('Copied!');

      tick(2000);
      expect(component.copySuccess).toBeFalse();
    }));

    it('re-renders the OnPush view on copy success and on reset without an external markForCheck', fakeAsync(() => {
      const writeText = jasmine.createSpy('writeText').and.returnValue(Promise.resolve());
      overrideNavigator({ clipboard: { writeText } });
      create();

      void component.copyLink();
      flushMicrotasks();
      fixture.detectChanges();
      expect(el().querySelector('.copy-btn')?.classList).toContain('success');

      tick(2000);
      fixture.detectChanges();
      expect(el().querySelector('.copy-btn')?.classList).not.toContain('success');
      expect(el().querySelector('.copy-btn')?.textContent?.trim()).toBe('Copy');
    }));

    it('clears the pending reset timer on destroy', fakeAsync(() => {
      const writeText = jasmine.createSpy('writeText').and.returnValue(Promise.resolve());
      overrideNavigator({ clipboard: { writeText } });
      create();
      void component.copyLink();
      flushMicrotasks();
      fixture.destroy();
      // fakeAsync fails the test if a timer is still pending here
      expect(component.copySuccess).toBeTrue();
    }));

    it('logs and does not emit when the clipboard write fails', fakeAsync(() => {
      const writeText = jasmine.createSpy('writeText').and.returnValue(Promise.reject(new Error('denied')));
      overrideNavigator({ clipboard: { writeText } });
      const err = spyOn(console, 'error');
      create();
      void component.copyLink();
      flushMicrotasks();
      expect(component.copySuccess).toBeFalse();
      expect(shared).toEqual([]);
      expect(err).toHaveBeenCalledWith('Failed to copy:', jasmine.any(Error));
    }));

    it('falls back to execCommand when the async clipboard API is missing', fakeAsync(() => {
      overrideNavigator({ clipboard: undefined });
      const exec = spyOn(document, 'execCommand').and.returnValue(true);
      const append = spyOn(document.body, 'appendChild').and.callThrough();
      create();
      void component.copyLink();
      flushMicrotasks();
      expect(exec).toHaveBeenCalledWith('copy');
      const textarea = append.calls.mostRecent().args[0] as HTMLTextAreaElement;
      expect(textarea.value).toBe('https://read.example/w/1?p=a b');
      expect(document.body.contains(textarea)).toBeFalse();
      expect(component.copySuccess).toBeTrue();
      expect(shared).toEqual(['copy']);
      tick(2000);
      expect(component.copySuccess).toBeFalse();
    }));

    it('fallback does not report success when execCommand returns false', fakeAsync(() => {
      overrideNavigator({ clipboard: undefined });
      spyOn(document, 'execCommand').and.returnValue(false);
      create();
      void component.copyLink();
      flushMicrotasks();
      expect(component.copySuccess).toBeFalse();
      expect(shared).toEqual([]);
    }));

    it('fallback logs when execCommand throws and still removes the textarea', fakeAsync(() => {
      overrideNavigator({ clipboard: undefined });
      spyOn(document, 'execCommand').and.throwError('nope');
      const remove = spyOn(document.body, 'removeChild').and.callThrough();
      const err = spyOn(console, 'error');
      create();
      void component.copyLink();
      flushMicrotasks();
      expect(err).toHaveBeenCalledWith('Fallback copy failed:', jasmine.any(Error));
      expect(remove).toHaveBeenCalled();
      expect(shared).toEqual([]);
    }));
  });

  describe('social sharing', () => {
    let open: jasmine.Spy;
    beforeEach(() => {
      open = spyOn(window, 'open').and.returnValue(null);
      create();
    });

    it('Twitter uses the title and encoded URL', () => {
      (el().querySelector('.social-btn.twitter') as HTMLButtonElement).click();
      expect(open).toHaveBeenCalledWith(
        'https://twitter.com/intent/tweet?text=Night%20%26%20Day&url=https%3A%2F%2Fread.example%2Fw%2F1%3Fp%3Da%20b',
        '_blank',
        'width=550,height=420',
      );
      expect(shared).toEqual(['twitter']);
    });

    it('Twitter falls back to the description when there is no title', () => {
      fixture.componentRef.setInput('shareTitle', '');
      component.shareOnTwitter();
      expect(open.calls.mostRecent().args[0]).toContain('text=A%20tale&');
    });

    it('Facebook shares the encoded URL', () => {
      (el().querySelector('.social-btn.facebook') as HTMLButtonElement).click();
      expect(open).toHaveBeenCalledWith(
        'https://www.facebook.com/sharer/sharer.php?u=https%3A%2F%2Fread.example%2Fw%2F1%3Fp%3Da%20b',
        '_blank',
        'width=550,height=420',
      );
      expect(shared).toEqual(['facebook']);
    });

    it('Reddit shares title and URL', () => {
      (el().querySelector('.social-btn.reddit') as HTMLButtonElement).click();
      expect(open).toHaveBeenCalledWith(
        'https://www.reddit.com/submit?title=Night%20%26%20Day&url=https%3A%2F%2Fread.example%2Fw%2F1%3Fp%3Da%20b',
        '_blank',
        'width=550,height=500',
      );
      expect(shared).toEqual(['reddit']);
    });
  });

  describe('QR code', () => {
    beforeEach(() => create());

    /** Whether module (x, y) of the rendered code is dark. */
    function dark(x: number, y: number): boolean {
      return component.qrPath.includes(`M${x} ${y}h1v1h-1z`);
    }

    it('draws the share URL as a QR code on the device, once, emitting qr on show', () => {
      const toggle = el().querySelector('.qr-toggle-btn') as HTMLButtonElement;
      toggle.click();
      fixture.detectChanges();
      expect(component.showQrCode).toBeTrue();
      // A real QR symbol: 21 + 4k modules plus the 4-module quiet zone on each side.
      expect((component.qrSize - 8 - 21) % 4).toBe(0);
      // Top-left finder pattern: dark outer ring, light ring, dark 3x3 core.
      expect(dark(4, 4)).toBeTrue();
      expect(dark(10, 4)).toBeTrue();
      expect(dark(5, 5)).toBeFalse();
      expect(dark(7, 7)).toBeTrue();
      expect(dark(3, 3)).toBeFalse(); // quiet zone
      const svg = el().querySelector('svg.qr-code-image') as SVGElement;
      expect(svg.getAttribute('viewBox')).toBe(`0 0 ${component.qrSize} ${component.qrSize}`);
      expect(svg.querySelector('path')?.getAttribute('d')).toBe(component.qrPath);
      expect(el().querySelector('img')).toBeNull(); // no third-party image
      expect(shared).toEqual(['qr']);

      toggle.click();
      fixture.detectChanges();
      expect(component.showQrCode).toBeFalse();
      expect(el().querySelector('.qr-code-container')).toBeNull();

      const before = component.qrPath;
      toggle.click();
      expect(component.qrPath).toBe(before);
      expect(shared).toEqual(['qr', 'qr']);
    });

    it('redraws the code for a new link', () => {
      fixture.componentRef.setInput('shareUrl', 'https://read.example/w/1');
      fixture.detectChanges();
      component.toggleQrCode();
      const first = component.qrPath;
      fixture.componentRef.setInput('shareUrl', 'https://read.example/w/1?panel=ch1-p022');
      fixture.detectChanges();
      expect(component.qrPath).not.toBe('');
      expect(component.qrPath).not.toBe(first);
    });

    it('shows a waiting state without a link', () => {
      fixture.componentRef.setInput('shareUrl', '');
      fixture.detectChanges();
      component.toggleQrCode();
      render();
      expect(component.qrPath).toBe('');
      expect(el().querySelector('.qr-loading')).not.toBeNull();
    });
  });

  describe('native share', () => {
    it('hides the native share button when navigator.share is unavailable', () => {
      overrideNavigator({ share: undefined });
      create();
      expect(component.isNativeShareSupported).toBeFalse();
      expect(el().querySelector('.native-share-btn')).toBeNull();
    });

    it('calls navigator.share with title, text and url', async () => {
      const share = jasmine.createSpy('share').and.returnValue(Promise.resolve());
      overrideNavigator({ share });
      create();
      expect(component.isNativeShareSupported).toBeTrue();
      (el().querySelector('.native-share-btn') as HTMLButtonElement).click();
      await fixture.whenStable();
      expect(share).toHaveBeenCalledWith({
        title: 'Night & Day',
        text: 'A tale',
        url: 'https://read.example/w/1?p=a b',
      });
      expect(shared).toEqual(['native']);
    });

    it('swallows a cancelled native share', async () => {
      const share = jasmine.createSpy('share').and.returnValue(Promise.reject(new Error('AbortError')));
      overrideNavigator({ share });
      const log = spyOn(console, 'log');
      create();
      await component.useNativeShare();
      expect(log).toHaveBeenCalledWith('Share cancelled:', jasmine.any(Error));
      expect(shared).toEqual([]);
    });

    it('useNativeShare is a no-op when unsupported', async () => {
      overrideNavigator({ share: undefined });
      create();
      await component.useNativeShare();
      expect(shared).toEqual([]);
    });
  });

  describe('closing', () => {
    beforeEach(() => create());

    it('close button resets QR/copy state and emits close', () => {
      component.showQrCode = true;
      component.copySuccess = true;
      (el().querySelector('.close-btn') as HTMLButtonElement).click();
      expect(closed).toBe(1);
      expect(component.showQrCode).toBeFalse();
      expect(component.copySuccess).toBeFalse();
    });

    it('closes on backdrop click but not on clicks inside the dialog', () => {
      (el().querySelector('.share-container') as HTMLElement).click();
      expect(closed).toBe(0);
      (el().querySelector('.share-overlay') as HTMLElement).click();
      expect(closed).toBe(1);
    });

    it('closes on Enter/Space on the backdrop itself only', () => {
      const overlay = el().querySelector('.share-overlay') as HTMLElement;
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      overlay.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBeTrue();
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      (el().querySelector('.share-container') as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      expect(closed).toBe(2);
    });

    it('closes on Escape only while visible', () => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      window.dispatchEvent(esc);
      expect(esc.defaultPrevented).toBeTrue();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Tab' }));
      expect(closed).toBe(1);
      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
    });
  });
});
