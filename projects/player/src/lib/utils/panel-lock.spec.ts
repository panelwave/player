import { isLockedPanel } from './panel-lock';
import type { Panel } from '../types';

describe('isLockedPanel', () => {
  it('is true only for a strict boolean true', () => {
    expect(isLockedPanel({ 'x-locked': true } as Panel)).toBeTrue();
  });

  it('is false for "true" strings, false, missing and nullish values', () => {
    expect(isLockedPanel({ 'x-locked': 'true' } as unknown as Panel)).toBeFalse();
    expect(isLockedPanel({ 'x-locked': 1 } as unknown as Panel)).toBeFalse();
    expect(isLockedPanel({ 'x-locked': false } as Panel)).toBeFalse();
    expect(isLockedPanel({ layers: [] } as Panel)).toBeFalse();
    expect(isLockedPanel(null)).toBeFalse();
    expect(isLockedPanel(undefined)).toBeFalse();
  });
});
