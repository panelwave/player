import { ComponentFixture, TestBed } from '@angular/core/testing';

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
