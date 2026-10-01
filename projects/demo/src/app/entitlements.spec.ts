import { snapshotFromEntitlements } from './entitlements';

describe('snapshotFromEntitlements (CMS preview simulator tokens)', () => {
  it('returns undefined when nothing was given, so the shell keeps its own snapshot', () => {
    expect(snapshotFromEntitlements(undefined)).toBeUndefined();
    expect(snapshotFromEntitlements(null)).toBeUndefined();
    expect(snapshotFromEntitlements(42)).toBeUndefined();
  });

  it('maps "free" and unknown tokens to an empty snapshot', () => {
    expect(snapshotFromEntitlements(['free', 'whatever'])).toEqual({
      subscriptionTier: null,
      purchasedProductIds: [],
      ageVerified: false,
    });
  });

  it('maps a subscription tier', () => {
    expect(snapshotFromEntitlements(['free', 'premium'])?.subscriptionTier).toBe('premium');
    expect(snapshotFromEntitlements(['basic'])?.subscriptionTier).toBe('basic');
    // Several tiers: the highest one counts.
    expect(snapshotFromEntitlements(['basic', 'pro', 'premium'])?.subscriptionTier).toBe('pro');
  });

  it('collects purchased product ids', () => {
    expect(snapshotFromEntitlements(['purchased:prod-123', 'purchased:book-2', 'purchased:'])?.purchasedProductIds).toEqual([
      'prod-123',
      'book-2',
    ]);
  });

  it('maps age-verified to a verified adult', () => {
    const snapshot = snapshotFromEntitlements(['age-verified']);
    expect(snapshot?.ageVerified).toBeTrue();
    expect(snapshot?.age).toBeGreaterThanOrEqual(18);
  });

  it('accepts the comma-separated query syntax, trimming blanks', () => {
    expect(snapshotFromEntitlements('free, premium,purchased:p1 ,age-verified,')).toEqual({
      subscriptionTier: 'premium',
      purchasedProductIds: ['p1'],
      ageVerified: true,
      age: 99,
    });
  });

  it('ignores non-string array entries', () => {
    expect(snapshotFromEntitlements([1, 'premium', null])?.subscriptionTier).toBe('premium');
  });
});
