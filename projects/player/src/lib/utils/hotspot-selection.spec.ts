/**
 * Unit tests for isHotspotSelected (utils/hotspot-selection)
 */

import type { Hotspot, HotspotAction } from '../types';
import { isHotspotSelected } from './hotspot-selection';

const hs = (action: HotspotAction): Hotspot => ({
  id: 'h',
  shape: { type: 'rect', x: 0, y: 0, w: 0.5, h: 0.5 },
  label: { 'en-US': 'H' },
  action,
});

describe('isHotspotSelected', () => {
  describe('setVariables', () => {
    it('set: selected while the variable holds the value', () => {
      const h = hs({ type: 'setVariables', mutations: [{ op: 'set', var: 'pick', value: 'tea' }] });
      expect(isHotspotSelected(h, { pick: 'tea' })).toBeTrue();
      expect(isHotspotSelected(h, { pick: 'coffee' })).toBeFalse();
      expect(isHotspotSelected(h, {})).toBeFalse();
      expect(isHotspotSelected(h, null)).toBeFalse();
    });

    it('set: compares arrays/objects by value and keeps strict primitive equality', () => {
      const arr = hs({ type: 'setVariables', mutations: [{ op: 'set', var: 'v', value: [1, 2] }] });
      expect(isHotspotSelected(arr, { v: [1, 2] })).toBeTrue();
      const num = hs({ type: 'setVariables', mutations: [{ op: 'set', var: 'v', value: 1 }] });
      expect(isHotspotSelected(num, { v: '1' })).toBeFalse();
      const f = hs({ type: 'setVariables', mutations: [{ op: 'set', var: 'v', value: false }] });
      expect(isHotspotSelected(f, { v: false })).toBeTrue();
    });

    it('all readable mutations must hold', () => {
      const h = hs({
        type: 'setVariables',
        mutations: [
          { op: 'set', var: 'a', value: 1 },
          { op: 'set', var: 'b', value: 2 },
        ],
      });
      expect(isHotspotSelected(h, { a: 1, b: 2 })).toBeTrue();
      expect(isHotspotSelected(h, { a: 1, b: 3 })).toBeFalse();
    });

    it('toggle: selected while the flag is on', () => {
      const h = hs({ type: 'setVariables', mutations: [{ op: 'toggle', var: 'lamp' }] });
      expect(isHotspotSelected(h, { lamp: true })).toBeTrue();
      expect(isHotspotSelected(h, { lamp: false })).toBeFalse();
    });

    it('append: selected while the list contains the value', () => {
      const h = hs({ type: 'setVariables', mutations: [{ op: 'append', var: 'bag', value: 'key' }] });
      expect(isHotspotSelected(h, { bag: ['map', 'key'] })).toBeTrue();
      expect(isHotspotSelected(h, { bag: ['map'] })).toBeFalse();
    });

    it('increment-only (repeatable) is never selected; mixed actions judge by the readable part', () => {
      const inc = hs({ type: 'setVariables', mutations: [{ op: 'increment', var: 'n', value: 1 }] });
      expect(isHotspotSelected(inc, { n: 5 })).toBeFalse();
      const mixed = hs({
        type: 'setVariables',
        mutations: [
          { op: 'increment', var: 'n', value: 1 },
          { op: 'set', var: 'met', value: true },
        ],
      });
      expect(isHotspotSelected(mixed, { n: 5, met: true })).toBeTrue();
    });
  });

  describe('goTo', () => {
    it('without mutations: selected when the chosen path led to its target', () => {
      const h = hs({ type: 'goTo', to: 'p9' });
      expect(isHotspotSelected(h, {}, 'p9')).toBeTrue();
      expect(isHotspotSelected(h, {}, 'p8')).toBeFalse();
      expect(isHotspotSelected(h, {}, null)).toBeFalse();
    });

    it('with readable mutations: the variables decide (two options may share a target)', () => {
      const h = hs({ type: 'goTo', to: 'p9', mutations: [{ op: 'set', var: 'tone', value: 'polite' }] });
      expect(isHotspotSelected(h, { tone: 'polite' }, 'p9')).toBeTrue();
      expect(isHotspotSelected(h, { tone: 'rude' }, 'p9')).toBeFalse();
    });
  });

  it('modal / extras / plugin hotspots are never selected', () => {
    expect(isHotspotSelected(hs({ type: 'openModal', title: { 'en-US': 't' }, content: { 'en-US': 'c' } }), {})).toBeFalse();
    expect(isHotspotSelected(hs({ type: 'openExtras', extrasId: 'x' }), {})).toBeFalse();
    expect(isHotspotSelected(hs({ type: 'pluginEvent', pluginId: 'p', event: 'e' }), {})).toBeFalse();
  });
});
