import {
  applyVariantOverrides,
  resolvePanelVariant,
  resolvePanels,
  selectVariant,
} from './variant-utils';
import type { Panel, Layer } from '../types/panel.types';

describe('variant-utils', () => {
  const baseLayer: Layer = { kind: 'image', id: 'ly-base', assetId: 'img-base', z: 0 };
  const altLayer: Layer = { kind: 'image', id: 'ly-alt', assetId: 'img-alt', z: 0 };

  const panel: Panel = {
    title: { 'en-US': 'Base' },
    durationMs: 3000,
    layers: [baseLayer],
    variants: [
      {
        id: 'var-left',
        when: { '==': [{ var: 'path.choice' }, 'left'] },
        overrides: { title: { 'en-US': 'Left' }, layers: [altLayer] },
      },
      {
        id: 'var-adult',
        when: { '>=': [{ var: 'user.age' }, 18] },
        overrides: { durationMs: 9000 },
      },
    ],
  };

  describe('selectVariant', () => {
    it('returns undefined without variants or matches', () => {
      expect(selectVariant({ layers: [] }, {})).toBeUndefined();
      expect(selectVariant(panel, {})).toBeUndefined();
      expect(selectVariant(panel, { path: { choice: 'right' } })).toBeUndefined();
      expect(selectVariant(null, {})).toBeUndefined();
    });

    it('returns the first matching variant in manifest order', () => {
      // Both conditions hold -> the earlier variant wins.
      const context = { path: { choice: 'left' }, user: { age: 21 } };
      expect(selectVariant(panel, context)?.id).toBe('var-left');
      expect(selectVariant(panel, { user: { age: 21 } })?.id).toBe('var-adult');
    });

    it('fails closed on malformed conditions', () => {
      const broken: Panel = {
        layers: [],
        variants: [{ id: 'v', when: { 'no-such-op': [1] }, overrides: {} }],
      };
      expect(selectVariant(broken, {})).toBeUndefined();
    });
  });

  describe('applyVariantOverrides', () => {
    it('replaces overridden fields wholesale and keeps the rest', () => {
      const result = applyVariantOverrides(panel, panel.variants![0]);
      expect(result.title).toEqual({ 'en-US': 'Left' });
      expect(result.layers).toEqual([altLayer]);
      expect(result.durationMs).toBe(3000);
      // Base panel untouched.
      expect(panel.title).toEqual({ 'en-US': 'Base' });
      expect(panel.layers).toEqual([baseLayer]);
    });

    it('ignores non-PanelPartial keys in overrides', () => {
      const result = applyVariantOverrides(panel, {
        id: 'v',
        when: true,
        overrides: {
          durationMs: 500,
          variants: [{ id: 'nested', when: true, overrides: {} }],
          unknown: 'x',
        } as never,
      });
      expect(result.durationMs).toBe(500);
      expect(result.variants).toBe(panel.variants);
      expect((result as Record<string, unknown>)['unknown']).toBeUndefined();
    });
  });

  describe('resolvePanelVariant', () => {
    it('returns the same panel reference when nothing applies', () => {
      expect(resolvePanelVariant(panel, {}).panel).toBe(panel);
      expect(resolvePanelVariant(panel, {}).variantId).toBeUndefined();
      const plain: Panel = { layers: [] };
      expect(resolvePanelVariant(plain, { any: true }).panel).toBe(plain);
    });

    it('applies the first matching variant', () => {
      const result = resolvePanelVariant(panel, { path: { choice: 'left' } });
      expect(result.variantId).toBe('var-left');
      expect(result.panel.layers).toEqual([altLayer]);
    });

    it('honors a forced variant id regardless of conditions', () => {
      const result = resolvePanelVariant(panel, {}, 'var-adult');
      expect(result.variantId).toBe('var-adult');
      expect(result.panel.durationMs).toBe(9000);
    });

    it('forces the base panel with forcedVariantId null', () => {
      const context = { path: { choice: 'left' } };
      const result = resolvePanelVariant(panel, context, null);
      expect(result.panel).toBe(panel);
      expect(result.variantId).toBeUndefined();
    });

    it('falls back to condition matching for unknown forced ids', () => {
      const result = resolvePanelVariant(panel, { user: { age: 30 } }, 'nope');
      expect(result.variantId).toBe('var-adult');
    });
  });

  describe('resolvePanels', () => {
    it('returns the input record when no panel changes', () => {
      const panels = { a: { layers: [] } as Panel, b: panel };
      expect(resolvePanels(panels, {})).toBe(panels);
    });

    it('resolves only the affected panels, keeping other identities', () => {
      const plain: Panel = { layers: [] };
      const panels = { a: plain, b: panel };
      const resolved = resolvePanels(panels, { user: { age: 40 } });
      expect(resolved).not.toBe(panels);
      expect(resolved['a']).toBe(plain);
      expect(resolved['b']).not.toBe(panel);
      expect(resolved['b'].durationMs).toBe(9000);
    });
  });
});
