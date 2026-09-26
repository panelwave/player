import { ChangeDetectorRef } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule, TranslateService } from '@ngx-translate/core';

import { CharacterRosterComponent, type Character } from './character-roster.component';

interface FakeAudio {
  src: string;
  currentTime: number;
  play: jasmine.Spy<() => Promise<void>>;
  pause: jasmine.Spy<() => void>;
  handlers: Record<string, () => void>;
  addEventListener: (name: string, cb: () => void) => void;
}

describe('CharacterRosterComponent', () => {
  let fixture: ComponentFixture<CharacterRosterComponent>;
  let component: CharacterRosterComponent;

  const characters: Character[] = [
    {
      id: 'mira',
      name: { 'en-US': 'Mira Vale', 'de-DE': 'Mira Tal' },
      role: 'Protagonist',
      avatar: 'avatars/mira.png',
      bio: { 'en-US': 'A cartographer.' },
      voiceSample: 'voices/mira.mp3',
    },
    { id: 'rook', name: { 'en-GB': 'Rook' }, role: 'Villain', avatar: 'https://cdn.example/rook.png' },
    { id: 'nameless', name: {} },
  ];

  function el(): HTMLElement {
    return fixture.nativeElement as HTMLElement;
  }

  function render(): void {
    fixture.debugElement.injector.get(ChangeDetectorRef).markForCheck();
    fixture.detectChanges();
  }

  function makeAudio(playResult: Promise<void> = Promise.resolve()): FakeAudio {
    const audio: FakeAudio = {
      src: '',
      currentTime: 5,
      play: jasmine.createSpy('play').and.returnValue(playResult),
      pause: jasmine.createSpy('pause'),
      handlers: {},
      addEventListener: (name, cb) => (audio.handlers[name] = cb),
    };
    return audio;
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [CharacterRosterComponent, TranslateModule.forRoot()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      character_roster: { title: 'Characters', no_results: 'No match for "{{query}}"' },
    });
    translate.use('en');

    fixture = TestBed.createComponent(CharacterRosterComponent);
    component = fixture.componentInstance;
    fixture.componentRef.setInput('characters', characters);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('baseUrl', 'https://assets.example/');
    fixture.detectChanges();
  });

  it('renders nothing while hidden', () => {
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    expect(el().querySelector('.roster-overlay')).toBeNull();
  });

  it('renders a translated title and one card per character', () => {
    expect(el().querySelector('.roster-title')?.textContent?.trim()).toBe('Characters');
    const cards = el().querySelectorAll('.character-card');
    expect(cards.length).toBe(3);
    expect(cards[0].querySelector('.character-name')?.textContent?.trim()).toBe('Mira Vale');
    expect(cards[0].querySelector('.character-role')?.textContent?.trim()).toBe('Protagonist');
    // no role -> no role element
    expect(cards[2].querySelector('.character-role')).toBeNull();
  });

  it('resolves avatars: relative via baseUrl, absolute as-is, placeholder initials otherwise', () => {
    const cards = el().querySelectorAll('.character-card');
    expect((cards[0].querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('https://assets.example/avatars/mira.png');
    expect((cards[1].querySelector('img') as HTMLImageElement).getAttribute('src')).toBe('https://cdn.example/rook.png');
    expect(cards[2].querySelector('.avatar-placeholder')?.textContent?.trim()).toBe('NA');
  });

  describe('localization', () => {
    it('prefers the exact locale, then the base language, then the first entry', () => {
      component.locale = 'de-DE';
      expect(component.getLocalizedString({ 'en-US': 'Hi', 'de-DE': 'Hallo' })).toBe('Hallo');
      component.locale = 'en-US';
      expect(component.getLocalizedString({ 'en-GB': 'Colour' })).toBe('Colour');
      component.locale = 'fr-FR';
      expect(component.getLocalizedString({ 'es-ES': 'Hola', 'it-IT': 'Ciao' })).toBe('Hola');
      expect(component.getLocalizedString({})).toBe('');
      expect(component.getLocalizedString(undefined)).toBe('');
    });

    it('falls back to the character id when no name resolves', () => {
      expect(component.getCharacterName(characters[2])).toBe('nameless');
      expect(component.getCharacterBio(characters[1])).toBe('');
    });

    it('re-renders names when the locale input changes', () => {
      fixture.componentRef.setInput('locale', 'de-DE');
      fixture.detectChanges();
      expect(el().querySelector('.character-name')?.textContent?.trim()).toBe('Mira Tal');
    });
  });

  describe('initials', () => {
    it('uses first and last word initials, two letters for a single word, ? for blank', () => {
      expect(component.getInitials({ id: 'x', name: { 'en-US': 'Ada  Byron Lovelace' } })).toBe('AL');
      expect(component.getInitials({ id: 'x', name: { 'en-US': 'zed' } })).toBe('ZE');
      expect(component.getInitials({ id: 'x', name: { 'en-US': '   ' } })).toBe('?');
    });
  });

  describe('search', () => {
    function search(value: string): void {
      const input = el().querySelector('.search-input') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    }

    it('filters by name and role, case-insensitively', () => {
      search('MIRA');
      expect(component.filteredCharacters.map((c) => c.id)).toEqual(['mira']);
      search('villain');
      expect(component.filteredCharacters.map((c) => c.id)).toEqual(['rook']);
      expect(el().querySelectorAll('.character-card').length).toBe(1);
    });

    it('shows an empty state with the query when nothing matches', () => {
      search('zzz');
      expect(el().querySelectorAll('.character-card').length).toBe(0);
      expect(el().querySelector('.empty-state')?.textContent?.trim()).toBe('No match for "zzz"');
    });

    it('whitespace-only queries show everyone', () => {
      search('   ');
      expect(component.filteredCharacters.length).toBe(3);
    });

    it('shows the empty state for an empty character list', () => {
      fixture.componentRef.setInput('characters', []);
      fixture.detectChanges();
      expect(el().querySelector('.empty-state')).not.toBeNull();
    });
  });

  describe('detail view', () => {
    function openFirst(): void {
      (el().querySelectorAll('.character-card')[0] as HTMLButtonElement).click();
      fixture.detectChanges();
    }

    it('opens on card click, clears search, and shows portrait, role and bio', () => {
      component.searchQuery = 'mi';
      openFirst();
      expect(component.currentView).toBe('detail');
      expect(component.selectedCharacter).toBe(characters[0]);
      expect(component.searchQuery).toBe('');
      expect(el().querySelector('.roster-title')?.textContent?.trim()).toBe('Mira Vale');
      expect(el().querySelector('.role-badge')?.textContent?.trim()).toBe('Protagonist');
      expect(el().querySelector('.bio-content')?.textContent?.trim()).toBe('A cartographer.');
      expect(el().querySelector('.portrait-image')?.getAttribute('src')).toBe('https://assets.example/avatars/mira.png');
      expect(el().querySelector('.voice-btn')).not.toBeNull();
      expect(el().querySelector('[role="dialog"]')?.getAttribute('aria-label')).toBe('Character Details');
    });

    it('shows placeholders when a character has no avatar, bio, role or voice', () => {
      component.selectCharacter(characters[2]);
      render();
      expect(el().querySelector('.portrait-placeholder')?.textContent?.trim()).toBe('NA');
      expect(el().querySelector('.bio-empty')).not.toBeNull();
      expect(el().querySelector('.role-badge')).toBeNull();
      expect(el().querySelector('.voice-btn')).toBeNull();
    });

    it('back button returns to the list', () => {
      openFirst();
      (el().querySelector('.back-btn') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(component.currentView).toBe('list');
      expect(component.selectedCharacter).toBeNull();
      expect(el().querySelectorAll('.character-card').length).toBe(3);
    });

    it('close from the detail view resets to the list and emits close', () => {
      let closed = 0;
      component.close.subscribe(() => closed++);
      openFirst();
      (el().querySelector('.close-btn') as HTMLButtonElement).click();
      expect(closed).toBe(1);
      expect(component.currentView).toBe('list');
    });
  });

  describe('voice samples', () => {
    it('plays a relative sample via baseUrl and toggles off on second click', async () => {
      const audio = makeAudio();
      const ctor = spyOn(window, 'Audio').and.returnValue(audio as unknown as HTMLAudioElement);

      component.playVoiceSample(characters[0]);
      expect(ctor).toHaveBeenCalledWith('https://assets.example/voices/mira.mp3');
      expect(audio.play).toHaveBeenCalled();
      await fixture.whenStable();
      expect(component.isPlaying).toBeTrue();

      component.playVoiceSample(characters[0]);
      expect(audio.pause).toHaveBeenCalled();
      expect(audio.currentTime).toBe(0);
      expect(component.isPlaying).toBeFalse();
    });

    it('uses absolute sample URLs unchanged', () => {
      const ctor = spyOn(window, 'Audio').and.returnValue(makeAudio() as unknown as HTMLAudioElement);
      component.playVoiceSample({ id: 'a', name: {}, voiceSample: 'data:audio/mp3;base64,AA' });
      expect(ctor).toHaveBeenCalledWith('data:audio/mp3;base64,AA');
    });

    it('does nothing without a voice sample', () => {
      const ctor = spyOn(window, 'Audio');
      component.playVoiceSample(characters[1]);
      expect(ctor).not.toHaveBeenCalled();
      expect(component.hasVoiceSample(characters[1])).toBeFalse();
      expect(component.hasVoiceSample(characters[0])).toBeTrue();
    });

    it('resets playing state on ended and error events', async () => {
      const audio = makeAudio();
      spyOn(window, 'Audio').and.returnValue(audio as unknown as HTMLAudioElement);
      const err = spyOn(console, 'error');
      component.playVoiceSample(characters[0]);
      await fixture.whenStable();
      expect(component.isPlaying).toBeTrue();
      audio.handlers['ended']();
      expect(component.isPlaying).toBeFalse();
      component.isPlaying = true;
      audio.handlers['error']();
      expect(component.isPlaying).toBeFalse();
      expect(err).toHaveBeenCalledWith('Failed to load voice sample');
    });

    it('handles a rejected play() promise', async () => {
      const audio = makeAudio(Promise.reject(new Error('blocked')));
      spyOn(window, 'Audio').and.returnValue(audio as unknown as HTMLAudioElement);
      const err = spyOn(console, 'error');
      component.playVoiceSample(characters[0]);
      await fixture.whenStable();
      await Promise.resolve();
      expect(component.isPlaying).toBeFalse();
      expect(err).toHaveBeenCalledWith('Failed to play voice sample:', jasmine.any(Error));
    });

    it('stops playback when returning to the list', async () => {
      const audio = makeAudio();
      spyOn(window, 'Audio').and.returnValue(audio as unknown as HTMLAudioElement);
      component.selectCharacter(characters[0]);
      component.playVoiceSample(characters[0]);
      await fixture.whenStable();
      component.backToList();
      expect(audio.pause).toHaveBeenCalled();
      expect(component.isPlaying).toBeFalse();
    });

    it('voice button click starts playback', () => {
      const audio = makeAudio();
      spyOn(window, 'Audio').and.returnValue(audio as unknown as HTMLAudioElement);
      component.selectCharacter(characters[0]);
      render();
      (el().querySelector('.voice-btn') as HTMLButtonElement).click();
      expect(audio.play).toHaveBeenCalled();
    });
  });

  describe('closing', () => {
    let closed: number;
    beforeEach(() => {
      closed = 0;
      component.close.subscribe(() => closed++);
    });

    it('closes on backdrop click but not on clicks inside the dialog', () => {
      (el().querySelector('.roster-container') as HTMLElement).click();
      expect(closed).toBe(0);
      (el().querySelector('.roster-overlay') as HTMLElement).click();
      expect(closed).toBe(1);
    });

    it('closes on Enter/Space on the backdrop itself only', () => {
      const overlay = el().querySelector('.roster-overlay') as HTMLElement;
      const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
      overlay.dispatchEvent(enter);
      expect(closed).toBe(1);
      expect(enter.defaultPrevented).toBeTrue();
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
      expect(closed).toBe(2);
      overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }));
      expect(closed).toBe(2);
      (el().querySelector('.roster-container') as HTMLElement).dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }),
      );
      expect(closed).toBe(2);
    });

    it('closes on Escape only while visible', () => {
      const esc = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      window.dispatchEvent(esc);
      expect(closed).toBe(1);
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
