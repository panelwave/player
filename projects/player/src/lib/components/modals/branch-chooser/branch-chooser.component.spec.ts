import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideTranslateService, TranslateService } from '@ngx-translate/core';

import { BranchChooserComponent, type BranchChoice } from './branch-chooser.component';

describe('BranchChooserComponent', () => {
  let fixture: ComponentFixture<BranchChooserComponent>;
  let component: BranchChooserComponent;

  const choices: BranchChoice[] = [
    { edge: { from: 'p1', to: 'p2' }, label: 'Follow the river', index: 0 },
    { edge: { from: 'p1', to: 'p3' }, label: 'Climb the ridge', index: 1 },
  ];

  beforeEach(async () => {
    await TestBed.configureTestingModule({ imports: [BranchChooserComponent] }).compileComponents();
    fixture = TestBed.createComponent(BranchChooserComponent);
    component = fixture.componentInstance;
    component.visible = true;
    component.choices = choices;
    fixture.detectChanges();
  });

  it('renders one numbered option per choice', () => {
    const options = fixture.nativeElement.querySelectorAll('.branch-chooser-option') as NodeListOf<HTMLElement>;
    expect(options.length).toBe(2);
    expect(options[0].textContent).toContain('1');
    expect(options[0].textContent).toContain('Follow the river');
    expect(options[1].textContent).toContain('Climb the ridge');
  });

  it('emits the chosen branch', () => {
    const chosen: BranchChoice[] = [];
    component.choose.subscribe((c) => chosen.push(c));
    const options = fixture.nativeElement.querySelectorAll('.branch-chooser-option') as NodeListOf<HTMLElement>;
    options[1].click();
    expect(chosen).toEqual([choices[1]]);
  });

  it('closes on backdrop click but not on clicks inside the dialog', () => {
    let closed = 0;
    component.close.subscribe(() => closed++);
    const overlay = fixture.nativeElement.querySelector('.branch-chooser-overlay') as HTMLElement;
    const container = fixture.nativeElement.querySelector('.branch-chooser-container') as HTMLElement;
    container.click();
    expect(closed).toBe(0);
    overlay.click();
    expect(closed).toBe(1);
  });

  it('closes on Escape while visible', () => {
    let closed = 0;
    component.close.subscribe(() => closed++);
    component.onEscape();
    expect(closed).toBe(1);
    component.visible = false;
    component.onEscape();
    expect(closed).toBe(1);
  });

  it('renders nothing while hidden', () => {
    // OnPush: go through the component ref so the input change marks it dirty.
    fixture.componentRef.setInput('visible', false);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.branch-chooser-overlay')).toBeNull();
  });
});

describe('BranchChooserComponent (labels)', () => {
  it('falls back to a numbered "Option N" in English without ngx-translate', async () => {
    await TestBed.configureTestingModule({ imports: [BranchChooserComponent] }).compileComponents();
    const fixture = TestBed.createComponent(BranchChooserComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('choices', [{ edge: { from: 'p1', to: 'p2' }, label: '', index: 1 }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.branch-chooser-label')?.textContent).toBe('Option 2');
    expect(el.querySelector('.branch-chooser-title')?.textContent).toBe('Choose your path');
  });

  it('translates title, close and the fallback label', async () => {
    await TestBed.configureTestingModule({ imports: [BranchChooserComponent], providers: [provideTranslateService()] }).compileComponents();
    const translate = TestBed.inject(TranslateService);
    translate.setTranslation('de', { branch_chooser: {"title": "Wähle deinen Weg", "close": "Schließen", "option": "Option {{n}}"} });
    translate.use('de');
    const fixture = TestBed.createComponent(BranchChooserComponent);
    fixture.componentRef.setInput('visible', true);
    fixture.componentRef.setInput('choices', [{ edge: { from: 'p1', to: 'p2' }, label: '', index: 0 }]);
    fixture.detectChanges();
    const el = fixture.nativeElement as HTMLElement;
    expect(el.querySelector('.branch-chooser-title')?.textContent).toBe('Wähle deinen Weg');
    expect(el.querySelector('.close-btn')?.getAttribute('aria-label')).toBe('Schließen');
    expect(el.querySelector('.branch-chooser-label')?.textContent).toBe('Option 1');
  });
});
