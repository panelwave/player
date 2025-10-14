/**
 * Player State Service
 * Manages the current state of the player
 */

import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';
import type { Panel, LocaleCode } from '../types';

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
   * Current panel observable
   */
  readonly currentPanel$: Observable<Panel | null> = this.currentPanelSubject.asObservable();

  /**
   * Current locale observable
   */
  readonly locale$: Observable<LocaleCode> = this.localeSubject.asObservable();

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
}
