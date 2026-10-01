import { TestBed } from '@angular/core/testing';
import { PaywallService } from './paywall.service';
import type { PanelWaveManifest } from '../types/manifest.types';

/** A two-chapter work: p1..p3, gated after a 2-panel preview. */
const manifestWithGate = (over: Record<string, unknown> = {}): PanelWaveManifest =>
  ({
    meta: { id: 'work-1' },
    chapters: [
      { id: 'c1', panels: { p1: {}, p2: {} } },
      { id: 'c2', panels: { p3: {} } },
    ],
    paywall: {
      rules: [
        {
          id: 'gate',
          scope: 'work',
          entitlementType: 'purchase',
          requiredProductIds: ['book-1'],
          previewPanelCount: 2,
          ...over,
        },
      ],
    },
  }) as unknown as PanelWaveManifest;

const freeManifest = (): PanelWaveManifest =>
  ({
    meta: { id: 'work-free' },
    chapters: [{ id: 'c1', panels: { p1: {} } }],
  }) as unknown as PanelWaveManifest;

describe('PaywallService', () => {
  let service: PaywallService;

  beforeEach(() => {
    TestBed.configureTestingModule({});
    service = TestBed.inject(PaywallService);
  });

  it('treats a work without paywall rules as entirely free', () => {
    service.setManifest(freeManifest());
    expect(service.isFreeWork).toBe(true);
    expect(service.canAccess('p1')).toBe(true);
    expect(service.gateFor('p1')).toBeNull();
  });

  it('opens the preview panels and gates the rest for an anonymous reader', () => {
    service.setManifest(manifestWithGate());
    expect(service.canAccess('p1')).toBe(true);
    expect(service.canAccess('p2')).toBe(true);
    expect(service.canAccess('p3')).toBe(false);
  });

  it('opens everything once the reader owns the product', () => {
    service.setManifest(manifestWithGate());
    service.setSnapshot({
      subscriptionTier: null,
      purchasedProductIds: ['book-1'],
      ageVerified: false,
    });
    expect(service.canAccess('p3')).toBe(true);
    expect(service.gateFor('p3')).toBeNull();
  });

  it('builds a gate the overlay can render', () => {
    service.setManifest(manifestWithGate());
    const gate = service.gateFor('p3');
    expect(gate).not.toBeNull();
    expect(gate!.scope).toBe('work');
    expect(gate!.requireEntitlement).toBe('purchase');
    expect(gate!.reason).toContain('available to buy');
    expect(gate!.preview?.previewPanels).toBe(2);
  });

  it('keeps an unknown panel OUTSIDE the free preview', () => {
    // A panel the reading order does not know about must not be handed out as
    // a free sample just because its index defaults low.
    service.setManifest(manifestWithGate());
    expect(service.indexOf('ghost')).toBe(-1);
    expect(service.canAccess('ghost')).toBe(false);
  });

  it('numbers panels across chapters, not within them', () => {
    service.setManifest(manifestWithGate());
    expect(service.indexOf('p1')).toBe(0);
    expect(service.indexOf('p2')).toBe(1);
    // First panel of the SECOND chapter continues the count.
    expect(service.indexOf('p3')).toBe(2);
  });

  it('exposes the gating rule so a caller can read its price', () => {
    service.setManifest(manifestWithGate({ price: { amount: 4.99, currency: 'EUR' } }));
    const rule = service.ruleFor('p3');
    expect(rule?.id).toBe('gate');
    expect(service.ruleFor('p1')?.id).toBe('gate'); // preview still names the rule
  });

  it('applies a chapter rule to its chapter only, preview counted within it', () => {
    service.setManifest(
      manifestWithGate({ scope: 'chapter', refId: 'c2', previewPanelCount: 0, requiredProductIds: ['ch2'] }),
    );
    expect(service.canAccess('p1')).toBe(true);
    expect(service.canAccess('p2')).toBe(true);
    expect(service.canAccess('p3')).toBe(false);
    const gate = service.gateFor('p3');
    expect(gate?.scope).toBe('chapter');
    expect(gate?.refId).toBe('c2');

    // previewPanels: 1 frees the FIRST panel of chapter 2 (global index 2).
    service.setManifest(manifestWithGate({ scope: 'chapter', refId: 'c2', previewPanelCount: 1 }));
    expect(service.canAccess('p3')).toBe(true);
  });

  it('does not gate panels with an extras rule, but locks the extra', () => {
    service.setManifest(manifestWithGate({ scope: 'extras', refId: 'ex-1', previewPanelCount: 0 }));
    expect(service.canAccess('p3')).toBe(true);
    expect(service.isExtraLocked('ex-1')).toBe(true);
    service.setSnapshot({ subscriptionTier: null, purchasedProductIds: ['book-1'], ageVerified: false });
    expect(service.isExtraLocked('ex-1')).toBe(false);
  });

  it("offers the rule's products as purchase options on the gate", () => {
    service.setManifest(manifestWithGate({ name: 'Full book', price: { amount: 4.99, currency: 'EUR' } }));
    const gate = service.gateFor('p3');
    expect(gate?.ruleId).toBe('gate');
    expect(gate?.lockReason).toBe('purchase_required');
    expect(gate?.options).toEqual([
      { productId: 'book-1', name: 'Full book', description: undefined, price: { amount: 4.99, currency: 'EUR' }, type: 'one-time' },
    ]);
  });

  it('offers one Buy option per listed product (format 1.6) and unlocks on any of them', () => {
    service.setManifest(
      manifestWithGate({
        name: 'Finale',
        requireEntitlement: 'edition',
        requiredProductIds: ['edition', 'finale-single'],
        price: { amount: 2.99, currency: 'EUR' },
      }),
    );
    const options = service.gateFor('p3')?.options ?? [];
    // The manifest carries product ids only: with several products each
    // option is labelled by its id and shows the rule's display price.
    expect(options.map((o) => [o.productId, o.name, o.type])).toEqual([
      ['edition', 'edition', 'one-time'],
      ['finale-single', 'finale-single', 'one-time'],
    ]);
    expect(options.every((o) => o.price?.amount === 2.99)).toBe(true);

    service.setSnapshot({ subscriptionTier: null, purchasedProductIds: ['finale-single'], ageVerified: false });
    expect(service.canAccess('p3')).toBe(true);
    expect(service.gateFor('p3')).toBeNull();
  });

  it('labels options from paywall.products in the reader locale (format 1.6)', () => {
    const manifest = manifestWithGate({
      name: 'Finale',
      requiredProductIds: ['edition', 'finale-single', 'unlisted'],
      price: { amount: 2.99, currency: 'EUR' },
    }) as unknown as { meta: Record<string, unknown>; paywall: Record<string, unknown> };
    manifest.meta['default_locale'] = 'en-US';
    manifest.paywall['products'] = [
      {
        id: 'edition',
        name: { 'en-US': 'Premium edition', 'de-DE': 'Premium-Ausgabe' },
        description: { 'en-US': 'Everything', 'de-DE': 'Alles' },
        price: { amount: 4.99, currency: 'EUR' },
      },
      { id: 'finale-single', name: { 'en-US': 'Finale only' } },
      { id: 'edition', name: { 'en-US': 'Duplicate id (ignored)' } },
    ];
    service.setManifest(manifest as unknown as PanelWaveManifest);

    const de = service.gateFor('p3', 'de-DE')?.options ?? [];
    expect(de.map((o) => [o.productId, o.name, o.description, o.price?.amount])).toEqual([
      ['edition', 'Premium-Ausgabe', 'Alles', 4.99],
      // No German name: the work's default locale; no price: the rule's.
      ['finale-single', 'Finale only', undefined, 2.99],
      // No product entry: the bare id (several options) and the rule's price.
      ['unlisted', 'unlisted', undefined, 2.99],
    ]);
    expect(service.gateFor('p3')?.options?.[0].name).toBe('Premium edition');
  });

  it('keeps the rule name for a single option without a product entry', () => {
    service.setManifest(manifestWithGate({ name: 'Full book' }));
    expect(PaywallService.productsFromManifest(null).size).toBe(0);
    expect(service.gateFor('p3', 'de-DE')?.options?.map((o) => o.name)).toEqual(['Full book']);
  });

  it('labels subscription tiers from paywall.products too', () => {
    const manifest = manifestWithGate({
      entitlementType: 'subscription',
      subscriptionTiers: ['gold'],
      requiredProductIds: undefined,
    }) as unknown as { paywall: Record<string, unknown> };
    manifest.paywall['products'] = [
      { id: 'gold', name: { 'en-US': 'Gold membership' }, price: { amount: 9, currency: 'USD' }, type: 'subscription' },
    ];
    service.setManifest(manifest as unknown as PanelWaveManifest);
    expect(service.gateFor('p3', 'en-US')?.options).toEqual([
      { productId: 'gold', name: 'Gold membership', description: undefined, price: { amount: 9, currency: 'USD' }, type: 'subscription' },
    ]);
  });

  it('offers one subscribe option per tier, falling back to the entitlement key', () => {
    service.setManifest(manifestWithGate({ entitlementType: 'subscription', subscriptionTiers: ['silver', 'gold'] }));
    expect(service.gateFor('p3')?.options?.map((o) => [o.productId, o.name, o.type])).toEqual([
      ['silver', 'silver', 'subscription'],
      ['gold', 'gold', 'subscription'],
    ]);

    // Original format: requireEntitlement "premium" names the tier.
    service.setManifest(
      manifestWithGate({ entitlementType: undefined, requireEntitlement: 'premium', requiredProductIds: undefined }),
    );
    expect(service.gateFor('p3')?.options?.map((o) => o.productId)).toEqual(['premium']);
  });

  it('offers nothing to buy for an age gate', () => {
    service.setManifest(manifestWithGate({ entitlementType: 'age_gate', minimumAge: 18 }));
    expect(service.gateFor('p3')?.options).toEqual([]);
  });

  it('a purchase rule with an age raises the age gate first, then the paywall with Buy', () => {
    service.setManifest(manifestWithGate({ minimumAge: 18 }));
    expect(service.gateFor('p3')?.lockReason).toBe('age_verification_required');

    service.setSnapshot({ subscriptionTier: null, purchasedProductIds: [], ageVerified: true, age: 30 });
    const gate = service.gateFor('p3');
    expect(gate?.lockReason).toBe('purchase_required');
    expect(gate?.options?.map((o) => o.productId)).toEqual(['book-1']);

    service.setSnapshot({ subscriptionTier: null, purchasedProductIds: ['book-1'], ageVerified: true, age: 30 });
    expect(service.canAccess('p3')).toBe(true);
  });

  it('re-evaluates when the snapshot changes', () => {
    service.setManifest(manifestWithGate());
    expect(service.canAccess('p3')).toBe(false);
    service.setSnapshot({
      subscriptionTier: null,
      purchasedProductIds: ['book-1'],
      ageVerified: false,
    });
    expect(service.canAccess('p3')).toBe(true);
    service.setSnapshot(null); // sign-out
    expect(service.canAccess('p3')).toBe(false);
  });

  it('gates a subscription rule with the right wording', () => {
    service.setManifest(manifestWithGate({ entitlementType: 'subscription' }));
    expect(service.gateFor('p3')!.reason).toContain('subscription');
  });

  it('gates an age rule with the right wording', () => {
    service.setManifest(manifestWithGate({ entitlementType: 'age_gate', minimumAge: 18 }));
    expect(service.gateFor('p3')!.reason).toContain('age-restricted');
  });

  it('clear() returns it to a free, anonymous state', () => {
    service.setManifest(manifestWithGate());
    service.clear();
    expect(service.isFreeWork).toBe(true);
    expect(service.getSnapshot().purchasedProductIds).toEqual([]);
  });

  it('handles a null manifest without throwing', () => {
    service.setManifest(null);
    expect(service.isFreeWork).toBe(true);
    expect(service.canAccess('anything')).toBe(true);
  });

  describe('x-locked panels (server-stripped stubs)', () => {
    /** A public manifest: p2's content was stripped by the server. */
    const lockedManifest = (rules?: unknown[]): PanelWaveManifest =>
      ({
        meta: { id: 'work-locked' },
        chapters: [
          {
            id: 'c1',
            panels: { p1: {}, p2: { 'x-locked': true }, p3: { 'x-locked': 'true' } },
          },
        ],
        ...(rules ? { paywall: { rules } } : {}),
      }) as unknown as PanelWaveManifest;

    it('locks an x-locked panel even when no rule gates it', () => {
      service.setManifest(lockedManifest());
      expect(service.isFreeWork).toBe(false);
      expect(service.canAccess('p1')).toBe(true);
      expect(service.canAccess('p2')).toBe(false);
      const gate = service.gateFor('p2');
      expect(gate?.lockReason).toBe('purchase_required');
      expect(gate?.reason).toContain('available to buy');
    });

    it('only counts a boolean true as a lock', () => {
      service.setManifest(lockedManifest());
      expect(service.canAccess('p3')).toBe(true);
    });

    it('locks an x-locked panel inside the free preview, with the rule as the reason', () => {
      service.setManifest(
        lockedManifest([{ id: 'sub', scope: 'work', entitlementType: 'subscription', previewPanelCount: 5 }]),
      );
      const decision = service.evaluate('p2');
      expect(decision.locked).toBe(true);
      expect(decision.reason).toBe('subscription_required');
      expect(decision.appliedRuleId).toBe('sub');
      expect(decision.preview).toBe(false);
      expect(service.gateFor('p2')?.options?.map((o) => o.type)).toEqual(['subscription']);
    });

    it('stays locked when the snapshot satisfies the rule (the content is not there)', () => {
      service.setManifest(
        lockedManifest([{ id: 'buy', scope: 'panel', refId: 'p2', entitlementType: 'purchase', requiredProductIds: ['x'] }]),
      );
      service.setSnapshot({ subscriptionTier: null, purchasedProductIds: ['x'], ageVerified: false });
      expect(service.evaluate('p2')).toEqual(
        jasmine.objectContaining({ locked: true, reason: 'purchase_required', appliedRuleId: 'buy' }),
      );
    });

    it("keeps the rule's own lock reason (age first), then falls back to a purchase lock", () => {
      service.setManifest(lockedManifest([{ id: 'adult', scope: 'panel', refId: 'p2', minimumAge: 18 }]));
      expect(service.evaluate('p2').reason).toBe('age_verification_required');

      // Age confirmed: the age gate must not re-open forever on a stub.
      service.setSnapshot({ subscriptionTier: null, purchasedProductIds: [], ageVerified: true, age: 30 });
      expect(service.evaluate('p2')).toEqual(jasmine.objectContaining({ locked: true, reason: 'purchase_required' }));
    });

    it('clear() forgets the locked panels', () => {
      service.setManifest(lockedManifest());
      service.clear();
      expect(service.canAccess('p2')).toBe(true);
    });
  });
});
