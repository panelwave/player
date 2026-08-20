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
});
