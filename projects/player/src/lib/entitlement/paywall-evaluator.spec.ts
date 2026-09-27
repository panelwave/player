import {
  ANONYMOUS_READER,
  evaluatePanelAccess,
  evaluateWorkAccess,
  chapterOrderFromManifest,
  findWorkGateRule,
  fromManifestRule,
  isExtraLocked,
  readingOrderFromManifest,
  rulesFromManifest,
  satisfiesRule,
  toEntitlementStatus,
  type EntitlementSnapshot,
  type EvaluatorRule,
} from './paywall-evaluator';
import type { PanelWaveManifest, PaywallRule } from '../types/manifest.types';

const rule = (over: Partial<EvaluatorRule> = {}): EvaluatorRule => ({
  id: 'r1',
  scope: 'work',
  entitlementType: 'purchase',
  isActive: true,
  ...over,
});

const reader = (over: Partial<EntitlementSnapshot> = {}): EntitlementSnapshot => ({
  subscriptionTier: null,
  purchasedProductIds: [],
  ageVerified: false,
  ...over,
});

describe('paywall-evaluator', () => {
  describe('satisfiesRule', () => {
    it('lets a free rule through for anyone', () => {
      expect(satisfiesRule(rule({ entitlementType: 'free' }), ANONYMOUS_READER)).toBe(true);
    });

    it('accepts any tier when a subscription rule names none', () => {
      const r = rule({ entitlementType: 'subscription' });
      expect(satisfiesRule(r, reader({ subscriptionTier: 'basic' }))).toBe(true);
      expect(satisfiesRule(r, ANONYMOUS_READER)).toBe(false);
    });

    it('restricts to the named tiers when a subscription rule lists them', () => {
      const r = rule({ entitlementType: 'subscription', subscriptionTiers: ['premium'] });
      expect(satisfiesRule(r, reader({ subscriptionTier: 'premium' }))).toBe(true);
      expect(satisfiesRule(r, reader({ subscriptionTier: 'basic' }))).toBe(false);
    });

    it('accepts any purchase when a purchase rule names no product', () => {
      const r = rule({ entitlementType: 'purchase' });
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['anything'] }))).toBe(true);
      expect(satisfiesRule(r, ANONYMOUS_READER)).toBe(false);
    });

    it('requires one of the named products when a purchase rule lists them', () => {
      const r = rule({ entitlementType: 'purchase', requiredProductIds: ['book-1'] });
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['book-1'] }))).toBe(true);
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['book-2'] }))).toBe(false);
    });

    it('needs both a verified age AND a high enough one', () => {
      const r = rule({ entitlementType: 'age_gate', minimumAge: 18 });
      expect(satisfiesRule(r, reader({ age: 21, ageVerified: true }))).toBe(true);
      // Old enough but unverified: a self-declared age is not a verification.
      expect(satisfiesRule(r, reader({ age: 21, ageVerified: false }))).toBe(false);
      expect(satisfiesRule(r, reader({ age: 16, ageVerified: true }))).toBe(false);
    });

    it('defaults an age gate to 18 when the rule names no age', () => {
      const r = rule({ entitlementType: 'age_gate' });
      expect(satisfiesRule(r, reader({ age: 17, ageVerified: true }))).toBe(false);
      expect(satisfiesRule(r, reader({ age: 18, ageVerified: true }))).toBe(true);
    });
  });

  describe('age on top of an entitlement (schema ageGate)', () => {
    const adult = { ageVerified: true, age: 30 };
    const minor = { ageVerified: true, age: 15 };

    it('a purchase rule with an age needs both', () => {
      const r = rule({ requiredProductIds: ['book'], minimumAge: 18 });
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['book'], ...adult }))).toBe(true);
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['book'] }))).toBe(false);
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['book'], ...minor }))).toBe(false);
      expect(satisfiesRule(r, reader(adult))).toBe(false);
    });

    it('a subscription rule with an age needs both', () => {
      const r = rule({ entitlementType: 'subscription', minimumAge: 16 });
      expect(satisfiesRule(r, reader({ subscriptionTier: 'gold', ...adult }))).toBe(true);
      expect(satisfiesRule(r, reader({ subscriptionTier: 'gold' }))).toBe(false);
      expect(satisfiesRule(r, reader(adult))).toBe(false);
    });

    it('asks for the age first, then the entitlement', () => {
      const rules = [rule({ scope: 'panel', targetPanelIds: ['p'], requiredProductIds: ['book'], minimumAge: 18 })];
      const at = (who: EntitlementSnapshot) => evaluatePanelAccess(rules, who, { id: 'p', index: 0 });
      expect(at(ANONYMOUS_READER).reason).toBe('age_verification_required');
      expect(at(reader({ purchasedProductIds: ['book'] })).reason).toBe('age_verification_required');
      expect(at(reader(minor)).reason).toBe('age_verification_required');
      expect(at(reader(adult)).reason).toBe('purchase_required');
      expect(at(reader({ purchasedProductIds: ['book'], ...adult })).locked).toBe(false);
    });

    it('applies to work-gate previews the same way', () => {
      const rules = [rule({ entitlementType: 'subscription', minimumAge: 18, previewPanelCount: 1 })];
      expect(evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'a', index: 0 }).locked).toBe(false);
      expect(evaluatePanelAccess(rules, reader(adult), { id: 'b', index: 1 }).reason).toBe('subscription_required');
    });

    it('treats "global" as an alias of "work"', () => {
      const rules = [rule({ scope: 'global' })];
      expect(evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'p', index: 0 }).locked).toBe(true);
    });
  });

  describe('evaluatePanelAccess', () => {
    it('leaves a work with no rules entirely open', () => {
      const d = evaluatePanelAccess([], ANONYMOUS_READER, { id: 'p1', index: 0 });
      expect(d.locked).toBe(false);
      expect(d.appliedRuleId).toBeNull();
    });

    it('ignores inactive rules', () => {
      const rules = [rule({ isActive: false })];
      expect(evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'p1', index: 9 }).locked).toBe(false);
    });

    it('gives away the first N panels as the free preview', () => {
      const rules = [rule({ previewPanelCount: 3 })];
      expect(evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'p1', index: 0 }).locked).toBe(false);
      expect(evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'p3', index: 2 }).preview).toBe(true);
      // Panel 4 is the first one behind the gate.
      const gated = evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'p4', index: 3 });
      expect(gated.locked).toBe(true);
      expect(gated.reason).toBe('purchase_required');
    });

    it('unlocks past the preview once the reader satisfies the rule', () => {
      const rules = [rule({ previewPanelCount: 3, requiredProductIds: ['book-1'] })];
      const buyer = reader({ purchasedProductIds: ['book-1'] });
      const d = evaluatePanelAccess(rules, buyer, { id: 'p9', index: 8 });
      expect(d.locked).toBe(false);
      expect(d.preview).toBe(false);
    });

    it('does NOT let the preview override an explicit panel gate', () => {
      // The panel is inside the preview window AND explicitly gated.
      const rules = [
        rule({ id: 'work', previewPanelCount: 10 }),
        rule({ id: 'panel', scope: 'panel', targetPanelIds: ['p2'] }),
      ];
      const d = evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'p2', index: 1 });
      expect(d.locked).toBe(true);
      expect(d.appliedRuleId).toBe('panel');
      expect(d.preview).toBe(false);
    });

    it('reports the reason that matches the gating rule', () => {
      const subs = [rule({ entitlementType: 'subscription' })];
      expect(evaluatePanelAccess(subs, ANONYMOUS_READER, { id: 'p', index: 0 }).reason).toBe(
        'subscription_required',
      );
      const age = [rule({ entitlementType: 'age_gate' })];
      expect(evaluatePanelAccess(age, ANONYMOUS_READER, { id: 'p', index: 0 }).reason).toBe(
        'age_verification_required',
      );
    });

    it('gates only the panels of a chapter-scoped rule, preview counted within the chapter', () => {
      const rules = [rule({ id: 'ch', scope: 'chapter', targetIds: ['c2'], previewPanelCount: 2 })];
      // A panel of another chapter is free, whatever its global index.
      expect(
        evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'x', index: 50, chapterId: 'c1', chapterIndex: 7 }).locked,
      ).toBe(false);
      // Chapter 2: the first two panels are the preview even though their
      // global index is far past 2.
      const free = evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'a', index: 10, chapterId: 'c2', chapterIndex: 1 });
      expect(free.locked).toBe(false);
      expect(free.preview).toBe(true);
      const gated = evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'b', index: 11, chapterId: 'c2', chapterIndex: 2 });
      expect(gated.locked).toBe(true);
      expect(gated.appliedRuleId).toBe('ch');
    });

    it('lets a chapter rule win over the work rule for its panels', () => {
      const rules = [
        rule({ id: 'work', previewPanelCount: 100 }),
        rule({ id: 'ch', scope: 'chapter', targetIds: ['c2'] }),
      ];
      const d = evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'b', index: 3, chapterId: 'c2', chapterIndex: 0 });
      expect(d.locked).toBe(true);
      expect(d.appliedRuleId).toBe('ch');
    });

    it('never gates panels with an extras-scoped rule', () => {
      const rules = [rule({ scope: 'extras', targetIds: ['ex-1'] })];
      const d = evaluatePanelAccess(rules, ANONYMOUS_READER, { id: 'p', index: 9, chapterId: 'c1', chapterIndex: 9 });
      expect(d.locked).toBe(false);
      expect(d.appliedRuleId).toBeNull();
    });

    it('isExtraLocked follows extras-scoped rules and the snapshot', () => {
      const rules = [rule({ scope: 'extras', targetIds: ['ex-1'], requiredProductIds: ['bonus'] })];
      expect(isExtraLocked(rules, ANONYMOUS_READER, 'ex-1')).toBe(true);
      expect(isExtraLocked(rules, ANONYMOUS_READER, 'ex-2')).toBe(false);
      expect(isExtraLocked(rules, reader({ purchasedProductIds: ['bonus'] }), 'ex-1')).toBe(false);
    });

    it('lets the first work/global rule win', () => {
      const rules = [rule({ id: 'a', scope: 'global' }), rule({ id: 'b', scope: 'work' })];
      expect(findWorkGateRule(rules)?.id).toBe('a');
    });
  });

  it('evaluateWorkAccess maps every panel in order', () => {
    const rules = [rule({ previewPanelCount: 1 })];
    const decisions = evaluateWorkAccess(rules, ANONYMOUS_READER, [
      { id: 'p1', index: 0 },
      { id: 'p2', index: 1 },
    ]);
    expect(decisions.map((d) => d.locked)).toEqual([false, true]);
  });

  describe('manifest bridge', () => {
    it('reads the CMS field names', () => {
      const r = fromManifestRule(
        {
          id: 'rule-a',
          scope: 'work',
          entitlementType: 'subscription',
          subscriptionTiers: ['premium'],
          previewPanelCount: 5,
        } as PaywallRule,
        0,
      );
      expect(r.entitlementType).toBe('subscription');
      expect(r.previewPanelCount).toBe(5);
      expect(r.subscriptionTiers).toEqual(['premium']);
      // Manifests only ever carry rules the CMS already filtered to active.
      expect(r.isActive).toBe(true);
    });

    it('reads the original format field names too', () => {
      const r = fromManifestRule(
        { scope: 'work', requireEntitlement: 'premium', previewPanels: 4 } as PaywallRule,
        0,
      );
      // 'premium' is the original format's subscription marker.
      expect(r.entitlementType).toBe('subscription');
      expect(r.previewPanelCount).toBe(4);
    });

    it('reads a format 1.6 product list: owning any listed product unlocks', () => {
      // What the CMS exports: requireEntitlement = first product for pre-1.6
      // players, requiredProductIds = every unlocking product.
      const r = fromManifestRule(
        {
          id: 'ch8',
          scope: 'work',
          requireEntitlement: 'edition',
          entitlementType: 'purchase',
          requiredProductIds: ['edition', 'ch8-single'],
        } as PaywallRule,
        0,
      );
      expect(r.entitlementType).toBe('purchase');
      expect(r.requiredProductIds).toEqual(['edition', 'ch8-single']);
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['ch8-single'] }))).toBe(true);
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['edition'] }))).toBe(true);
      expect(satisfiesRule(r, reader({ purchasedProductIds: ['other-book'] }))).toBe(false);
    });

    it('treats an unknown entitlement marker as a purchase gate', () => {
      const r = fromManifestRule({ scope: 'work', requireEntitlement: 'token' } as PaywallRule, 0);
      expect(r.entitlementType).toBe('purchase');
    });

    it('keeps a custom marker plus an age a purchase gate (age on top)', () => {
      const r = fromManifestRule({ scope: 'work', requireEntitlement: 'token', ageGate: 18 } as PaywallRule, 0);
      expect(r.entitlementType).toBe('purchase');
      expect(r.minimumAge).toBe(18);
      expect(satisfiesRule(r, reader({ ageVerified: true, age: 30 }))).toBe(false);
    });

    it('keeps "premium" plus an age a subscription gate', () => {
      const r = fromManifestRule({ scope: 'work', requireEntitlement: 'premium', ageGate: 16 } as PaywallRule, 0);
      expect(r.entitlementType).toBe('subscription');
      expect(r.minimumAge).toBe(16);
    });

    it('keeps a known CMS type plus minimumAge', () => {
      const r = fromManifestRule(
        { scope: 'work', requireEntitlement: 'purchase', entitlementType: 'purchase', minimumAge: 18 } as PaywallRule,
        0,
      );
      expect(r.entitlementType).toBe('purchase');
      expect(r.minimumAge).toBe(18);
    });

    it('treats a rule that names an age as an age gate', () => {
      const r = fromManifestRule({ scope: 'work', ageGate: 16 } as PaywallRule, 0);
      expect(r.entitlementType).toBe('age_gate');
      expect(r.minimumAge).toBe(16);
    });

    it('turns a panel rule with only refId into a target list', () => {
      const r = fromManifestRule(
        { scope: 'panel', refId: 'p7', requireEntitlement: 'premium' } as PaywallRule,
        0,
      );
      expect(r.targetPanelIds).toEqual(['p7']);
    });

    it('keeps the extras scope (it gates the extras block, not the work)', () => {
      const r = fromManifestRule(
        { scope: 'extras', refId: 'ex-1', requireEntitlement: 'premium' } as PaywallRule,
        0,
      );
      expect(r.scope).toBe('extras');
      expect(r.targetIds).toEqual(['ex-1']);
      expect(findWorkGateRule([r])).toBeNull();
    });

    it('turns a chapter rule refId into its target chapter and keeps display fields', () => {
      const r = fromManifestRule(
        {
          scope: 'chapter',
          refId: 'c2',
          requireEntitlement: 'premium',
          previewPanels: 3,
          name: 'Chapter 2',
          price: { amount: 2, currency: 'EUR' },
        } as PaywallRule,
        0,
      );
      expect(r.targetIds).toEqual(['c2']);
      expect(r.previewPanelCount).toBe(3);
      expect(r.name).toBe('Chapter 2');
      expect(r.price).toEqual({ amount: 2, currency: 'EUR' });
      expect(r.entitlementKey).toBe('premium');
    });

    it('gives a rule without an id a stable synthetic one', () => {
      expect(fromManifestRule({ scope: 'work' } as PaywallRule, 2).id).toBe('rule-2');
    });

    it('returns no rules for a manifest without a paywall', () => {
      expect(rulesFromManifest(null)).toEqual([]);
      expect(rulesFromManifest({ chapters: [] } as unknown as PanelWaveManifest)).toEqual([]);
    });
  });

  it('chapterOrderFromManifest numbers panels within each chapter', () => {
    const order = chapterOrderFromManifest({
      chapters: [
        { id: 'c1', panels: { a: {}, b: {} } },
        { id: 'c2', panels: { c: {} } },
      ],
    } as unknown as PanelWaveManifest);
    expect(order.get('b')).toEqual({ chapterId: 'c1', chapterIndex: 1 });
    expect(order.get('c')).toEqual({ chapterId: 'c2', chapterIndex: 0 });
  });

  describe('readingOrderFromManifest', () => {
    it('walks chapters in order, then panels in declaration order', () => {
      const manifest = {
        chapters: [
          { id: 'c1', panels: { p1: {}, p2: {} } },
          { id: 'c2', panels: { p3: {} } },
        ],
      } as unknown as PanelWaveManifest;
      expect(readingOrderFromManifest(manifest)).toEqual(['p1', 'p2', 'p3']);
    });

    it('survives a chapter with no panels', () => {
      const manifest = {
        chapters: [{ id: 'c1' }, { id: 'c2', panels: { p1: {} } }],
      } as unknown as PanelWaveManifest;
      expect(readingOrderFromManifest(manifest)).toEqual(['p1']);
    });
  });

  it('toEntitlementStatus maps onto the adapter contract', () => {
    const locked = evaluatePanelAccess([rule()], ANONYMOUS_READER, { id: 'p', index: 0 });
    const status = toEntitlementStatus(locked, ANONYMOUS_READER);
    expect(status.ok).toBe(false);
    expect(status.reason).toBe('purchase_required');
    expect(status.entitlements['purchased']).toBe(false);

    const open = evaluatePanelAccess([], ANONYMOUS_READER, { id: 'p', index: 0 });
    expect(toEntitlementStatus(open, ANONYMOUS_READER).reason).toBeUndefined();
  });
});
