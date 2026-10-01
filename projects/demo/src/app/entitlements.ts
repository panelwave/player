import type { EntitlementSnapshot } from 'player';

/** Subscription tiers the CMS preview offers, lowest first. */
const TIERS = ['basic', 'premium', 'pro'];

/** Age assumed for `age-verified`: the token carries no age, so it passes any minimum. */
const VERIFIED_AGE = 99;

/**
 * Map the CMS preview's entitlement simulator tokens onto the shell's
 * `entitlementSnapshot`, so creators can preview their own paid and
 * age-gated panels (the player renders them as placeholders otherwise).
 *
 * Tokens (the CMS embed config's `entitlements` array, or the demo's
 * `?entitlements=` query in the same comma-separated syntax):
 * - `basic` / `premium` / `pro` → that subscription tier (the highest wins);
 * - `purchased:<productId>` → owns that product;
 * - `age-verified` → a verified adult;
 * - `free` and anything else → nothing.
 *
 * Returns undefined when no entitlements were given: the shell then keeps
 * its own (anonymous) snapshot.
 */
export function snapshotFromEntitlements(input: unknown): EntitlementSnapshot | undefined {
  const tokens =
    typeof input === 'string'
      ? input.split(',')
      : Array.isArray(input)
        ? input.filter((t): t is string => typeof t === 'string')
        : null;
  if (!tokens) {
    return undefined;
  }

  const snapshot: EntitlementSnapshot = { subscriptionTier: null, purchasedProductIds: [], ageVerified: false };
  for (const token of tokens.map((t) => t.trim()).filter(Boolean)) {
    if (TIERS.includes(token)) {
      const current = snapshot.subscriptionTier ? TIERS.indexOf(snapshot.subscriptionTier) : -1;
      if (TIERS.indexOf(token) > current) {
        snapshot.subscriptionTier = token;
      }
    } else if (token.startsWith('purchased:')) {
      const productId = token.slice('purchased:'.length).trim();
      if (productId && !snapshot.purchasedProductIds.includes(productId)) {
        snapshot.purchasedProductIds.push(productId);
      }
    } else if (token === 'age-verified') {
      snapshot.ageVerified = true;
      snapshot.age = VERIFIED_AGE;
    }
  }
  return snapshot;
}
