import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { SettingsModalComponent, type Preferences, type VariableChange } from './settings-modal.component';
import type { VariableDefinition } from '../../../types';

describe('SettingsModalComponent', () => {
  let fixture: ComponentFixture<SettingsModalComponent>;
  let component: SettingsModalComponent;
  let prefsOut: Preferences[];
  let localesOut: string[];
  let varsOut: VariableChange[];
  let closed: number;

  const q = <T extends HTMLElement>(sel: string): T | null =>
    fixture.nativeElement.querySelector(sel) as T | null;
  const qa = <T extends HTMLElement>(sel: string): T[] =>
    Array.from(fixture.nativeElement.querySelectorAll(sel) as NodeListOf<T>);

  const basePrefs = (): Preferences => ({
    speech: true,
    audio: true,
    sfx: true,
    autoplay: false,
    secondsPerPanel: 5,
    mangaMode: false,
    reducedMotion: false,
    highContrast: false,
  });

  const variables: VariableDefinition[] = [
    { id: 'brave', type: 'boolean', scope: 'global', default: false },
    { id: 'gold', type: 'number', scope: 'global', default: 10, min: 0, max: 99 },
    { id: 'path', type: 'enum', scope: 'global', enum: ['left', 'right'], default: 'left' },
    { id: 'name', type: 'string', scope: 'global', default: 'Hero' },
    { id: 'secret', type: 'string', scope: 'global', visibility: 'private' },
    { id: 'locked', type: 'number', scope: 'global', readOnly: true },
  ];

  function footerButton(kind: 'primary' | 'secondary'): HTMLButtonElement {
    return q<HTMLButtonElement>(`.settings-footer .action-btn.${kind}`) as HTMLButtonElement;
  }

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [SettingsModalComponent], providers: [provideTranslateService()],
    }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('en', {
      settings: {
        title: 'Settings',
        enabled: 'On',
        disabled: 'Off',
        no_variables: 'Nothing to tweak',
        save_changes: 'Save',
      },
    });
    translate.use('en');

    fixture = TestBed.createComponent(SettingsModalComponent);
    component = fixture.componentInstance;
    prefsOut = [];
    localesOut = [];
    varsOut = [];
    closed = 0;
    component.preferencesChange.subscribe((p) => prefsOut.push(p));
    component.localeChange.subscribe((l) => localesOut.push(l));
    component.variableChange.subscribe((v) => varsOut.push(v));
    component.close.subscribe(() => closed++);

    fixture.componentRef.setInput('preferences', basePrefs());
    fixture.componentRef.setInput('availableLocales', ['en-US', 'de-DE']);
    fixture.componentRef.setInput('locale', 'en-US');
    fixture.componentRef.setInput('variables', variables);
    fixture.componentRef.setInput('variableValues', { gold: 42 });
    fixture.componentRef.setInput('visible', true);
    await render();
  });

  describe('rendering', () => {
    it('renders nothing while hidden', async () => {
      fixture.componentRef.setInput('visible', false);
      await render();
      expect(q('.settings-overlay')).toBeNull();
    });

    it('shows translated title and the preferences tab by default', () => {
      expect(q('.settings-title')?.textContent?.trim()).toBe('Settings');
      const tabs = qa<HTMLButtonElement>('.tab-btn');
      expect(tabs[0].classList).toContain('active');
      expect(tabs[0].getAttribute('aria-selected')).toBe('true');
      expect(tabs[1].getAttribute('aria-selected')).toBe('false');
      expect(q('#locale-select')).not.toBeNull();
    });

    it('lists available locales and reflects the current preferences', () => {
      const options = qa<HTMLOptionElement>('#locale-select option');
      expect(options.map((o) => o.value)).toEqual(['en-US', 'de-DE']);
      expect(q<HTMLSelectElement>('#locale-select')?.value).toBe('en-US');
      const boxes = qa<HTMLInputElement>('.setting-checkbox');
      // mangaMode, reducedMotion, highContrast, speech, audio, sfx, autoplay
      expect(boxes.map((b) => b.checked)).toEqual([false, false, false, true, true, true, false]);
      expect(q<HTMLInputElement>('#seconds-input')?.value).toBe('5');
    });
  });

  describe('preferences', () => {
    it('saves toggled preferences, locale and closes', async () => {
      qa<HTMLInputElement>('.setting-checkbox')[0].click(); // mangaMode
      const select = q<HTMLSelectElement>('#locale-select') as HTMLSelectElement;
      select.value = 'de-DE';
      select.dispatchEvent(new Event('change'));
      await render();

      footerButton('primary').click();
      expect(prefsOut.length).toBe(1);
      expect(prefsOut[0].mangaMode).toBeTrue();
      expect(prefsOut[0].speech).toBeTrue();
      expect(localesOut).toEqual(['de-DE']);
      expect(varsOut).toEqual([]);
      expect(closed).toBe(1);
    });

    it('updates secondsPerPanel from the number input', async () => {
      const input = q<HTMLInputElement>('#seconds-input') as HTMLInputElement;
      input.value = '7.5';
      input.dispatchEvent(new Event('input'));
      await render();
      component.save();
      expect(prefsOut[0].secondsPerPanel).toBe(7.5);
    });

    it('updatePreference replaces the preferences object immutably', () => {
      const before = component.preferences;
      component.updatePreference('autoplay', true);
      expect(component.preferences).not.toBe(before);
      expect(component.preferences.autoplay).toBeTrue();
    });

    it('cancel restores the original preferences and locale, emits nothing but close', () => {
      component.updatePreference('highContrast', true);
      component.updateLocale('de-DE');
      footerButton('secondary').click();
      expect(component.preferences.highContrast).toBeFalse();
      expect(component.locale).toBe('en-US');
      expect(prefsOut).toEqual([]);
      expect(localesOut).toEqual([]);
      expect(closed).toBe(1);
    });

    it('reset defaults restores the default preferences', async () => {
      fixture.componentRef.setInput('preferences', {
        ...basePrefs(),
        speech: false,
        autoplay: true,
        secondsPerPanel: 12,
      });
      await render();
      q<HTMLButtonElement>('.settings-actions .action-btn')?.click();
      expect(component.preferences).toEqual(basePrefs());
    });

    it('save records new originals so a later cancel keeps saved values', () => {
      component.updatePreference('reducedMotion', true);
      component.save();
      component.updatePreference('reducedMotion', false);
      component.cancel();
      expect(component.preferences.reducedMotion).toBeTrue();
    });
  });

  describe('working copy', () => {
    it('never mutates the parent preferences object while editing, and Cancel leaves it untouched', async () => {
      const parentPrefs = basePrefs();
      fixture.componentRef.setInput('preferences', parentPrefs);
      await render();

      qa<HTMLInputElement>('.setting-checkbox').forEach((box) => box.click());
      const seconds = q<HTMLInputElement>('#seconds-input') as HTMLInputElement;
      seconds.value = '9';
      seconds.dispatchEvent(new Event('input'));
      await render();

      expect(parentPrefs).toEqual(basePrefs());
      expect(component.preferences.mangaMode).toBeTrue();
      expect(component.preferences.secondsPerPanel).toBe(9);

      footerButton('secondary').click();
      expect(parentPrefs).toEqual(basePrefs());
      expect(component.preferences).toEqual(basePrefs());
      expect(prefsOut).toEqual([]);
    });

    it('never mutates the parent variableValues object', async () => {
      const parentValues = { gold: 42 };
      fixture.componentRef.setInput('variableValues', parentValues);
      await render();
      component.updateVariable('gold', 1);
      component.cancel();
      expect(parentValues).toEqual({ gold: 42 });
    });

    it('Save emits the edited copy while the parent object stays unchanged', async () => {
      const parentPrefs = basePrefs();
      fixture.componentRef.setInput('preferences', parentPrefs);
      await render();
      qa<HTMLInputElement>('.setting-checkbox')[0].click();
      await render();
      component.save();
      expect(prefsOut[0].mangaMode).toBeTrue();
      expect(prefsOut[0]).not.toBe(parentPrefs);
      expect(parentPrefs.mangaMode).toBeFalse();
    });

    it('re-captures the cancel baseline when inputs change after init', async () => {
      fixture.componentRef.setInput('preferences', { ...basePrefs(), autoplay: true });
      fixture.componentRef.setInput('locale', 'de-DE');
      fixture.componentRef.setInput('variableValues', { gold: 7 });
      await render();

      component.updatePreference('autoplay', false);
      component.updateLocale('en-US');
      component.updateVariable('gold', 8);
      component.cancel();

      expect(component.preferences.autoplay).toBeTrue();
      expect(component.locale).toBe('de-DE');
      expect(component.variableValues).toEqual({ gold: 7 });
    });

    it('discards unsaved edits when the modal is hidden without Save and opened again', async () => {
      component.updatePreference('speech', false);
      component.updateVariable('gold', 3);
      fixture.componentRef.setInput('visible', false);
      await render();
      fixture.componentRef.setInput('visible', true);
      await render();

      expect(component.preferences.speech).toBeTrue();
      expect(component.variableValues).toEqual({ gold: 42 });
      expect(qa<HTMLInputElement>('.setting-checkbox')[3].checked).toBeTrue();
    });
  });

  describe('variables tab', () => {
    beforeEach(async () => {
      qa<HTMLButtonElement>('.tab-btn')[1].click();
      await render();
    });

    it('switches tabs', () => {
      expect(component.activeTab).toBe('variables');
      expect(qa<HTMLButtonElement>('.tab-btn')[1].classList).toContain('active');
      expect(q('#locale-select')).toBeNull();
    });

    it('lists only public, writable variables with type-specific editors', () => {
      const items = qa<HTMLElement>('.variable-item');
      expect(items.map((i) => i.querySelector('.setting-label')?.textContent?.trim())).toEqual([
        'brave',
        'gold',
        'path',
        'name',
      ]);
      expect(items[0].querySelector('input[type="checkbox"]')).not.toBeNull();
      expect(items[0].querySelector('.toggle-label span')?.textContent?.trim()).toBe('Off');
      const num = items[1].querySelector('input[type="number"]') as HTMLInputElement;
      expect(num.value).toBe('42');
      expect(num.min).toBe('0');
      expect(num.max).toBe('99');
      const opts = Array.from(items[2].querySelectorAll('option')).map((o) => o.value);
      expect(opts).toEqual(['left', 'right']);
      expect(items[2].querySelector('input')).toBeNull();
      expect((items[3].querySelector('input.setting-text') as HTMLInputElement).value).toBe('Hero');
    });

    it('emits only changed variables on save', async () => {
      const items = qa<HTMLElement>('.variable-item');
      (items[0].querySelector('input[type="checkbox"]') as HTMLInputElement).click();
      const num = items[1].querySelector('input[type="number"]') as HTMLInputElement;
      num.value = '50';
      num.dispatchEvent(new Event('input'));
      const sel = items[2].querySelector('select') as HTMLSelectElement;
      sel.value = 'right';
      sel.dispatchEvent(new Event('change'));
      const text = items[3].querySelector('input.setting-text') as HTMLInputElement;
      text.value = 'Zed';
      text.dispatchEvent(new Event('input'));
      await render();
      expect(qa<HTMLElement>('.variable-item')[0].querySelector('.toggle-label span')?.textContent?.trim()).toBe(
        'On',
      );

      footerButton('primary').click();
      expect(varsOut).toEqual([
        { key: 'gold', value: 50 },
        { key: 'brave', value: true },
        { key: 'path', value: 'right' },
        { key: 'name', value: 'Zed' },
      ]);
    });

    it('does not emit a variable set back to its original value', () => {
      component.updateVariable('gold', 43);
      component.updateVariable('gold', 42);
      component.save();
      expect(varsOut).toEqual([]);
    });

    it('resets a single number variable to its default', async () => {
      q<HTMLButtonElement>('.reset-btn-small')?.click();
      await render();
      expect(component.getVariableValue(variables[1])).toBe(10);
      component.save();
      expect(varsOut).toEqual([{ key: 'gold', value: 10 }]);
    });

    it('reset all only resets public variables', () => {
      component.updateVariable('secret', 'keep');
      q<HTMLButtonElement>('.settings-actions .action-btn')?.click();
      expect(component.variableValues).toEqual({
        gold: 10,
        brave: false,
        path: 'left',
        name: 'Hero',
        secret: 'keep',
      });
    });

    it('cancel discards variable edits', () => {
      component.updateVariable('gold', 1);
      component.cancel();
      expect(component.variableValues).toEqual({ gold: 42 });
    });

    it('shows an empty state without public variables', async () => {
      fixture.componentRef.setInput('variables', [variables[4], variables[5]]);
      await render();
      expect(q('.empty-state')?.textContent?.trim()).toBe('Nothing to tweak');
      expect(q('.variable-item')).toBeNull();
    });
  });

  describe('variable type helpers', () => {
    const v = (partial: Partial<VariableDefinition>): VariableDefinition =>
      ({ id: 'x', scope: 'global', ...partial }) as VariableDefinition;

    it('classifies variable types', () => {
      expect(component.getVariableType(v({}))).toBe('string');
      expect(component.isString(v({}))).toBeTrue();
      expect(component.isNumber(v({ type: 'integer' }))).toBeTrue();
      expect(component.isNumber(v({ type: 'string' }))).toBeFalse();
      expect(component.isBoolean(v({ type: 'boolean' }))).toBeTrue();
      expect(component.isEnum(v({ type: 'string', enum: ['a'] }))).toBeTrue();
      expect(component.isString(v({ type: 'string', enum: ['a'] }))).toBeFalse();
      expect(component.getEnumOptions(v({ type: 'enum' }))).toEqual([]);
      expect(component.getMin(v({ type: 'number' }))).toBeUndefined();
      expect(component.getMax(v({ type: 'number', max: 3 }))).toBe(3);
    });

    it('falls back to the default when no value is set', () => {
      expect(component.getVariableValue(variables[3])).toBe('Hero');
      expect(component.getVariableValue(variables[1])).toBe(42);
    });
  });

  describe('closing', () => {
    it('header close button cancels', () => {
      component.updatePreference('sfx', false);
      q<HTMLButtonElement>('.close-btn')?.click();
      expect(component.preferences.sfx).toBeTrue();
      expect(closed).toBe(1);
    });

    it('backdrop click cancels, clicks inside the dialog do not', () => {
      q<HTMLElement>('.settings-container')?.click();
      expect(closed).toBe(0);
      component.updatePreference('sfx', false);
      q<HTMLElement>('.settings-overlay')?.click();
      expect(component.preferences.sfx).toBeTrue();
      expect(closed).toBe(1);
    });

    it('window Escape cancels (preventing default) only while visible', () => {
      component.updatePreference('audio', false);
      const ev = new KeyboardEvent('keydown', { key: 'Escape', cancelable: true });
      window.dispatchEvent(ev);
      expect(ev.defaultPrevented).toBeTrue();
      expect(component.preferences.audio).toBeTrue();
      expect(closed).toBe(1);

      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      expect(closed).toBe(1);

      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
    });

    it('Escape inside the overlay reverts like Cancel and does not bubble to the window handler', () => {
      const cancelSpy = spyOn(component, 'cancel').and.callThrough();
      component.updatePreference('audio', false);
      component.updateLocale('de-DE');
      component.updateVariable('gold', 1);
      q<HTMLElement>('.settings-overlay')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      expect(closed).toBe(1);
      expect(cancelSpy).toHaveBeenCalledTimes(1);
      expect(component.preferences.audio).toBeTrue();
      expect(component.locale).toBe('en-US');
      expect(component.variableValues).toEqual({ gold: 42 });
      expect(prefsOut).toEqual([]);
    });
  });
});
