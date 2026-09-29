import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { ExtrasViewerComponent, type Extra } from './extras-viewer.component';
import { PwIconComponent } from '../../icon/pw-icon.component';

describe('ExtrasViewerComponent', () => {
  let fixture: ComponentFixture<ExtrasViewerComponent>;
  let component: ExtrasViewerComponent;
  let closed: number;
  let purchases: number;

  const q = <T extends HTMLElement>(sel: string): T | null =>
    fixture.nativeElement.querySelector(sel) as T | null;
  const qa = <T extends HTMLElement>(sel: string): T[] =>
    Array.from(fixture.nativeElement.querySelectorAll(sel) as NodeListOf<T>);
  const text = (el: Element | null | undefined): string => (el?.textContent ?? '').replace(/\s+/g, ' ').trim();

  const extras: Extra[] = [
    {
      id: 'cover1',
      type: 'cover',
      title: { 'en-US': 'Main Cover', 'de-DE': 'Titelbild' },
      description: { 'en-US': 'The first cover' },
      thumbnail: 'thumbs/cover1.jpg',
      asset: 'art/cover1.jpg',
      mediaType: 'image',
    },
    {
      id: 'sketch',
      type: 'art',
      title: { 'en-US': 'Sketch' },
      thumbnail: 'https://cdn.example/sketch.png',
      asset: 'https://cdn.example/sketch-full.png',
    },
    {
      id: 'making-of',
      type: 'bts',
      title: { 'en-US': 'Making Of' },
      asset: 'video/making.mp4',
      mediaType: 'video',
      gated: true,
    },
    { id: 'talk', type: 'interview', title: { 'en-US': 'Talk' }, asset: 'audio/talk.mp3', mediaType: 'audio' },
    { id: 'script', type: 'other', title: {}, asset: 'docs/script.pdf', mediaType: 'document' },
  ];

  function set(inputs: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
  }

  /** Re-render after calling component methods directly (OnPush). */
  const refresh = (): void => {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  };

  const filterButtons = (): HTMLButtonElement[] => qa<HTMLButtonElement>('.filter-btn');
  const cards = (): HTMLElement[] => qa<HTMLElement>('.extra-card');
  const openCard = (i: number): void => {
    (cards()[i].querySelector('.extra-thumbnail') as HTMLButtonElement).click();
    fixture.detectChanges();
  };

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ExtrasViewerComponent], providers: [provideTranslateService()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      extras: {
        title: 'Extras',
        all: 'All',
        no_extras: 'Nothing here',
        locked_premium: 'Premium',
        premium_notice: 'Some extras need premium',
        upgrade_now: 'Upgrade',
        open_document: 'Open document',
      },
    });
    translate.use('en');
    fixture = TestBed.createComponent(ExtrasViewerComponent);
    component = fixture.componentInstance;
    closed = 0;
    purchases = 0;
    component.close.subscribe(() => closed++);
    component.purchase.subscribe(() => purchases++);
    set({ extras, baseUrl: 'https://assets.example/', visible: true });
  });

  describe('gallery', () => {
    it('renders nothing while hidden', () => {
      set({ visible: false });
      expect(q('.extras-overlay')).toBeNull();
    });

    it('renders filter buttons with counts only for present types', () => {
      expect(filterButtons().map((b) => text(b))).toEqual([
        'All (5)',
        'Covers (1)',
        'Artwork (1)',
        'Behind the Scenes (1)',
        'Interviews (1)',
        'Other (1)',
      ]);
      expect(filterButtons()[0].classList).toContain('active');
    });

    it('filters the grid to "other" extras via their own filter button', () => {
      const other = filterButtons().find((b) => text(b) === 'Other (1)') as HTMLButtonElement;
      expect(other).toBeDefined();
      other.click();
      fixture.detectChanges();
      expect(component.filterType).toBe('other');
      expect(cards().length).toBe(1);
      expect(filterButtons().find((b) => text(b) === 'Other (1)')?.classList).toContain('active');
    });

    it('hides the "other" filter when there are no such extras', () => {
      set({ extras: component.extras.filter((e) => e.type !== 'other') });
      expect(filterButtons().some((b) => text(b).startsWith('Other'))).toBeFalse();
    });

    it('filters the grid by type', () => {
      expect(cards().length).toBe(5);
      filterButtons()[2].click();
      fixture.detectChanges();
      expect(cards().length).toBe(1);
      expect(text(cards()[0].querySelector('.extra-title'))).toBe('Sketch');
      expect(filterButtons()[2].classList).toContain('active');
      expect(filterButtons()[0].classList).not.toContain('active');
      filterButtons()[0].click();
      fixture.detectChanges();
      expect(cards().length).toBe(5);
    });

    it('filters every type via setFilter', () => {
      for (const [type, id] of [
        ['cover', 'cover1'],
        ['bts', 'making-of'],
        ['interview', 'talk'],
        ['other', 'script'],
      ] as const) {
        component.setFilter(type);
        expect(component.getFilteredExtras().map((e) => e.id)).toEqual([id]);
      }
    });

    it('shows the empty state when nothing matches', () => {
      set({ extras: [] });
      expect(text(q('.empty-state'))).toBe('Nothing here');
      expect(filterButtons().map((b) => text(b))).toEqual(['All (0)']);
    });

    it('resolves thumbnails against baseUrl and keeps absolute URLs', () => {
      const imgs = qa<HTMLImageElement>('.thumbnail-image');
      expect(imgs[0].getAttribute('src')).toBe('https://assets.example/thumbs/cover1.jpg');
      expect(imgs[0].alt).toBe('Main Cover');
      expect(imgs[1].getAttribute('src')).toBe('https://cdn.example/sketch.png');
      expect(component.getThumbnailUrl({ ...extras[0], thumbnail: 'data:image/png;base64,AA' })).toBe(
        'data:image/png;base64,AA',
      );
      expect(component.getThumbnailUrl({ ...extras[0], thumbnail: 'http://x/y.png' })).toBe('http://x/y.png');
    });

    it('shows a media-type placeholder when there is no thumbnail', () => {
      const card = fixture.debugElement.queryAll(By.css('.extra-card'))[2];
      const placeholderIcon = card
        .query(By.css('.thumbnail-placeholder'))
        .query(By.directive(PwIconComponent)).componentInstance as PwIconComponent;
      expect(placeholderIcon.name()).toBe('lucideClapperboard');
    });

    it('maps media types to icons', () => {
      const icon = (mediaType?: Extra['mediaType']): string => component.getMediaIcon({ ...extras[0], mediaType });
      expect(icon('image')).toBe('lucideImage');
      expect(icon('video')).toBe('lucideClapperboard');
      expect(icon('audio')).toBe('lucideMusic');
      expect(icon('document')).toBe('lucideFileText');
      expect(icon(undefined)).toBe('lucidePaperclip');
    });

    it('shows descriptions only when present and falls back to the id for empty titles', () => {
      expect(text(cards()[0].querySelector('.extra-description'))).toBe('The first cover');
      expect(cards()[1].querySelector('.extra-description')).toBeNull();
      expect(text(cards()[4].querySelector('.extra-title'))).toBe('script');
    });

    it('maps type names', () => {
      expect(component.getTypeName('other')).toBe('Other');
    });
  });

  describe('localization', () => {
    it('uses the exact locale, then the base language, then the first entry', () => {
      set({ locale: 'de-DE' });
      expect(text(cards()[0].querySelector('.extra-title'))).toBe('Titelbild');
      set({ locale: 'de-AT' });
      expect(text(cards()[0].querySelector('.extra-title'))).toBe('Titelbild');
      set({ locale: 'fr-FR' });
      expect(text(cards()[0].querySelector('.extra-title'))).toBe('Main Cover');
    });

    it('returns an empty string for missing or non-object values', () => {
      expect(component.getLocalizedString(undefined)).toBe('');
      expect(component.getLocalizedString('plain' as unknown as Record<string, string>)).toBe('');
      expect(component.getLocalizedString({})).toBe('');
    });
  });

  describe('gating', () => {
    it('locks gated extras and shows the paywall notice', () => {
      expect(cards()[2].querySelector('.extra-thumbnail')?.classList).toContain('locked');
      expect(text(cards()[2].querySelector('.lock-text'))).toBe('Premium');
      expect(cards()[0].querySelector('.lock-overlay')).toBeNull();
      expect(text(q('.notice-text'))).toContain('Some extras need premium');
    });

    it('does not open a locked extra', () => {
      openCard(2);
      expect(component.selectedExtra).toBeUndefined();
      expect(q('.detail-overlay')).toBeNull();
    });

    it('emits purchase from the upgrade button', () => {
      q<HTMLButtonElement>('.upgrade-btn')?.click();
      expect(purchases).toBe(1);
    });

    it('unlocks everything with premium access and hides the notice', () => {
      set({ hasPremiumAccess: true });
      expect(q('.lock-overlay')).toBeNull();
      expect(q('.paywall-notice')).toBeNull();
      openCard(2);
      expect(component.selectedExtra?.id).toBe('making-of');
    });

    it('hides the notice when nothing is gated', () => {
      set({ extras: [extras[0]] });
      expect(q('.paywall-notice')).toBeNull();
    });
  });

  describe('detail view', () => {
    it('shows an image with resolved asset URL and description', () => {
      openCard(0);
      expect(text(q('.detail-title'))).toBe('Main Cover');
      expect(q<HTMLImageElement>('.detail-image')?.getAttribute('src')).toBe('https://assets.example/art/cover1.jpg');
      expect(text(q('.detail-description'))).toBe('The first cover');
    });

    it('treats a missing media type as an image and keeps absolute asset URLs', () => {
      openCard(1);
      expect(q<HTMLImageElement>('.detail-image')?.getAttribute('src')).toBe('https://cdn.example/sketch-full.png');
      expect(q('.detail-description')).toBeNull();
    });

    it('renders video, audio and document players', () => {
      set({ hasPremiumAccess: true });
      openCard(2);
      expect(q<HTMLVideoElement>('.detail-video')?.getAttribute('src')).toBe('https://assets.example/video/making.mp4');
      expect(q('.detail-image')).toBeNull();
      component.openExtra(extras[3]);
      refresh();
      expect(q<HTMLAudioElement>('.detail-audio')?.getAttribute('src')).toBe('https://assets.example/audio/talk.mp3');
      component.openExtra(extras[4]);
      refresh();
      const link = q<HTMLAnchorElement>('.detail-document-link') as HTMLAnchorElement;
      expect(link.getAttribute('href')).toBe('https://assets.example/docs/script.pdf');
      expect(link.target).toBe('_blank');
      expect(link.rel).toBe('noopener noreferrer');
      expect(text(link)).toBe('Open document');
    });

    it('renders no image or document link without an asset', () => {
      component.openExtra({ id: 'x', type: 'art', title: { 'en-US': 'X' } });
      refresh();
      expect(q('.detail-overlay')).not.toBeNull();
      expect(q('.detail-image')).toBeNull();
      expect(component.getAssetUrl({ id: 'x', type: 'art', title: {} })).toBe('');
      expect(component.getAssetUrl({ id: 'x', type: 'art', title: {}, asset: 'http://h/a.png' })).toBe(
        'http://h/a.png',
      );
      expect(component.getAssetUrl({ id: 'x', type: 'art', title: {}, asset: 'data:x' })).toBe('data:x');
    });

    it('closes the detail from its close and footer buttons', () => {
      openCard(0);
      q<HTMLButtonElement>('.detail-header .close-btn')?.click();
      fixture.detectChanges();
      expect(q('.detail-overlay')).toBeNull();
      openCard(0);
      q<HTMLButtonElement>('.detail-footer .action-btn')?.click();
      fixture.detectChanges();
      expect(q('.detail-overlay')).toBeNull();
      expect(closed).toBe(0);
    });

    it('closes only the detail on detail-backdrop click', () => {
      openCard(0);
      q<HTMLElement>('.detail-container')?.click();
      expect(component.selectedExtra).toBeDefined();
      q<HTMLElement>('.detail-overlay')?.click();
      expect(component.selectedExtra).toBeUndefined();
      expect(closed).toBe(0);
    });

    it('Escape inside the detail closes only the detail', () => {
      openCard(0);
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      const stop = spyOn(ev, 'stopPropagation').and.callThrough();
      q<HTMLElement>('.detail-overlay')?.dispatchEvent(ev);
      expect(stop).toHaveBeenCalled();
      expect(component.selectedExtra).toBeUndefined();
      expect(closed).toBe(0);
    });
  });

  describe('initialExtraId', () => {
    async function freshFixture(inputs: Record<string, unknown>): Promise<void> {
      fixture.destroy();
      fixture = TestBed.createComponent(ExtrasViewerComponent);
      component = fixture.componentInstance;
      set({ extras, ...inputs });
    }

    it('opens the requested extra when the viewer becomes visible', async () => {
      await freshFixture({ initialExtraId: 'sketch' });
      expect(component.selectedExtra).toBeUndefined();
      set({ visible: true });
      expect(component.selectedExtra?.id).toBe('sketch');
      expect(text(q('.detail-title'))).toBe('Sketch');
    });

    it('ignores unknown or locked ids', async () => {
      await freshFixture({ initialExtraId: 'nope', visible: true });
      expect(component.selectedExtra).toBeUndefined();
      await freshFixture({ initialExtraId: 'making-of', visible: true });
      expect(component.selectedExtra).toBeUndefined();
    });
  });

  describe('closing', () => {
    it('close button clears the detail and emits close', () => {
      component.openExtra(extras[0]);
      q<HTMLButtonElement>('.extras-header .close-btn')?.click();
      expect(component.selectedExtra).toBeUndefined();
      expect(closed).toBe(1);
    });

    it('backdrop click closes the viewer, or just the detail when one is open', () => {
      q<HTMLElement>('.extras-container')?.click();
      expect(closed).toBe(0);
      component.openExtra(extras[0]);
      component.onBackdropClick({ target: 1, currentTarget: 1 } as unknown as MouseEvent);
      expect(component.selectedExtra).toBeUndefined();
      expect(closed).toBe(0);
      q<HTMLElement>('.extras-overlay')?.click();
      expect(closed).toBe(1);
    });

    it('Enter/Space on the backdrop itself close detail first, then the viewer', () => {
      const overlay = q<HTMLElement>('.extras-overlay') as HTMLElement;
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'x', bubbles: true }));
      q<HTMLElement>('.extras-container')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      expect(closed).toBe(0);
      component.openExtra(extras[0]);
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      overlay.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBeTrue();
      expect(component.selectedExtra).toBeUndefined();
      expect(closed).toBe(0);
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(closed).toBe(1);
    });

    it('window Escape closes detail first, then the viewer, only while visible', () => {
      component.openExtra(extras[0]);
      const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      window.dispatchEvent(esc);
      expect(esc.defaultPrevented).toBeTrue();
      expect(component.selectedExtra).toBeUndefined();
      expect(closed).toBe(0);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'a' }));
      expect(closed).toBe(1);
      set({ visible: false });
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
    });
  });
});
