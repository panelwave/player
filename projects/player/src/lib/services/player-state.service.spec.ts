/**
 * Player State Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { PlayerStateService } from './player-state.service';
import type { Panel, LocaleCode } from '../types';

describe('PlayerStateService', () => {
  let service: PlayerStateService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PlayerStateService);
  });

  it('should be created', () => {
    expect(service).toBeTruthy();
  });

  describe('panel state', () => {
    it('should set and get current panel', () => {
      const panel: Panel = {
        layers: []
      };

      service.setCurrentPanel(panel);

      expect(service.getCurrentPanel()).toBe(panel);
    });

    it('should emit panel changes', (done) => {
      const panel: Panel = {
        title: { 'en-US': 'Test Panel' },
        layers: []
      };

      service.currentPanel$.subscribe((currentPanel) => {
        if (currentPanel) {
          expect(currentPanel).toBe(panel);
          done();
        }
      });

      service.setCurrentPanel(panel);
    });

    it('should allow setting panel to null', () => {
      const panel: Panel = {
        layers: []
      };

      service.setCurrentPanel(panel);
      expect(service.getCurrentPanel()).toBe(panel);

      service.setCurrentPanel(null);
      expect(service.getCurrentPanel()).toBeNull();
    });
  });

  describe('locale state', () => {
    it('should have default locale', () => {
      expect(service.getLocale()).toBe('en-US');
    });

    it('should set and get locale', () => {
      const locale: LocaleCode = 'de-DE';

      service.setLocale(locale);

      expect(service.getLocale()).toBe(locale);
    });

    it('should emit locale changes', (done) => {
      const locale: LocaleCode = 'fr-FR';

      service.locale$.subscribe((currentLocale) => {
        if (currentLocale === locale) {
          expect(currentLocale).toBe(locale);
          done();
        }
      });

      service.setLocale(locale);
    });
  });

  describe('preferences', () => {
    beforeEach(() => {
      localStorage.removeItem('pw-preferences');
    });

    afterEach(() => {
      localStorage.removeItem('pw-preferences');
    });

    it('starts from the built-in defaults with nothing marked explicit', () => {
      const prefs = service.getPreferences();

      expect(prefs.audio).toBe(true);
      expect(prefs.sfx).toBe(true);
      expect(prefs.speech).toBe(true);
      expect(service.hasPersistedPreference('audio')).toBe(false);
    });

    it('updatePreference sets, marks explicit, emits and persists only explicit keys', () => {
      const seen: boolean[] = [];
      service.preferences$.subscribe((p) => seen.push(p.audio));

      service.updatePreference('audio', false);

      expect(service.getPreferences().audio).toBe(false);
      expect(service.hasPersistedPreference('audio')).toBe(true);
      expect(service.hasPersistedPreference('sfx')).toBe(false);
      expect(seen).toEqual([true, false]);
      expect(JSON.parse(localStorage.getItem('pw-preferences')!)).toEqual({ audio: false });
    });

    it('updatePreferences merges several keys', () => {
      service.updatePreferences({ sfx: false, secondsPerPanel: 8 });

      const prefs = service.getPreferences();
      expect(prefs.sfx).toBe(false);
      expect(prefs.secondsPerPanel).toBe(8);
      expect(prefs.audio).toBe(true);
      expect(JSON.parse(localStorage.getItem('pw-preferences')!)).toEqual({
        sfx: false,
        secondsPerPanel: 8,
      });
    });

    it('loads persisted keys on construction and marks them explicit', () => {
      localStorage.setItem('pw-preferences', JSON.stringify({ audio: false, bogus: 1 }));

      const fresh = new PlayerStateService();

      expect(fresh.getPreferences().audio).toBe(false);
      expect(fresh.hasPersistedPreference('audio')).toBe(true);
      expect(fresh.hasPersistedPreference('sfx')).toBe(false);
      expect((fresh.getPreferences() as unknown as Record<string, unknown>)['bogus']).toBeUndefined();
    });

    it('ignores a corrupt stored blob', () => {
      localStorage.setItem('pw-preferences', '{not json');
      spyOn(console, 'warn');

      const fresh = new PlayerStateService();

      expect(fresh.getPreferences().audio).toBe(true);
    });
  });
});
