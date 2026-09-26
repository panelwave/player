import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TranslateModule } from '@ngx-translate/core';

import { LanguageModalComponent } from './language-modal.component';

describe('LanguageModalComponent', () => {
  let fixture: ComponentFixture<LanguageModalComponent>;
  let component: LanguageModalComponent;
  let closed: number;
  let selected: string[];

  const q = <T extends HTMLElement>(sel: string): T | null =>
    fixture.nativeElement.querySelector(sel) as T | null;
  const items = (): HTMLButtonElement[] =>
    Array.from(fixture.nativeElement.querySelectorAll('.language-item') as NodeListOf<HTMLButtonElement>);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LanguageModalComponent, TranslateModule.forRoot()],
    }).compileComponents();
    fixture = TestBed.createComponent(LanguageModalComponent);
    component = fixture.componentInstance;
    closed = 0;
    selected = [];
    component.closeModal.subscribe(() => closed++);
    component.localeSelected.subscribe((l) => selected.push(l));
  });

  function show(locales: string[], current: string): void {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('availableLocales', locales);
    fixture.componentRef.setInput('currentLocale', current);
    fixture.detectChanges();
  }

  it('renders nothing while hidden', () => {
    fixture.detectChanges();
    expect(q('.language-overlay')).toBeNull();
  });

  it('lists every available locale and marks the current one', () => {
    show(['en-US', 'de-DE', 'fr-FR'], 'de-DE');
    const list = items();
    expect(list.map((b) => b.querySelector('.language-name')?.textContent?.trim())).toEqual([
      'en-US',
      'de-DE',
      'fr-FR',
    ]);
    expect(list[1].classList).toContain('active');
    expect(list[0].classList).not.toContain('active');
    expect(list[1].querySelector('.language-check')).not.toBeNull();
    expect(list[0].querySelector('.language-check')).toBeNull();
  });

  it('renders an empty list when no locales are available', () => {
    show([], 'en-US');
    expect(items().length).toBe(0);
    expect(q('[role="dialog"]')).not.toBeNull();
  });

  it('emits the selected locale and then closes', () => {
    show(['en-US', 'de-DE'], 'en-US');
    items()[1].click();
    expect(selected).toEqual(['de-DE']);
    expect(closed).toBe(1);
  });

  it('closes from the close button without selecting', () => {
    show(['en-US'], 'en-US');
    q<HTMLButtonElement>('.close-btn')?.click();
    expect(closed).toBe(1);
    expect(selected).toEqual([]);
  });

  it('closes on backdrop click but not inside the dialog', () => {
    show(['en-US'], 'en-US');
    q<HTMLElement>('.language-container')?.click();
    expect(closed).toBe(0);
    q<HTMLElement>('.language-overlay')?.click();
    expect(closed).toBe(1);
  });

  it('closes on Escape but ignores other keys', () => {
    show(['en-US'], 'en-US');
    const overlay = q<HTMLElement>('.language-overlay') as HTMLElement;
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    expect(closed).toBe(0);
    overlay.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    expect(closed).toBe(1);
  });
});
