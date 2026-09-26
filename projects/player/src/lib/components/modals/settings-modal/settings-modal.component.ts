/**
 * Settings Modal Component
 * Manages user preferences and variables
 */

import {
  Component,
  Input,
  Output,
  EventEmitter,
  OnInit,
  OnChanges,
  SimpleChanges,
  ChangeDetectionStrategy,
  HostListener,
} from '@angular/core';

import { FormsModule } from '@angular/forms';
import { TranslateModule } from '@ngx-translate/core';
import { PwIconComponent } from '../../icon/pw-icon.component';
import type { LocaleCode, VariableDefinition } from '../../../types';

/**
 * Preferences interface
 */
export interface Preferences {
  speech: boolean;
  audio: boolean;
  sfx: boolean;
  autoplay: boolean;
  secondsPerPanel: number;
  mangaMode: boolean;
  reducedMotion: boolean;
  highContrast: boolean;
}

/**
 * Variable value change
 */
export interface VariableChange {
  key: string;
  value: unknown;
}

/**
 * Settings Modal Component
 * Modal for editing preferences and variables
 */
@Component({
    selector: 'pw-settings-modal',
    imports: [FormsModule, TranslateModule, PwIconComponent],
    templateUrl: './settings-modal.component.html',
    styleUrls: ['./settings-modal.component.css'],
    changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsModalComponent implements OnInit, OnChanges {
  /**
   * Current preferences
   */
  @Input() preferences: Preferences = {
    speech: true,
    audio: true,
    sfx: true,
    autoplay: false,
    secondsPerPanel: 5,
    mangaMode: false,
    reducedMotion: false,
    highContrast: false,
  };

  /**
   * Available locales
   */
  @Input() availableLocales: LocaleCode[] = ['en-US'];

  /**
   * Current locale
   */
  @Input() locale: LocaleCode = 'en-US';

  /**
   * Variable definitions
   */
  @Input() variables: VariableDefinition[] = [];

  /**
   * Current variable values
   */
  @Input() variableValues: Record<string, unknown> = {};

  /**
   * Visible state
   */
  @Input() visible = false;

  /**
   * Preferences changed
   */
  @Output() preferencesChange = new EventEmitter<Preferences>();

  /**
   * Locale changed
   */
  @Output() localeChange = new EventEmitter<LocaleCode>();

  /**
   * Variable changed
   */
  @Output() variableChange = new EventEmitter<VariableChange>();

  /**
   * Close modal
   */
  @Output() close = new EventEmitter<void>();

  /**
   * Active tab
   */
  activeTab: 'preferences' | 'variables' = 'preferences';

  /**
   * Local copy of preferences (for cancel)
   */
  private originalPreferences: Preferences = { ...this.preferences };

  /**
   * Local copy of locale (for cancel)
   */
  private originalLocale: LocaleCode = this.locale;

  /**
   * Local copy of variable values (for cancel)
   */
  private originalVariableValues: Record<string, unknown> = { ...this.variableValues };

  /**
   * Initialize component
   */
  ngOnInit(): void {
    this.detachWorkingCopies();
    this.saveOriginalValues();
  }

  /**
   * Keep the cancel baseline in sync with the inputs. New preferences /
   * locale / variable values from the parent become the new baseline; when
   * the modal (re)opens, any edits left over from a previous session that
   * was closed without Save are discarded.
   */
  ngOnChanges(changes: SimpleChanges): void {
    if (changes['preferences']) {
      this.preferences = { ...this.preferences };
      this.originalPreferences = { ...this.preferences };
    }
    if (changes['locale']) {
      this.originalLocale = this.locale;
    }
    if (changes['variableValues']) {
      this.variableValues = { ...this.variableValues };
      this.originalVariableValues = { ...this.variableValues };
    }
    const visible = changes['visible'];
    if (visible && visible.currentValue && !visible.previousValue && !visible.firstChange) {
      this.restoreOriginalValues();
    }
  }

  /**
   * Replace the input objects with component-local copies so edits never
   * mutate the parent's objects before Save emits.
   */
  private detachWorkingCopies(): void {
    this.preferences = { ...this.preferences };
    this.variableValues = { ...this.variableValues };
  }

  /**
   * Restore the working values from the cancel baseline
   */
  private restoreOriginalValues(): void {
    this.preferences = { ...this.originalPreferences };
    this.locale = this.originalLocale;
    this.variableValues = { ...this.originalVariableValues };
  }

  /**
   * Save original values for cancel
   */
  private saveOriginalValues(): void {
    this.originalPreferences = { ...this.preferences };
    this.originalLocale = this.locale;
    this.originalVariableValues = { ...this.variableValues };
  }

  /**
   * Switch tab
   */
  switchTab(tab: 'preferences' | 'variables'): void {
    this.activeTab = tab;
  }

  /**
   * Update preference
   */
  updatePreference<K extends keyof Preferences>(
    key: K,
    value: Preferences[K]
  ): void {
    this.preferences = { ...this.preferences, [key]: value };
  }

  /**
   * Update locale
   */
  updateLocale(locale: LocaleCode): void {
    this.locale = locale;
  }

  /**
   * Update variable
   */
  updateVariable(key: string, value: unknown): void {
    this.variableValues = { ...this.variableValues, [key]: value };
  }

  /**
   * Get variable value
   */
  getVariableValue(variable: VariableDefinition): unknown {
    return this.variableValues[variable.id] ?? variable.default;
  }

  /**
   * Get the reader-editable variables: public visibility (the default
   * when the manifest omits it) and not read-only.
   */
  getPublicVariables(): VariableDefinition[] {
    return this.variables.filter((v) => v.visibility !== 'private' && !v.readOnly);
  }

  /**
   * Save changes
   */
  save(): void {
    // Emit all changes
    this.preferencesChange.emit(this.preferences);
    this.localeChange.emit(this.locale);

    // Emit variable changes
    Object.keys(this.variableValues).forEach((key) => {
      if (this.variableValues[key] !== this.originalVariableValues[key]) {
        this.variableChange.emit({ key, value: this.variableValues[key] });
      }
    });

    this.saveOriginalValues();
    this.onClose();
  }

  /**
   * Cancel changes
   */
  cancel(): void {
    this.restoreOriginalValues();
    this.onClose();
  }

  /**
   * Reset preferences to defaults
   */
  resetPreferences(): void {
    this.preferences = {
      speech: true,
      audio: true,
      sfx: true,
      autoplay: false,
      secondsPerPanel: 5,
      mangaMode: false,
      reducedMotion: false,
      highContrast: false,
    };
  }

  /**
   * Reset variable to default
   */
  resetVariable(variable: VariableDefinition): void {
    this.updateVariable(variable.id, variable.default);
  }

  /**
   * Reset all variables to defaults
   */
  resetAllVariables(): void {
    const publicVars = this.getPublicVariables();
    publicVars.forEach((variable) => {
      this.updateVariable(variable.id, variable.default);
    });
  }

  /**
   * Close modal
   */
  onClose(): void {
    this.close.emit();
  }

  /**
   * Handle backdrop click
   */
  onBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.cancel();
    }
  }

  /**
   * Handle keyboard events
   */
  @HostListener('window:keydown', ['$event'])
  handleKeyboard(event: KeyboardEvent): void {
    if (!this.visible) return;

    if (event.key === 'Escape') {
      event.preventDefault();
      this.cancel();
    }
  }

  /**
   * Get variable editor type
   */
  getVariableType(variable: VariableDefinition): string {
    return variable.type || 'string';
  }

  /**
   * Check if variable is boolean
   */
  isBoolean(variable: VariableDefinition): boolean {
    return this.getVariableType(variable) === 'boolean';
  }

  /**
   * Check if variable is number
   */
  isNumber(variable: VariableDefinition): boolean {
    const type = this.getVariableType(variable);
    return type === 'number' || type === 'integer';
  }

  /**
   * Check if variable is enum
   */
  isEnum(variable: VariableDefinition): boolean {
    return !!(variable as VariableDefinition & { enum?: unknown[] }).enum;
  }

  /**
   * Check if variable is string
   */
  isString(variable: VariableDefinition): boolean {
    return this.getVariableType(variable) === 'string' && !this.isEnum(variable);
  }

  /**
   * Get enum options
   */
  getEnumOptions(variable: VariableDefinition): unknown[] {
    return (variable as VariableDefinition & { enum?: unknown[] }).enum || [];
  }

  /**
   * Get variable min value
   */
  getMin(variable: VariableDefinition): number | undefined {
    return (variable as VariableDefinition & { min?: number }).min;
  }

  /**
   * Get variable max value
   */
  getMax(variable: VariableDefinition): number | undefined {
    return (variable as VariableDefinition & { max?: number }).max;
  }
}
