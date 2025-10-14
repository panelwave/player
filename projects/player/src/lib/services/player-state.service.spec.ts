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
});
