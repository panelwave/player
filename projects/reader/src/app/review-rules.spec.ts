import { rulesFromManifest, type PanelWaveManifest } from 'player';
import { forReview } from './review-rules';

const manifestWith = (rules?: unknown[], extra: Record<string, unknown> = {}): PanelWaveManifest =>
  ({
    meta: { id: 'w' },
    chapters: [{ id: 'c', panels: { a: {} }, graph: { entry: 'a', edges: [] } }],
    ...(rules ? { paywall: { rules, ...extra } } : {}),
  }) as unknown as PanelWaveManifest;

describe('forReview', () => {
  it('drops rules without an age part (purchase, subscription, free)', () => {
    const out = forReview(
      manifestWith([
        { id: 'buy', scope: 'work', entitlementType: 'purchase', requiredProductIds: ['book'] },
        { id: 'sub', scope: 'chapter', refId: 'c', requireEntitlement: 'premium' },
        { id: 'free', scope: 'panel', refId: 'a', entitlementType: 'free' },
      ])
    );
    expect(out.paywall?.rules).toEqual([]);
    expect(rulesFromManifest(out)).toEqual([]);
  });

  it('keeps only the age part of a rule, with its target and preview', () => {
    const out = forReview(
      manifestWith([
        {
          id: 'adult-buy',
          scope: 'chapter',
          refId: 'c',
          entitlementType: 'purchase',
          requiredProductIds: ['book'],
          minimumAge: 16,
          previewPanelCount: 2,
          price: { amount: 3, currency: 'EUR' },
        },
        {
          id: 'old-age',
          scope: 'panel',
          refId: 'a',
          requireEntitlement: 'token',
          ageGate: 18,
          previewPanels: 1,
        },
        { id: 'pure', scope: 'work', entitlementType: 'age_gate' },
        {
          id: 'targets',
          scope: 'panel',
          targetPanelIds: ['a'],
          requireEntitlement: 'age_gate',
          minimumAge: 21,
        },
      ])
    );
    expect(out.paywall?.rules as unknown[]).toEqual([
      {
        id: 'adult-buy',
        scope: 'chapter',
        refId: 'c',
        previewPanelCount: 2,
        entitlementType: 'age_gate',
        minimumAge: 16,
      },
      {
        id: 'old-age',
        scope: 'panel',
        refId: 'a',
        previewPanels: 1,
        entitlementType: 'age_gate',
        minimumAge: 18,
      },
      { id: 'pure', scope: 'work', entitlementType: 'age_gate' },
      {
        id: 'targets',
        scope: 'panel',
        targetPanelIds: ['a'],
        entitlementType: 'age_gate',
        minimumAge: 21,
      },
    ]);
    expect(rulesFromManifest(out).map((r) => [r.id, r.entitlementType, r.minimumAge])).toEqual([
      ['adult-buy', 'age_gate', 16],
      ['old-age', 'age_gate', 18],
      ['pure', 'age_gate', undefined],
      ['targets', 'age_gate', 21],
    ]);
  });

  it('keeps the rest of the manifest and the paywall block, and does not mutate the input', () => {
    const input = manifestWith([{ id: 'buy', scope: 'work', entitlementType: 'purchase' }], {
      products: [{ id: 'book' }],
    });
    const out = forReview(input);
    expect(out.chapters).toBe(input.chapters);
    expect(out.paywall?.products).toEqual([{ id: 'book' }] as never);
    expect(input.paywall?.rules?.length).toBe(1);
  });

  it('leaves a manifest without a paywall alone', () => {
    const input = manifestWith();
    expect(forReview(input)).toBe(input);
  });
});
