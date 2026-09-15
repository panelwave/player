/**
 * Player State Service
 * Manages the current state of the player
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { Panel, LocaleCode, PlayerPreferences } from '../types';

/** localStorage key for the reader's explicitly set preferences. */
export const PREFERENCES_STORAGE_KEY = 'pw-preferences';

/**
 * Built-in preference defaults. A work's `settings.ui.*Default` can override
 * the toggle-backed ones (speech/audio/sfx) until the reader sets them.
 */
export const DEFAULT_PLAYER_PREFERENCES: PlayerPreferences = {
  speech: true,
  audio: true,
  sfx: true,
  autoplay: false,
  secondsPerPanel: 5,
  mangaMode: false,
  reducedMotion: false,
  highContrast: false,
  masterVolume: 1,
  sfxVolume: 1,
};

/**
 * Player State Service
 * Central state management for player
 */
@Injectable({
  providedIn: 'root',
})
export class PlayerStateService {
  /**
   * Current panel subject
   */
  private currentPanelSubject = new BehaviorSubject<Panel | null>(null);

  /**
   * Current locale subject
   */
  private localeSubject = new BehaviorSubject<LocaleCode>('en-US');

  /**
   * Reader preferences subject
   */
  private preferencesSubject = new BehaviorSubject<PlayerPreferences>({
    ...DEFAULT_PLAYER_PREFERENCES,
  });

  /**
   * Preference keys the reader set explicitly (this session or a persisted
   * earlier one). Only these are written to localStorage, so an untouched
   * preference keeps following the built-in / per-work default.
   */
  private explicitPreferenceKeys = new Set<keyof PlayerPreferences>();

  /**
   * Current panel observable
   */
  readonly currentPanel$: Observable<Panel | null> = this.currentPanelSubject.asObservable();

  /**
   * Current locale observable
   */
  readonly locale$: Observable<LocaleCode> = this.localeSubject.asObservable();

  /**
   * Reader preferences observable
   */
  readonly preferences$: Observable<PlayerPreferences> = this.preferencesSubject.asObservable();

  constructor() {
    this.loadPersistedPreferences();
  }

  /**
   * Set current panel
   */
  setCurrentPanel(panel: Panel | null): void {
    this.currentPanelSubject.next(panel);
  }

  /**
   * Get current panel
   */
  getCurrentPanel(): Panel | null {
    return this.currentPanelSubject.value;
  }

  /**
   * Set locale
   */
  setLocale(locale: LocaleCode): void {
    this.localeSubject.next(locale);
  }

  /**
   * Get current locale
   */
  getLocale(): LocaleCode {
    return this.localeSubject.value;
  }

  // ---------------------------------------------------------------------------
  // Preferences
  // ---------------------------------------------------------------------------

  /**
   * Current preferences snapshot.
   */
  getPreferences(): PlayerPreferences {
    return this.preferencesSubject.value;
  }

  /**
   * Whether the reader has explicitly set this preference (as opposed to it
   * still being the built-in default).
   */
  hasPersistedPreference(key: keyof PlayerPreferences): boolean {
    return this.explicitPreferenceKeys.has(key);
  }

  /**
   * Set one preference and persist it.
   */
  updatePreference<K extends keyof PlayerPreferences>(key: K, value: PlayerPreferences[K]): void {
    this.updatePreferences({ [key]: value } as Partial<PlayerPreferences>);
  }

  /**
   * Set several preferences at once and persist them.
   */
  updatePreferences(preferences: Partial<PlayerPreferences>): void {
    const next = { ...this.preferencesSubject.value, ...preferences };
    (Object.keys(preferences) as (keyof PlayerPreferences)[]).forEach((key) =>
      this.explicitPreferenceKeys.add(key)
    );
    this.preferencesSubject.next(next);
    this.persistPreferences(next);
  }

  /**
   * Load the explicitly set preferences from localStorage.
   */
  private loadPersistedPreferences(): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      const stored = localStorage.getItem(PREFERENCES_STORAGE_KEY);
      if (!stored) {
        return;
      }
      const parsed = JSON.parse(stored) as Partial<PlayerPreferences> | null;
      if (!parsed || typeof parsed !== 'object') {
        return;
      }
      const known: Partial<PlayerPreferences> = {};
      for (const key of Object.keys(DEFAULT_PLAYER_PREFERENCES) as (keyof PlayerPreferences)[]) {
        if (parsed[key] !== undefined) {
          (known as Record<string, unknown>)[key] = parsed[key];
        }
      }
      const next = { ...this.preferencesSubject.value, ...known };
      (Object.keys(known) as (keyof PlayerPreferences)[]).forEach((key) =>
        this.explicitPreferenceKeys.add(key)
      );
      this.preferencesSubject.next(next);
    } catch (error) {
      console.warn('[PlayerStateService] Failed to load persisted preferences:', error);
    }
  }

  /**
   * Persist only the explicitly set preferences.
   */
  private persistPreferences(preferences: PlayerPreferences): void {
    if (typeof localStorage === 'undefined') {
      return;
    }
    try {
      const explicit: Partial<PlayerPreferences> = {};
      for (const key of this.explicitPreferenceKeys) {
        (explicit as Record<string, unknown>)[key] = preferences[key];
      }
      localStorage.setItem(PREFERENCES_STORAGE_KEY, JSON.stringify(explicit));
    } catch (error) {
      console.warn('[PlayerStateService] Failed to persist preferences:', error);
    }
  }
}
