import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable, Subject } from 'rxjs';

import type { LocaleCode, PanelWaveManifest, PaywallProduct } from '../types/manifest.types';
import type { PaywallGate, PurchaseInfo } from '../types/entitlement.types';
import {
  ANONYMOUS_READER,
  chapterOrderFromManifest,
  evaluatePanelAccess,
  isExtraLocked,
  readingOrderFromManifest,
  rulesFromManifest,
  type AccessDecision,
  type EntitlementSnapshot,
  type EvaluatorRule,
  type LockReason,
} from '../entitlement/paywall-evaluator';
import { resolveLocalizedString } from '../utils/locale-utils';
import { isLockedPanel } from '../utils/panel-lock';

/**
 * Paywall service — decides whether the reader may see a panel, and describes
 * the gate when they may not.
 *
 * Before this existed the player had all the paywall parts and no wiring:
 * `PlayerStateService.showPaywallGate()` was never called, the overlay was
 * never rendered, and the manifest's `paywall.rules` were never read. Reaching
 * gated content simply threw a navigation error.
 *
 * Deliberately synchronous. Rules come from the manifest the reader already
 * downloaded and the snapshot is fetched once, so a panel turn never waits on
 * the network — which is what makes gating usable at reading speed.
 */
@Injectable({ providedIn: 'root' })
export class PaywallService {
  private rules: EvaluatorRule[] = [];
  private readingOrder = new Map<string, number>();
  private chapterOrder = new Map<string, { chapterId: string; chapterIndex: number }>();
  private manifest: PanelWaveManifest | null = null;
  private products = new Map<string, PaywallProduct>();
  /** Panels the server stripped for this reader (`"x-locked": true`). */
  private lockedPanels = new Set<string>();

  /** Decisions per panel for the current rules + snapshot (cleared on change). */
  private decisions = new Map<string, AccessDecision>();
  /** False while a host entitlement adapter decides access (see setEnforced). */
  private enforced = true;

  private snapshotSubject = new BehaviorSubject<EntitlementSnapshot>(ANONYMOUS_READER);
  readonly snapshot$: Observable<EntitlementSnapshot> = this.snapshotSubject.asObservable();

  private changesSubject = new Subject<void>();
  /**
   * Fires whenever a lock can flip: new manifest, new snapshot, enforcement
   * change or clear(). Renderers re-check `isPanelLocked` on it.
   */
  readonly changes$: Observable<void> = this.changesSubject.asObservable();

  /** Load the rules and reading order from a manifest. Safe to call repeatedly. */
  setManifest(manifest: PanelWaveManifest | null): void {
    this.manifest = manifest;
    this.rules = rulesFromManifest(manifest);
    this.readingOrder = new Map(
      readingOrderFromManifest(manifest).map((panelId, index) => [panelId, index]),
    );
    this.chapterOrder = chapterOrderFromManifest(manifest);
    this.products = PaywallService.productsFromManifest(manifest);
    this.lockedPanels = new Set(
      (manifest?.chapters ?? []).flatMap((chapter) =>
        Object.entries(chapter.panels ?? {})
          .filter(([, panel]) => isLockedPanel(panel))
          .map(([panelId]) => panelId),
      ),
    );
    this.changed();
  }

  /** `paywall.products` by id (format 1.6); the first entry wins on duplicate ids. */
  static productsFromManifest(manifest: PanelWaveManifest | null): Map<string, PaywallProduct> {
    const out = new Map<string, PaywallProduct>();
    for (const product of manifest?.paywall?.products ?? []) {
      if (product?.id && !out.has(product.id)) out.set(product.id, product);
    }
    return out;
  }

  /** Replace what the reader owns (after sign-in, or a completed purchase). */
  setSnapshot(snapshot: EntitlementSnapshot | null | undefined): void {
    this.decisions.clear();
    this.snapshotSubject.next(snapshot ?? ANONYMOUS_READER);
    this.changesSubject.next();
  }

  /**
   * Whether the rules are this service's to enforce. The shell turns it off
   * while a host `entitlementAdapter` decides access (the adapter wins over
   * manifest rules): the rules then still describe gates, but renderers no
   * longer lock panels by them (`x-locked` stubs stay locked regardless).
   */
  setEnforced(enforced: boolean): void {
    if (this.enforced !== enforced) {
      this.enforced = enforced;
      this.changesSubject.next();
    }
  }

  /**
   * Should renderers show the locked placeholder for this panel? True when
   * the rules are enforced here and the reader's snapshot does not open it.
   * Memoized per rules + snapshot, so it is cheap to call from templates.
   */
  isPanelLocked(panelId: string): boolean {
    return this.enforced && this.evaluate(panelId).locked;
  }

  getSnapshot(): EntitlementSnapshot {
    return this.snapshotSubject.value;
  }

  /** True when the work carries no paywall rules and no locked panels. */
  get isFreeWork(): boolean {
    return this.rules.length === 0 && this.lockedPanels.size === 0;
  }

  /** Reading-order index used for preview counting, or -1 when unknown. */
  indexOf(panelId: string): number {
    return this.readingOrder.get(panelId) ?? -1;
  }

  /**
   * Decide access for one panel.
   *
   * An unknown panel id gets `MAX_SAFE_INTEGER` as its index so it falls
   * OUTSIDE any free preview: a panel the reading order does not know about
   * must not be handed out as a free sample.
   *
   * Defence in depth: a panel the server stripped (`"x-locked": true`) is
   * locked whatever the rules say — its content is not in the manifest, so
   * neither a free preview nor an entitlement can show it. The applying
   * rule's own lock reason is kept while it locks; otherwise the reason is
   * the rule's purchase/subscription requirement, else `purchase_required`
   * (never the age, which would re-open the age gate forever on a stub).
   */
  evaluate(panelId: string): AccessDecision {
    let decision = this.decisions.get(panelId);
    if (!decision) {
      decision = this.decide(panelId);
      this.decisions.set(panelId, decision);
    }
    return decision;
  }

  private decide(panelId: string): AccessDecision {
    const decision: AccessDecision =
      this.rules.length === 0
        ? { panelId, locked: false, reason: null, appliedRuleId: null, preview: false }
        : evaluatePanelAccess(this.rules, this.snapshotSubject.value, {
            id: panelId,
            index: this.readingOrder.get(panelId) ?? Number.MAX_SAFE_INTEGER,
            ...this.chapterOrder.get(panelId),
          });
    if (decision.locked || !this.lockedPanels.has(panelId)) {
      return decision;
    }
    const rule = this.rules.find((r) => r.id === decision.appliedRuleId);
    return {
      ...decision,
      locked: true,
      reason: rule?.entitlementType === 'subscription' ? 'subscription_required' : 'purchase_required',
      preview: false,
    };
  }

  /** Is this extras block locked by an extras-scoped rule the reader does not satisfy? */
  isExtraLocked(extraId: string): boolean {
    return isExtraLocked(this.rules, this.snapshotSubject.value, extraId);
  }

  /** Convenience: may the reader open this panel? */
  canAccess(panelId: string): boolean {
    return !this.evaluate(panelId).locked;
  }

  /**
   * Describe the gate blocking a panel, or null when it is not gated.
   * The shape is the player's existing `PaywallGate`, so the overlay needs
   * no changes to render it. `locale` picks the language of product names
   * and descriptions from `paywall.products` (fallback: the work's default
   * locale).
   */
  gateFor(panelId: string, locale?: LocaleCode): PaywallGate | null {
    const decision = this.evaluate(panelId);
    if (!decision.locked) return null;

    const rule = this.rules.find((r) => r.id === decision.appliedRuleId);
    const scope: PaywallGate['scope'] =
      rule?.scope === 'panel' ? 'panel' : rule?.scope === 'chapter' ? 'chapter' : 'work';

    return {
      scope,
      refId: rule?.scope === 'panel' ? panelId : scope === 'chapter' ? this.chapterOrder.get(panelId)?.chapterId : undefined,
      requireEntitlement: rule?.entitlementType,
      reason: PaywallService.readerMessage(decision.reason),
      preview: rule?.previewPanelCount
        ? { previewPanels: rule.previewPanelCount }
        : undefined,
      ruleId: rule?.id,
      lockReason: decision.reason ?? undefined,
      options: rule
        ? PaywallService.purchaseOptions(rule, this.products, locale ?? this.defaultLocale, this.defaultLocale)
        : [],
    };
  }

  /**
   * What the reader can buy to pass a rule: one option per required product
   * (purchase) or per subscription tier (subscription). Without explicit
   * ids, the rule's `requireEntitlement` key names the product, else the
   * rule id. Age gates and free rules offer nothing to buy.
   *
   * Labels (format 1.6): an option whose id has an entry in
   * `paywall.products` takes that entry's localized name, description and
   * price. Otherwise it falls back to the rule's name (a single option) or
   * the bare id (several options), and to the rule's description and price.
   */
  static purchaseOptions(
    rule: EvaluatorRule,
    products: ReadonlyMap<string, PaywallProduct> = new Map(),
    locale: LocaleCode = 'en-US',
    fallbackLocale: LocaleCode = 'en-US',
  ): PurchaseInfo[] {
    const type = rule.entitlementType === 'purchase' ? 'one-time' : rule.entitlementType;
    if (type !== 'one-time' && type !== 'subscription') return [];
    const listed = type === 'one-time' ? rule.requiredProductIds : rule.subscriptionTiers;
    const key = rule.entitlementKey !== rule.entitlementType ? rule.entitlementKey : undefined;
    const ids = listed?.length ? listed : [key ?? rule.id];
    return ids.map((productId) => {
      const product = products.get(productId);
      const name = product?.name ? resolveLocalizedString(product.name, locale, fallbackLocale) : '';
      const description = product?.description
        ? resolveLocalizedString(product.description, locale, fallbackLocale)
        : '';
      return {
        productId,
        name: name || (ids.length > 1 ? productId : rule.name ?? ''),
        description: description || rule.description,
        price: product?.price ?? rule.price,
        type,
      };
    });
  }

  /** The rule that gates a panel, for callers that need its price or name. */
  ruleFor(panelId: string): EvaluatorRule | null {
    const decision = this.evaluate(panelId);
    if (!decision.appliedRuleId) return null;
    return this.rules.find((r) => r.id === decision.appliedRuleId) ?? null;
  }

  /** The work's default locale (product-label fallback). */
  private get defaultLocale(): LocaleCode {
    return this.manifest?.meta?.default_locale ?? 'en-US';
  }

  /** Reset to a manifest-less, entitlement-less state. */
  clear(): void {
    this.manifest = null;
    this.rules = [];
    this.products.clear();
    this.lockedPanels.clear();
    this.readingOrder.clear();
    this.chapterOrder.clear();
    this.decisions.clear();
    this.snapshotSubject.next(ANONYMOUS_READER);
    this.changesSubject.next();
  }

  /** Drop memoized decisions and tell renderers. */
  private changed(): void {
    this.decisions.clear();
    this.changesSubject.next();
  }

  /**
   * Reader-facing wording for a lock reason. Kept here rather than in the
   * overlay so the same sentence is used wherever a gate is explained.
   */
  static readerMessage(reason: LockReason): string {
    switch (reason) {
      case 'subscription_required':
        return 'This part of the story is included with a subscription.';
      case 'purchase_required':
        return 'This part of the story is available to buy.';
      case 'age_verification_required':
        return 'This content is age-restricted. Confirm your age to continue.';
      default:
        return 'This content requires an entitlement to access.';
    }
  }
}
