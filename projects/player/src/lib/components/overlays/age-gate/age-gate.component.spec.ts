import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { AgeGateComponent, type AgeVerificationResult } from './age-gate.component';

describe('AgeGateComponent', () => {
  let fixture: ComponentFixture<AgeGateComponent>;
  let component: AgeGateComponent;
  let results: AgeVerificationResult[];
  let closed: number;

  const q = <T extends HTMLElement>(sel: string): T | null =>
    fixture.nativeElement.querySelector(sel) as T | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AgeGateComponent] }).compileComponents();
    fixture = TestBed.createComponent(AgeGateComponent);
    component = fixture.componentInstance;
    results = [];
    closed = 0;
    component.verify.subscribe((r) => results.push(r));
    component.close.subscribe(() => closed++);
    fixture.componentRef.setInput('visible', true);
    fixture.detectChanges();
    await fixture.whenStable();
  });

  function selectValue(id: string, value: string): void {
    const select = q<HTMLSelectElement>(`#${id}`) as HTMLSelectElement;
    select.value = value;
    select.dispatchEvent(new Event('change'));
  }

  async function enterDate(month: number | '', day: number | '', year: number | ''): Promise<void> {
    selectValue('birth-month', String(month));
    selectValue('birth-day', String(day));
    selectValue('birth-year', String(year));
    fixture.detectChanges();
    await fixture.whenStable();
  }

  function submit(): void {
    q<HTMLButtonElement>('.verify-btn')?.click();
    fixture.detectChanges();
  }

  function errorText(): string | undefined {
    return q('.error-message')?.textContent?.trim();
  }

  /** Date `years` years before today, shifted by `dayOffset` days. */
  function yearsAgo(years: number, dayOffset = 0): Date {
    const d = new Date();
    d.setHours(12, 0, 0, 0);
    d.setFullYear(d.getFullYear() - years);
    d.setDate(d.getDate() + dayOffset);
    return d;
  }

  describe('rendering', () => {
    it('toggles the visible class from the input', () => {
      const overlay = q('.age-gate-overlay') as HTMLElement;
      expect(overlay.classList).toContain('visible');
      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      expect(overlay.classList).not.toContain('visible');
    });

    it('shows the default warning with the minimum age', () => {
      fixture.componentRef.setInput('minimumAge', 16);
      fixture.detectChanges();
      expect(q('.warning-message')?.textContent).toContain('16 years of age or older');
    });

    it('prefers a custom warning message', () => {
      fixture.componentRef.setInput('warningMessage', 'Mature themes ahead');
      fixture.detectChanges();
      expect(q('.warning-message')?.textContent?.trim()).toBe('Mature themes ahead');
    });

    it('renders 12 months, 31 days and years from this year down to 1900', () => {
      const currentYear = new Date().getFullYear();
      // +1 for the empty placeholder option in each select
      expect(q('#birth-month')?.querySelectorAll('option').length).toBe(13);
      expect(q('#birth-day')?.querySelectorAll('option').length).toBe(32);
      expect(q('#birth-year')?.querySelectorAll('option').length).toBe(currentYear - 1900 + 2);
      const months = component.getMonthOptions();
      expect(months[0]).toEqual({ value: '1', label: 'January' });
      expect(months[11]).toEqual({ value: '12', label: 'December' });
      const years = component.getYearOptions();
      expect(years[0]).toBe(currentYear);
      expect(years[years.length - 1]).toBe(1900);
      expect(component.getDayOptions()[30]).toBe(31);
    });

    it('hides the close button when dismiss is not allowed', () => {
      expect(q('.close-btn')).not.toBeNull();
      fixture.componentRef.setInput('allowDismiss', false);
      fixture.detectChanges();
      expect(q('.close-btn')).toBeNull();
    });
  });

  describe('validation', () => {
    it('requires a complete birth date', async () => {
      await enterDate(5, '', 1990);
      submit();
      expect(errorText()).toBe('Please enter your complete birth date.');
      expect(q('.error-message')?.getAttribute('role')).toBe('alert');
      expect(results).toEqual([]);
    });

    it('rejects an out-of-range month', () => {
      component.birthMonth = '13';
      component.birthDay = '1';
      component.birthYear = '1990';
      component.onSubmit();
      expect(component.errorMessage).toBe('Please enter a valid month (1-12).');
      component.birthMonth = '0';
      component.onSubmit();
      expect(component.errorMessage).toBe('Please enter a valid month (1-12).');
    });

    it('rejects an out-of-range day', () => {
      component.birthMonth = '1';
      component.birthDay = '32';
      component.birthYear = '1990';
      component.onSubmit();
      expect(component.errorMessage).toBe('Please enter a valid day (1-31).');
    });

    it('rejects calendar-impossible dates instead of rolling them over', () => {
      const cases: [string, string, string, number][] = [
        ['2', '31', '1990', 28],
        ['2', '30', '2000', 29],
        ['2', '29', '1990', 28],
        ['2', '29', '1900', 28],
        ['4', '31', '1990', 30],
        ['6', '31', '1990', 30],
        ['9', '31', '1990', 30],
        ['11', '31', '1990', 30],
      ];
      for (const [m, d, y, max] of cases) {
        component.birthMonth = m;
        component.birthDay = d;
        component.birthYear = y;
        component.onSubmit();
        expect(component.errorMessage).withContext(`${y}-${m}-${d}`).toBe(`Please enter a valid day (1-${max}).`);
      }
      expect(results).toEqual([]);
    });

    it('shows the invalid-day error in the DOM for 31 February', async () => {
      await enterDate(2, 31, 1990);
      submit();
      expect(errorText()).toBe('Please enter a valid day (1-28).');
      expect(results).toEqual([]);
    });

    it('accepts real month-end and leap dates', () => {
      const cases: [string, string, string][] = [
        ['2', '29', '2000'],
        ['2', '29', '1996'],
        ['2', '28', '1990'],
        ['4', '30', '1990'],
        ['12', '31', '1990'],
      ];
      for (const [m, d, y] of cases) {
        component.birthMonth = m;
        component.birthDay = d;
        component.birthYear = y;
        component.onSubmit();
        expect(component.errorMessage).withContext(`${y}-${m}-${d}`).toBe('');
      }
      expect(results.length).toBe(cases.length);
      expect(results.every((r) => r.verified)).toBeTrue();
      expect(results[0].birthDate?.getMonth()).toBe(1);
      expect(results[0].birthDate?.getDate()).toBe(29);
    });

    it('rejects years before 1900 and in the future', () => {
      const next = new Date().getFullYear() + 1;
      component.birthMonth = '1';
      component.birthDay = '1';
      component.birthYear = '1899';
      component.onSubmit();
      expect(component.errorMessage).toContain('Please enter a valid year (1900-');
      component.birthYear = String(next);
      component.onSubmit();
      expect(component.errorMessage).toBe(`Please enter a valid year (1900-${next - 1}).`);
      expect(results).toEqual([]);
    });

    it('clears a previous error on a successful resubmit', async () => {
      await enterDate('', '', '');
      submit();
      expect(errorText()).toBeTruthy();
      const d = yearsAgo(30);
      await enterDate(d.getMonth() + 1, d.getDate(), d.getFullYear());
      submit();
      expect(q('.error-message')).toBeNull();
      expect(results.length).toBe(1);
      expect(results[0].verified).toBeTrue();
    });
  });

  describe('age verification', () => {
    it('verifies a user who is exactly the minimum age today', async () => {
      const d = yearsAgo(18);
      await enterDate(d.getMonth() + 1, d.getDate(), d.getFullYear());
      submit();
      expect(results.length).toBe(1);
      expect(results[0].verified).toBeTrue();
      expect(results[0].age).toBe(18);
      expect(results[0].birthDate?.getFullYear()).toBe(d.getFullYear());
      expect(closed).toBe(0);
    });

    it('rejects a user whose birthday is tomorrow', async () => {
      const d = yearsAgo(18, 1);
      await enterDate(d.getMonth() + 1, d.getDate(), d.getFullYear());
      submit();
      expect(results.length).toBe(1);
      expect(results[0].verified).toBeFalse();
      expect(results[0].age).toBe(17);
      expect(errorText()).toBe('You must be at least 18 years old to access this content.');
    });

    it('honours a custom minimum age', async () => {
      fixture.componentRef.setInput('minimumAge', 21);
      fixture.detectChanges();
      const d = yearsAgo(20);
      await enterDate(d.getMonth() + 1, d.getDate(), d.getFullYear());
      submit();
      expect(results[0]).toEqual(jasmine.objectContaining({ verified: false, age: 20 }));
      expect(errorText()).toContain('at least 21 years old');
    });

    it('treats a birth month later this year as not yet having had the birthday', () => {
      const today = new Date();
      if (today.getMonth() === 11) {
        pending('no later month available in December');
        return;
      }
      component.birthMonth = String(today.getMonth() + 2);
      component.birthDay = '1';
      component.birthYear = String(today.getFullYear() - 18);
      component.onSubmit();
      expect(results[0]).toEqual(jasmine.objectContaining({ verified: false, age: 17 }));
    });
  });

  describe('dismissal', () => {
    it('close button emits an unverified result and close', () => {
      q<HTMLButtonElement>('.close-btn')?.click();
      expect(results).toEqual([{ verified: false }]);
      expect(closed).toBe(1);
    });

    it('backdrop click dismisses, clicks inside the modal do not', () => {
      q<HTMLElement>('.age-gate-modal')?.click();
      expect(closed).toBe(0);
      q<HTMLElement>('.age-gate-overlay')?.click();
      expect(closed).toBe(1);
    });

    it('Escape on the overlay dismisses and stops propagation', () => {
      const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
      const stop = spyOn(ev, 'stopPropagation').and.callThrough();
      q<HTMLElement>('.age-gate-overlay')?.dispatchEvent(ev);
      expect(stop).toHaveBeenCalled();
      expect(closed).toBe(1);
    });

    it('document Escape dismisses only while visible', () => {
      fixture.componentRef.setInput('visible', false);
      fixture.detectChanges();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(0);
      fixture.componentRef.setInput('visible', true);
      fixture.detectChanges();
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      expect(closed).toBe(1);
    });

    it('cannot be dismissed at all when allowDismiss is false', () => {
      fixture.componentRef.setInput('allowDismiss', false);
      fixture.detectChanges();
      q<HTMLElement>('.age-gate-overlay')?.click();
      q<HTMLElement>('.age-gate-overlay')?.dispatchEvent(
        new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }),
      );
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
      component.onDismiss();
      expect(closed).toBe(0);
      expect(results).toEqual([]);
    });
  });
});

describe('AgeGateComponent (localized)', () => {
  let fixture: ComponentFixture<AgeGateComponent>;
  const text = (sel: string): string | undefined =>
    (fixture.nativeElement.querySelector(sel) as HTMLElement | null)?.textContent?.replace(/\s+/g, ' ').trim();

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [AgeGateComponent], providers: [provideTranslateService()] }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('de', { age_gate: {"title": "Altersprüfung erforderlich", "close": "Schließen", "warning": "Dieser Inhalt ist nur für Personen ab {{age}} Jahren freigegeben.", "prompt": "Bitte gib dein Geburtsdatum ein:", "month": "Monat", "day": "Tag", "year": "Jahr", "verify": "Alter bestätigen", "privacy": "Deine Angaben sind privat und werden nicht gespeichert.", "error_incomplete": "Bitte gib dein vollständiges Geburtsdatum ein.", "error_month": "Bitte gib einen gültigen Monat ein (1-12).", "error_day": "Bitte gib einen gültigen Tag ein (1-{{max}}).", "error_year": "Bitte gib ein gültiges Jahr ein (1900-{{max}}).", "error_too_young": "Du musst mindestens {{age}} Jahre alt sein, um diesen Inhalt zu sehen."} });
    translate.use('de');
    fixture = TestBed.createComponent(AgeGateComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('locale', 'de-DE');
    fixture.componentRef.setInput('minimumAge', 16);
    fixture.detectChanges();
  });

  it('translates title, labels, warning and errors', () => {
    expect(text('.age-gate-title')).toBe('Altersprüfung erforderlich');
    expect(text('.warning-message')).toBe('Dieser Inhalt ist nur für Personen ab 16 Jahren freigegeben.');
    expect(text('label[for=birth-month]')).toBe('Monat');
    expect(text('.verify-btn')).toBe('Alter bestätigen');
    expect(fixture.nativeElement.querySelector('.close-btn').getAttribute('aria-label')).toBe('Schließen');

    fixture.componentInstance.onSubmit();
    expect(fixture.componentInstance.errorMessage).toBe('Bitte gib dein vollständiges Geburtsdatum ein.');
  });

  it('names the months in the reader locale (Intl)', () => {
    const labels = fixture.componentInstance.getMonthOptions().map((m) => m.label);
    expect(labels[0]).toBe('Januar');
    expect(labels[2]).toBe('März');
    fixture.componentRef.setInput('locale', 'en-US');
    expect(fixture.componentInstance.getMonthOptions()[0].label).toBe('January');
  });
});
