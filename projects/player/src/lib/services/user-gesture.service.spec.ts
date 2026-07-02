/**
 * User Gesture Service Tests
 */

import { TestBed } from '@angular/core/testing';
import { UserGestureService } from './user-gesture.service';

describe('UserGestureService', () => {
  let service: UserGestureService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(UserGestureService);
  });

  afterEach(() => {
    service.ngOnDestroy();
  });

  it('starts with no interaction', () => {
    expect(service.hasInteracted()).toBe(false);
  });

  it('registers a gesture from a document click', () => {
    document.dispatchEvent(new MouseEvent('pointerdown'));
    expect(service.hasInteracted()).toBe(true);
  });

  it('registers a gesture from a keydown', () => {
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    expect(service.hasInteracted()).toBe(true);
  });

  it('does NOT register a gesture from hover', () => {
    document.dispatchEvent(new MouseEvent('mouseover'));
    document.dispatchEvent(new MouseEvent('mouseenter'));
    expect(service.hasInteracted()).toBe(false);
  });

  it('markInteracted sets the flag explicitly', () => {
    service.markInteracted();
    expect(service.hasInteracted()).toBe(true);
  });

  it('emits true once via the observable', (done) => {
    const seen: boolean[] = [];
    service.userHasInteracted$.subscribe((v) => {
      seen.push(v);
      if (v) {
        expect(seen).toEqual([false, true]);
        done();
      }
    });
    service.markInteracted();
  });

  it('stops listening after the first gesture', () => {
    service.markInteracted();
    const spy = spyOn(service, 'markInteracted').and.callThrough();
    document.dispatchEvent(new MouseEvent('pointerdown'));
    // Listeners were detached, so no further calls from the global handler.
    expect(spy).not.toHaveBeenCalled();
  });
});
