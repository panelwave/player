import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { ToolbarComponent } from './toolbar.component';
import { PwIconComponent } from '../icon/pw-icon.component';

describe('ToolbarComponent', () => {
  let fixture: ComponentFixture<ToolbarComponent>;
  let component: ToolbarComponent;

  const btn = (label: string): HTMLButtonElement | null =>
    fixture.nativeElement.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement | null;
  const iconName = (label: string): string => {
    const de = fixture.debugElement.query(By.css(`button[aria-label="${label}"]`));
    return (de.query(By.directive(PwIconComponent)).componentInstance as PwIconComponent).name();
  };

  function set(inputs: Record<string, unknown>): void {
    for (const [k, v] of Object.entries(inputs)) {
      fixture.componentRef.setInput(k, v);
    }
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [ToolbarComponent, TranslateModule.forRoot()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      toolbar: {
        view_toggle: 'Toggle view',
        view: 'View',
        select_language: 'Language',
        speech_toggle: 'Toggle speech',
        audio_toggle: 'Toggle audio',
        sfx_toggle: 'Toggle SFX',
        autoplay_toggle: 'Toggle autoplay',
        decrease_speed: 'Slower',
        increase_speed: 'Faster',
        seconds: '{{value}}s',
        thumbs_toggle: 'Toggle thumbnails',
        toc_open: 'Open contents',
        settings_open: 'Open settings',
        characters_open: 'Open characters',
        alt: 'Alt',
        alt_label: 'Alternative panels',
        alt_cycle: 'Cycle through alternative panels',
        choices: 'Choices',
        choices_label: 'Choices ahead',
        choices_view: 'View upcoming choices',
        extras: 'Extras',
        extras_open: 'View bonus content',
        like: 'Like',
        like_work: 'Like this work',
        like_remove: 'Remove like',
        bookmark: 'Bookmark',
        bookmark_panel: 'Bookmark this panel',
        bookmark_remove: 'Remove bookmark',
        share: 'Share',
        share_panel: 'Share this panel',
        comments: 'Comments',
        comments_view: 'View comments',
        close: 'Close toolbar',
      },
    });
    translate.use('en');
    fixture = TestBed.createComponent(ToolbarComponent);
    component = fixture.componentInstance;
    set({ visible: true });
  });

  it('reflects the visible input as a class', () => {
    const container = fixture.nativeElement.querySelector('.toolbar-container') as HTMLElement;
    expect(container.classList).toContain('visible');
    set({ visible: false });
    expect(container.classList).not.toContain('visible');
  });

  it('renders translated labels', () => {
    expect(btn('Toggle view')?.title).toBe('Toggle view');
    expect(btn('Toggle view')?.querySelector('.btn-label')?.textContent?.trim()).toBe('View');
  });

  describe('view toggle', () => {
    it('is disabled and inert when page view is unavailable', () => {
      const b = btn('Toggle view') as HTMLButtonElement;
      expect(b.disabled).toBeTrue();
      expect(b.classList).toContain('disabled');
      const spy = jasmine.createSpy('toggleView');
      component.toggleView.subscribe(spy);
      component.onToggleView();
      expect(spy).not.toHaveBeenCalled();
    });

    it('emits when page view is available', () => {
      set({ pageViewAvailable: true });
      const spy = jasmine.createSpy('toggleView');
      component.toggleView.subscribe(spy);
      btn('Toggle view')?.click();
      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('shows an icon for each view mode', () => {
      expect(iconName('Toggle view')).toBe('lucideSquare');
      set({ viewMode: 'page' });
      expect(iconName('Toggle view')).toBe('lucideLayoutGrid');
      set({ viewMode: 'canvas' });
      expect(iconName('Toggle view')).toBe('lucideGlobe');
    });
  });

  describe('language selector', () => {
    it('is hidden with a single locale', () => {
      expect(btn('Language')).toBeNull();
    });

    it('shows the current locale and opens the language modal', () => {
      set({ availableLocales: ['en-US', 'de-DE'], locale: 'de-DE' });
      const b = btn('Language') as HTMLButtonElement;
      expect(b.querySelector('.btn-label')?.textContent?.trim()).toBe('de-DE');
      const spy = jasmine.createSpy('openLanguage');
      component.openLanguage.subscribe(spy);
      b.click();
      expect(spy).toHaveBeenCalledTimes(1);
    });
  });

  describe('toggles', () => {
    const toggles: [string, 'speechEnabled' | 'audioEnabled' | 'sfxEnabled' | 'thumbnailsVisible'][] = [
      ['Toggle speech', 'speechEnabled'],
      ['Toggle audio', 'audioEnabled'],
      ['Toggle SFX', 'sfxEnabled'],
      ['Toggle thumbnails', 'thumbnailsVisible'],
    ];

    it('reflect pressed state from inputs', () => {
      for (const [label, input] of toggles) {
        set({ [input]: true });
        expect(btn(label)?.getAttribute('aria-pressed')).withContext(label).toBe('true');
        expect(btn(label)?.classList).withContext(label).toContain('active');
        set({ [input]: false });
        expect(btn(label)?.getAttribute('aria-pressed')).withContext(label).toBe('false');
        expect(btn(label)?.classList).withContext(label).not.toContain('active');
      }
    });

    it('swap the audio icon when muted', () => {
      expect(iconName('Toggle audio')).toBe('lucideVolume2');
      set({ audioEnabled: false });
      expect(iconName('Toggle audio')).toBe('lucideVolumeX');
    });

    it('emit their outputs on click', () => {
      const speech = jasmine.createSpy('speech');
      const audio = jasmine.createSpy('audio');
      const sfx = jasmine.createSpy('sfx');
      const thumbs = jasmine.createSpy('thumbs');
      component.toggleSpeech.subscribe(speech);
      component.toggleAudio.subscribe(audio);
      component.toggleSfx.subscribe(sfx);
      component.toggleThumbnails.subscribe(thumbs);
      btn('Toggle speech')?.click();
      btn('Toggle audio')?.click();
      btn('Toggle SFX')?.click();
      btn('Toggle thumbnails')?.click();
      expect(speech).toHaveBeenCalledTimes(1);
      expect(audio).toHaveBeenCalledTimes(1);
      expect(sfx).toHaveBeenCalledTimes(1);
      expect(thumbs).toHaveBeenCalledTimes(1);
    });
  });

  describe('autoplay', () => {
    it('emits toggleAutoplay and hides the speed controls while off', () => {
      const spy = jasmine.createSpy('autoplay');
      component.toggleAutoplay.subscribe(spy);
      btn('Toggle autoplay')?.click();
      expect(spy).toHaveBeenCalledTimes(1);
      expect(iconName('Toggle autoplay')).toBe('lucidePlay');
      expect(fixture.nativeElement.querySelector('.autoplay-controls')).toBeNull();
      expect(fixture.nativeElement.querySelector('.autoplay-progress-bar')).toBeNull();
    });

    it('shows progress, the pause icon and the seconds value while on', () => {
      set({ autoplayEnabled: true, autoplayProgress: 40, secondsPerPanel: 7 });
      expect(iconName('Toggle autoplay')).toBe('lucidePause');
      const fill = fixture.nativeElement.querySelector('.autoplay-progress-fill') as HTMLElement;
      expect(fill.style.width).toBe('40%');
      expect(fixture.nativeElement.querySelector('.control-value')?.textContent?.trim()).toBe('7s');
    });

    it('adjusts seconds per panel via the +/- buttons', () => {
      set({ autoplayEnabled: true, secondsPerPanel: 5 });
      const values: number[] = [];
      component.secondsPerPanelChange.subscribe((v) => values.push(v));
      btn('Slower')?.click();
      btn('Faster')?.click();
      expect(values).toEqual([4, 6]);
    });

    it('clamps seconds per panel to 0.5..120', () => {
      const values: number[] = [];
      component.secondsPerPanelChange.subscribe((v) => values.push(v));
      set({ secondsPerPanel: 1 });
      component.adjustSecondsPerPanel(-1);
      set({ secondsPerPanel: 120 });
      component.adjustSecondsPerPanel(1);
      expect(values).toEqual([0.5, 120]);
    });
  });

  describe('navigation buttons', () => {
    it('emit toc, settings, characters, extras and close', () => {
      const toc = jasmine.createSpy('toc');
      const settings = jasmine.createSpy('settings');
      const characters = jasmine.createSpy('characters');
      const extras = jasmine.createSpy('extras');
      const close = jasmine.createSpy('close');
      component.openToc.subscribe(toc);
      component.openSettings.subscribe(settings);
      component.openCharacters.subscribe(characters);
      component.openExtras.subscribe(extras);
      component.close.subscribe(close);
      btn('Open contents')?.click();
      btn('Open settings')?.click();
      btn('Open characters')?.click();
      btn('Extras')?.click();
      btn('Close toolbar')?.click();
      for (const spy of [toc, settings, characters, extras, close]) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });

    it('shows alternatives and branch buttons only when available', () => {
      expect(btn('Alternative panels')).toBeNull();
      expect(btn('Choices ahead')).toBeNull();
      set({ hasAlternatives: true, hasBranches: true });
      const alt = jasmine.createSpy('alt');
      const branches = jasmine.createSpy('branches');
      component.cycleAlternative.subscribe(alt);
      component.showBranches.subscribe(branches);
      btn('Alternative panels')?.click();
      btn('Choices ahead')?.click();
      expect(alt).toHaveBeenCalledTimes(1);
      expect(branches).toHaveBeenCalledTimes(1);
    });
  });

  describe('social cluster', () => {
    it('can be hidden', () => {
      set({ showSocial: false });
      expect(fixture.nativeElement.querySelector('.toolbar-social')).toBeNull();
      expect(btn('Like')).toBeNull();
    });

    it('reflects liked/bookmarked state in aria-pressed and titles', () => {
      expect(btn('Like')?.getAttribute('aria-pressed')).toBe('false');
      expect(btn('Like')?.title).toBe('Like this work');
      expect(btn('Bookmark')?.title).toBe('Bookmark this panel');
      set({ liked: true, bookmarked: true });
      expect(btn('Like')?.getAttribute('aria-pressed')).toBe('true');
      expect(btn('Like')?.classList).toContain('active');
      expect(btn('Like')?.title).toBe('Remove like');
      expect(btn('Bookmark')?.classList).toContain('active');
      expect(btn('Bookmark')?.title).toBe('Remove bookmark');
    });

    it('emits like, bookmark, share and comments', () => {
      const like = jasmine.createSpy('like');
      const bookmark = jasmine.createSpy('bookmark');
      const share = jasmine.createSpy('share');
      const comments = jasmine.createSpy('comments');
      component.like.subscribe(like);
      component.bookmark.subscribe(bookmark);
      component.share.subscribe(share);
      component.openComments.subscribe(comments);
      btn('Like')?.click();
      btn('Bookmark')?.click();
      btn('Share')?.click();
      btn('Comments')?.click();
      for (const spy of [like, bookmark, share, comments]) {
        expect(spy).toHaveBeenCalledTimes(1);
      }
    });
  });

  describe('localization', () => {
    const labelOf = (el: HTMLButtonElement | null): string =>
      (el?.querySelector('.btn-label')?.textContent ?? '').trim();

    it('renders the English labels/titles of the formerly hard-coded buttons from translation keys', () => {
      set({ hasAlternatives: true, hasBranches: true });
      expect(labelOf(btn('Alternative panels'))).toBe('Alt');
      expect(btn('Alternative panels')?.title).toBe('Cycle through alternative panels');
      expect(labelOf(btn('Choices ahead'))).toBe('Choices');
      expect(btn('Choices ahead')?.title).toBe('View upcoming choices');
      expect(labelOf(btn('Extras'))).toBe('Extras');
      expect(btn('Extras')?.title).toBe('View bonus content');
      expect(btn('Share')?.title).toBe('Share this panel');
      expect(btn('Comments')?.title).toBe('View comments');
      expect(btn('Close toolbar')?.title).toBe('Close toolbar');
    });

    it('follows the active language (no hard-coded English left)', () => {
      const translate = TestBed.inject(TranslateService);
      translate.setTranslation('de', {
        toolbar: {
          alt: 'Alt',
          alt_label: 'Alternativen',
          alt_cycle: 'Durch alternative Panels wechseln',
          choices: 'Entscheidungen',
          choices_label: 'Anstehende Entscheidungen',
          choices_view: 'Anstehende Entscheidungen anzeigen',
          extras: 'Extras',
          extras_open: 'Bonus-Inhalte anzeigen',
          like: 'Gefällt mir',
          like_work: 'Dieses Werk gefällt mir',
          like_remove: 'Gefällt mir nicht mehr',
          bookmark: 'Merken',
          bookmark_panel: 'Dieses Panel merken',
          bookmark_remove: 'Nicht mehr merken',
          share: 'Teilen',
          share_panel: 'Dieses Panel teilen',
          comments: 'Kommentare',
          comments_view: 'Kommentare anzeigen',
          close: 'Werkzeugleiste schließen',
        },
      });
      translate.use('de');
      set({ hasAlternatives: true, hasBranches: true });

      for (const en of ['Alternative panels', 'Choices ahead', 'Extras', 'Like', 'Bookmark', 'Share', 'Comments', 'Close toolbar']) {
        // 'Extras' is identical in German, every other English name must be gone
        if (en !== 'Extras') expect(btn(en)).withContext(en).toBeNull();
      }
      expect(labelOf(btn('Alternativen'))).toBe('Alt');
      expect(labelOf(btn('Anstehende Entscheidungen'))).toBe('Entscheidungen');
      expect(btn('Extras')?.title).toBe('Bonus-Inhalte anzeigen');
      expect(btn('Gefällt mir')?.title).toBe('Dieses Werk gefällt mir');
      expect(btn('Merken')?.title).toBe('Dieses Panel merken');
      expect(btn('Teilen')?.title).toBe('Dieses Panel teilen');
      expect(btn('Kommentare')?.title).toBe('Kommentare anzeigen');
      expect(btn('Werkzeugleiste schließen')).not.toBeNull();

      set({ liked: true, bookmarked: true });
      expect(btn('Gefällt mir')?.title).toBe('Gefällt mir nicht mehr');
      expect(btn('Merken')?.title).toBe('Nicht mehr merken');
    });
  });
});
