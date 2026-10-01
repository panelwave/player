import { ComponentFixture, TestBed, fakeAsync, tick, flush } from '@angular/core/testing';
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

  it('sits top-left so it never covers the bottom toolbar or its toggle', fakeAsync(() => {
    fixture = TestBed.createComponent(BadgeComponent);
    fixture.detectChanges();
    const style = getComputedStyle(link());
    expect(style.position).toBe('fixed');
    expect(style.top).toBe('12px');
    expect(style.left).toBe('12px');
    // the toolbar is anchored to the bottom edge, so the badge must stay in the top half
    expect(link().getBoundingClientRect().bottom).toBeLessThan(window.innerHeight / 2);
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
    expect(getComputedStyle(link()).pointerEvents).toBe('none');
    expect(getComputedStyle(link()).opacity).toBe('0');

    document.dispatchEvent(new Event('pointermove'));
    fixture.detectChanges();
    expect(hidden()).toBeFalse();
    expect(getComputedStyle(link()).pointerEvents).not.toBe('none');
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

  it('stops listening and clears its timer after destroy', fakeAsync(() => {
    const removed: string[] = [];
    const orig = document.removeEventListener.bind(document);
    spyOn(document, 'removeEventListener').and.callFake((type: string, ...rest: unknown[]) => {
      removed.push(type);
      return (orig as (...a: unknown[]) => void)(type, ...rest);
    });
    fixture = TestBed.createComponent(BadgeComponent);
    fixture.detectChanges();
    fixture.destroy();
    expect(removed).toEqual(jasmine.arrayContaining(['pointermove', 'pointerdown', 'keydown']));
    document.dispatchEvent(new Event('pointermove'));
    // no timer left running: nothing pending to flush
    expect(() => flush()).not.toThrow();
  }));
});
