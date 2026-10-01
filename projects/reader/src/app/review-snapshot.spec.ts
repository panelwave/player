import { rulesFromManifest, satisfiesRule, type PanelWaveManifest } from 'player';
import { reviewSnapshotFor } from './review-snapshot';

const manifestWith = (rules: unknown[]): PanelWaveManifest =>
  ({
    meta: { id: 'w' },
    chapters: [{ id: 'c', panels: { a: {} }, graph: { entry: 'a', edges: [] } }],
    paywall: { rules },
  }) as unknown as PanelWaveManifest;

describe('reviewSnapshotFor', () => {
  it('owns every product and a tier, so each purchase/subscription rule passes', () => {
    const manifest = manifestWith([
      {
        id: 'buy-1',
        scope: 'chapter',
        refId: 'c',
        entitlementType: 'purchase',
        requiredProductIds: ['book-1', 'bundle'],
      },
      {
        id: 'buy-2',
        scope: 'panel',
        refId: 'a',
        entitlementType: 'purchase',
        requiredProductIds: ['panel-a'],
      },
      { id: 'buy-any', scope: 'extras', refId: 'x', requireEntitlement: 'token' },
      {
        id: 'sub-gold',
        scope: 'work',
        entitlementType: 'subscription',
        subscriptionTiers: ['gold', 'platinum'],
      },
      { id: 'sub-any', scope: 'chapter', refId: 'c', requireEntitlement: 'premium' },
    ]);
    const snapshot = reviewSnapshotFor(manifest);

    expect(snapshot.purchasedProductIds).toEqual(
      jasmine.arrayContaining(['book-1', 'bundle', 'panel-a'])
    );
    expect(snapshot.subscriptionTier).toBe('gold');
    for (const rule of rulesFromManifest(manifest)) {
      expect(satisfiesRule(rule, snapshot)).withContext(rule.id).toBeTrue();
    }
  });

  it('never verifies the age: age gates still ask the reviewer', () => {
    const manifest = manifestWith([
      { id: 'adult', scope: 'panel', refId: 'a', minimumAge: 18 },
      {
        id: 'buy-adult',
        scope: 'work',
        entitlementType: 'purchase',
        requiredProductIds: ['p'],
        minimumAge: 16,
      },
    ]);
    const snapshot = reviewSnapshotFor(manifest);

    expect(snapshot.ageVerified).toBeFalse();
    expect(snapshot.age).toBeUndefined();
    const [adult, buyAdult] = rulesFromManifest(manifest);
    expect(satisfiesRule(adult, snapshot)).toBeFalse();
    expect(satisfiesRule(buyAdult, snapshot)).toBeFalse();
    // Only the age is missing: the purchase part of buy-adult is owned.
    expect(satisfiesRule({ ...buyAdult, minimumAge: undefined }, snapshot)).toBeTrue();
  });

  it('satisfies an any-tier subscription without naming a tier', () => {
    const snapshot = reviewSnapshotFor(
      manifestWith([{ id: 's', scope: 'work', entitlementType: 'subscription' }])
    );
    expect(snapshot.subscriptionTier).toBeTruthy();
  });

  it('owns nothing for a work without paywall rules', () => {
    const manifest = { meta: { id: 'w' }, chapters: [] } as unknown as PanelWaveManifest;
    expect(reviewSnapshotFor(manifest)).toEqual({
      subscriptionTier: null,
      purchasedProductIds: [],
      ageVerified: false,
    });
  });
});
