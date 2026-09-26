import { ComponentFixture, TestBed } from '@angular/core/testing';

import { ActionModalComponent } from './action-modal.component';

describe('ActionModalComponent', () => {
  let fixture: ComponentFixture<ActionModalComponent>;
  let component: ActionModalComponent;
  let closed: number;

  const q = <T extends HTMLElement>(sel: string): T | null =>
    fixture.nativeElement.querySelector(sel) as T | null;

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [ActionModalComponent] }).compileComponents();
    fixture = TestBed.createComponent(ActionModalComponent);
    component = fixture.componentInstance;
    closed = 0;
    component.close.subscribe(() => closed++);
  });

  function show(
    title: Record<string, string> | null,
    content: Record<string, string> | null,
    locale = 'en-US',
  ): void {
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('locale', locale);
    fixture.componentRef.setInput('title', title);
    fixture.componentRef.setInput('content', content);
    fixture.detectChanges();
  }

  it('renders nothing while hidden', () => {
    fixture.detectChanges();
    expect(q('.action-modal-overlay')).toBeNull();
  });

  it('renders the localized title, aria-label and content for the current locale', () => {
    show({ 'en-US': 'Secret', 'de-DE': 'Geheimnis' }, { 'en-US': 'Body', 'de-DE': 'Inhalt' }, 'de-DE');
    expect(q('.action-modal-title')?.textContent?.trim()).toBe('Geheimnis');
    expect(q('.action-modal-content')?.textContent?.trim()).toBe('Inhalt');
    expect(q('[role="dialog"]')?.getAttribute('aria-label')).toBe('Geheimnis');
  });

  it('falls back to en-US when the locale is missing', () => {
    show({ 'en-US': 'Secret' }, { 'en-US': 'Body' }, 'fr-FR');
    expect(q('.action-modal-title')?.textContent?.trim()).toBe('Secret');
    expect(q('.action-modal-content')?.textContent?.trim()).toBe('Body');
  });

  it('renders empty strings for null title/content', () => {
    show(null, null);
    expect(q('.action-modal-title')?.textContent?.trim()).toBe('');
    expect(q('.action-modal-content')?.textContent?.trim()).toBe('');
    expect(component.resolved(null)).toBe('');
  });

  it('renders content as plain text, never HTML', () => {
    show({ 'en-US': 'T' }, { 'en-US': '<b>bold</b>' });
    const content = q('.action-modal-content') as HTMLElement;
    expect(content.querySelector('b')).toBeNull();
    expect(content.textContent).toContain('<b>bold</b>');
  });

  it('emits close from the close button', () => {
    show({ 'en-US': 'T' }, null);
    q<HTMLButtonElement>('.close-btn')?.click();
    expect(closed).toBe(1);
  });

  it('closes on backdrop click but not inside the dialog', () => {
    show({ 'en-US': 'T' }, null);
    q<HTMLElement>('.action-modal-container')?.click();
    expect(closed).toBe(0);
    q<HTMLElement>('.action-modal-overlay')?.click();
    expect(closed).toBe(1);
  });

  it('closes on Escape keydown on the overlay and stops propagation to the document', () => {
    show({ 'en-US': 'T' }, null);
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true });
    const stop = spyOn(ev, 'stopPropagation').and.callThrough();
    q<HTMLElement>('.action-modal-overlay')?.dispatchEvent(ev);
    expect(stop).toHaveBeenCalled();
    expect(closed).toBe(1);
  });

  it('document Escape closes only while visible', () => {
    fixture.detectChanges();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(0);
    show({ 'en-US': 'T' }, null);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toBe(1);
  });
});
