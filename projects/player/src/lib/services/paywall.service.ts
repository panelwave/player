import { Injectable } from '@angular/core';
import { BehaviorSubject, Observable } from 'rxjs';

import type { PanelWaveManifest } from '../types/manifest.types';
import type { PaywallGate } from '../types/entitlement.types';
import {
  ANONYMOUS_READER,
  evaluatePanelAccess,
  readingOrderFromManifest,
  rulesFromManifest,
  type AccessDecision,
  type EntitlementSnapshot,
  type EvaluatorRule,
  type LockReason,
} from '../entitlement/paywall-evaluator';

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
  private manifest: PanelWaveManifest | null = null;

  private snapshotSubject = new BehaviorSubject<EntitlementSnapshot>(ANONYMOUS_READER);
  readonly snapshot$: Observable<EntitlementSnapshot> = this.snapshotSubject.asObservable();

  /** Load the rules and reading order from a manifest. Safe to call repeatedly. */
  setManifest(manifest: PanelWaveManifest | null): void {
    this.manifest = manifest;
    this.rules = rulesFromManifest(manifest);
    this.readingOrder = new Map(
      readingOrderFromManifest(manifest).map((panelId, index) => [panelId, index]),
    );
  }

  /** Replace what the reader owns (after sign-in, or a completed purchase). */
  setSnapshot(snapshot: EntitlementSnapshot | null | undefined): void {
    this.snapshotSubject.next(snapshot ?? ANONYMOUS_READER);
  }

  getSnapshot(): EntitlementSnapshot {
    return this.snapshotSubject.value;
  }

  /** True when the work carries no paywall rules at all. */
  get isFreeWork(): boolean {
    return this.rules.length === 0;
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
   */
  evaluate(panelId: string): AccessDecision {
    if (this.rules.length === 0) {
      return { panelId, locked: false, reason: null, appliedRuleId: null, preview: false };
    }
    const index = this.readingOrder.get(panelId) ?? Number.MAX_SAFE_INTEGER;
    return evaluatePanelAccess(this.rules, this.snapshotSubject.value, { id: panelId, index });
  }

  /** Convenience: may the reader open this panel? */
  canAccess(panelId: string): boolean {
    return !this.evaluate(panelId).locked;
  }

  /**
   * Describe the gate blocking a panel, or null when it is not gated.
   * The shape is the player's existing `PaywallGate`, so the overlay needs
   * no changes to render it.
   */
  gateFor(panelId: string): PaywallGate | null {
    const decision = this.evaluate(panelId);
    if (!decision.locked) return null;

    const rule = this.rules.find((r) => r.id === decision.appliedRuleId);
    const scope: PaywallGate['scope'] =
      rule?.scope === 'panel' ? 'panel' : rule?.scope === 'chapter' ? 'chapter' : 'work';

    return {
      scope,
      refId: rule?.scope === 'panel' ? panelId : undefined,
      requireEntitlement: rule?.entitlementType,
      reason: PaywallService.readerMessage(decision.reason),
      preview: rule?.previewPanelCount
        ? { previewPanels: rule.previewPanelCount }
        : undefined,
    };
  }

  /** The rule that gates a panel, for callers that need its price or name. */
  ruleFor(panelId: string): EvaluatorRule | null {
    const decision = this.evaluate(panelId);
    if (!decision.appliedRuleId) return null;
    return this.rules.find((r) => r.id === decision.appliedRuleId) ?? null;
  }

  /** Reset to a manifest-less, entitlement-less state. */
  clear(): void {
    this.manifest = null;
    this.rules = [];
    this.readingOrder.clear();
    this.snapshotSubject.next(ANONYMOUS_READER);
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
