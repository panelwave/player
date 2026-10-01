import type { PanelWaveManifest } from 'player';
import { lockedAdapterFor } from './locked-adapter';

const manifest = {
  chapters: [
    {
      id: 'c1',
      panels: {
        free: { id: 'free' },
        paid: { id: 'paid', 'x-locked': true },
        stringy: { id: 'stringy', 'x-locked': 'true' },
        off: { id: 'off', 'x-locked': false },
      },
    },
    { id: 'c2', panels: { paid2: { id: 'paid2', 'x-locked': true } } },
  ],
} as unknown as PanelWaveManifest;

describe('lockedAdapterFor', () => {
  const adapter = lockedAdapterFor(manifest);

  it('denies exactly the x-locked: true panels', async () => {
    expect(await adapter.hasAccess('paid')).toBeFalse();
    expect(await adapter.hasAccess('paid2')).toBeFalse();
    expect(await adapter.hasAccess('free')).toBeTrue();
    expect(await adapter.hasAccess('stringy')).toBeTrue();
    expect(await adapter.hasAccess('off')).toBeTrue();
  });

  it('allows unknown ids', async () => {
    expect(await adapter.hasAccess('nope')).toBeTrue();
  });

  it('returns an anonymous context', async () => {
    expect(await adapter.getContext()).toEqual({ anonymous: true });
  });
});
