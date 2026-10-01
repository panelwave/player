import { rulesFromManifest, type EntitlementSnapshot, type PanelWaveManifest } from 'player';

/** Tier for review mode when no rule names one (any-tier subscription rules). */
const ANY_TIER = 'review';

/**
 * What a review-link reader "owns": every product and a subscription tier
 * named in `paywall.rules`, so purchase and subscription gates open and the
 * reviewer sees the paid parts. The age is never verified — age gates are a
 * self-declaration and still ask the reviewer.
 *
 * Limitation: the snapshot holds ONE tier, the first one any rule names. Two
 * subscription rules with disjoint tier lists cannot both pass.
 */
export function reviewSnapshotFor(manifest: PanelWaveManifest): EntitlementSnapshot {
  const products = new Set<string>();
  let tier: string | null = null;
  let anyTier = false;

  for (const rule of rulesFromManifest(manifest)) {
    if (rule.entitlementType === 'purchase') {
      const ids = rule.requiredProductIds?.length
        ? rule.requiredProductIds
        : // "Any purchase" passes with one owned id; name it after the rule.
          [
            rule.entitlementKey && rule.entitlementKey !== 'purchase'
              ? rule.entitlementKey
              : rule.id,
          ];
      ids.forEach((id) => products.add(id));
    } else if (rule.entitlementType === 'subscription') {
      tier ??= rule.subscriptionTiers?.[0] ?? null;
      anyTier ||= !rule.subscriptionTiers?.length;
    }
  }

  return {
    subscriptionTier: tier ?? (anyTier ? ANY_TIER : null),
    purchasedProductIds: [...products],
    ageVerified: false,
  };
}
