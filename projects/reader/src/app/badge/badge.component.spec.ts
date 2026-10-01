import { ComponentFixture, TestBed, fakeAsync, tick, discardPeriodicTasks } from '@angular/core/testing';
import { BadgeComponent } from './badge.component';

describe('BadgeComponent', () => {
  let fixture: ComponentFixture<BadgeComponent>;
  const link = () => fixture.nativeElement.querySelector('a.pw-badge') as HTMLAnchorElement;
  const hidden = () => link().classList.contains('pw-badge--hidden');


  it('links to panelwave.org with utm params and is visible initially', fakeAsync(() => {
    fixture = TestBed.createComponent(BadgeComponent);
    fixture.detectChanges();
    expect(link().textContent).toContain('Made with PanelWave');
    expect(link().getAttribute('href')).toBe('https://panelwave.org/?utm_source=reader&utm_medium=badge');
    expect(link().target).toBe('_blank');
    expect(link().rel).toContain('noopener');
    expect(hidden()).toBeFalse();
    fixture.destroy();
  }));

  it('hides after 3 s idle and returns on pointermove', fakeAsync(() => {
    fixture = TestBed.createComponent(BadgeComponent);
    fixture.detectChanges();
    tick(2999);
    fixture.detectChanges();
    expect(hidden()).toBeFalse();
    tick(1);
    fixture.detectChanges();
    expect(hidden()).toBeTrue();

    document.dispatchEvent(new Event('pointermove'));
    fixture.detectChanges();
    expect(hidden()).toBeFalse();
    fixture.destroy();
  }));

  it('also reacts to keydown and pointerdown', fakeAsync(() => {
    fixture = TestBed.createComponent(BadgeComponent);
    fixture.detectChanges();
    for (const type of ['keydown', 'pointerdown']) {
      tick(3000);
      fixture.detectChanges();
      expect(hidden()).toBeTrue();
      document.dispatchEvent(new Event(type));
      fixture.detectChanges();
      expect(hidden()).toBeFalse();
    }
    fixture.destroy();
  }));

  it('stops listening after destroy', fakeAsync(() => {
    fixture = TestBed.createComponent(BadgeComponent);
    fixture.detectChanges();
    fixture.destroy();
    document.dispatchEvent(new Event('pointermove'));
    discardPeriodicTasks();
  }));
});
