/**
 * Paywall evaluator — the one place that answers
 * "can this reader see this panel, given these rules?".
 *
 * Pure and dependency-free (no Angular, no RxJS) so it can be unit-tested in
 * isolation and reused outside the player.
 *
 * PARITY NOTE: the CMS carries a copy at
 * `panelwave-cms/apps/cms-frontend/src/app/core/entitlement/paywall-evaluator.ts`,
 * where it drives the paywall content map and the entitlement simulator. This
 * module is the canonical version — the CMS copy should be replaced by an
 * import from `@panelwave/player` once the CMS consumes the player package
 * (it does not today). Until then, any semantic change must land in BOTH, or
 * an author will see one thing in the CMS preview and readers another.
 *
 * Semantics:
 * - Only ACTIVE rules participate. A manifest only ever carries active rules
 *   (the CMS filters on `is_active` at export), so every rule read from a
 *   manifest is active by definition.
 * - The first active work/global rule gates the whole work; panels whose
 *   global reading-order index < `previewPanelCount` stay readable as the
 *   free preview.
 * - Panel-scoped rules gate exactly their `targetPanelIds` — preview does NOT
 *   override an explicit panel gate.
 * - Chapter-scoped rules gate only the panels of their chapter(s) (`refId`);
 *   their free preview counts panels WITHIN that chapter. They take
 *   precedence over a work gate for those panels.
 * - Extras-scoped rules never gate panels — they gate the extras block named
 *   by `refId` (see `isExtraLocked`).
 * - A gated panel unlocks when the gating rule's requirement is satisfied by
 *   the reader's entitlement snapshot.
 */

import type { PanelWaveManifest, PaywallRule as ManifestPaywallRule } from '../types/manifest.types';

export type EvaluatorEntitlementType = 'free' | 'subscription' | 'purchase' | 'age_gate';
export type EvaluatorScope = 'global' | 'work' | 'chapter' | 'panel' | 'extras';

/** The rule shape the evaluator needs (a superset of the manifest rule). */
export interface EvaluatorRule {
  id: string;
  scope: EvaluatorScope;
  entitlementType: EvaluatorEntitlementType;
  isActive: boolean;
  /** Tiers that satisfy a subscription rule; empty/absent = any tier. */
  subscriptionTiers?: string[];
  /** Products that satisfy a purchase rule; empty/absent = any purchase. */
  requiredProductIds?: string[];
  /** Minimum age for an age_gate rule (default 18). */
  minimumAge?: number;
  /** Free-preview length for work/global rules (panels in reading order). */
  previewPanelCount?: number;
  /** Panels gated by a panel-scoped rule. */
  targetPanelIds?: string[];
  /** Chapters (chapter scope) or extras blocks (extras scope) the rule gates — the manifest's `refId`. */
  targetIds?: string[];
  /** Reader-facing rule name and description (CMS), for purchase options. */
  name?: string;
  description?: string;
  /** Display price (CMS). */
  price?: { amount: number; currency: string };
  /** The manifest's raw `requireEntitlement` key. */
  entitlementKey?: string;
}

/** What the reader "has" — the shape payments produce and the player consumes. */
export interface EntitlementSnapshot {
  /** Active subscription tier, or null when not subscribed. */
  subscriptionTier: string | null;
  purchasedProductIds: string[];
  age?: number;
  ageVerified: boolean;
}

/** A panel to evaluate: id + its global reading-order index. */
export interface PanelRef {
  id: string;
  index: number;
  /** Chapter the panel belongs to (enables chapter-scoped rules). */
  chapterId?: string;
  /** Reading-order index within its chapter (chapter-rule preview counting). */
  chapterIndex?: number;
}

export type LockReason =
  | 'subscription_required'
  | 'purchase_required'
  | 'age_verification_required'
  | null;

export interface AccessDecision {
  panelId: string;
  locked: boolean;
  /** Why it is locked (null when accessible). */
  reason: LockReason;
  /** The rule that decided (also set for preview/unlocked-by-entitlement). */
  appliedRuleId: string | null;
  /** True when access exists only because the panel is inside the free preview. */
  preview: boolean;
}

const DEFAULT_MINIMUM_AGE = 18;

/** Does the reader's snapshot satisfy this rule's requirement? */
export function satisfiesRule(rule: EvaluatorRule, entitlement: EntitlementSnapshot): boolean {
  switch (rule.entitlementType) {
    case 'free':
      return true;
    case 'subscription': {
      if (!entitlement.subscriptionTier) return false;
      const tiers = rule.subscriptionTiers ?? [];
      return tiers.length === 0 || tiers.includes(entitlement.subscriptionTier);
    }
    case 'purchase': {
      const required = rule.requiredProductIds ?? [];
      if (required.length === 0) return entitlement.purchasedProductIds.length > 0;
      return required.some((id) => entitlement.purchasedProductIds.includes(id));
    }
    case 'age_gate': {
      const min = rule.minimumAge ?? DEFAULT_MINIMUM_AGE;
      return entitlement.ageVerified && (entitlement.age ?? 0) >= min;
    }
  }
}

function lockReasonFor(rule: EvaluatorRule): LockReason {
  switch (rule.entitlementType) {
    case 'subscription':
      return 'subscription_required';
    case 'purchase':
      return 'purchase_required';
    case 'age_gate':
      return 'age_verification_required';
    case 'free':
      return null;
  }
}

/** The active work/global rule (first one wins — mirrors the CMS content map). */
export function findWorkGateRule(rules: EvaluatorRule[]): EvaluatorRule | null {
  return rules.find((r) => r.isActive && (r.scope === 'work' || r.scope === 'global')) ?? null;
}

/**
 * Evaluate one panel against the rules for a given reader snapshot.
 */
export function evaluatePanelAccess(
  rules: EvaluatorRule[],
  entitlement: EntitlementSnapshot,
  panel: PanelRef,
): AccessDecision {
  const active = rules.filter((r) => r.isActive);

  // 1. Explicit panel gates take precedence (preview never overrides them).
  const panelRule = active.find(
    (r) => r.scope === 'panel' && (r.targetPanelIds ?? []).includes(panel.id),
  );
  if (panelRule) {
    const ok = satisfiesRule(panelRule, entitlement);
    return {
      panelId: panel.id,
      locked: !ok,
      reason: ok ? null : lockReasonFor(panelRule),
      appliedRuleId: panelRule.id,
      preview: false,
    };
  }

  // 2. Chapter gates: only the panels of the named chapter, with the free
  // preview counted within that chapter.
  const chapterRule =
    panel.chapterId === undefined
      ? undefined
      : active.find((r) => r.scope === 'chapter' && (r.targetIds ?? []).includes(panel.chapterId!));
  if (chapterRule) {
    return gateWithPreview(chapterRule, entitlement, panel.id, panel.chapterIndex ?? Number.MAX_SAFE_INTEGER);
  }

  // 3. Work/global gate with free preview.
  const workRule = findWorkGateRule(active);
  if (workRule) {
    return gateWithPreview(workRule, entitlement, panel.id, panel.index);
  }

  // 4. No gate at all — free content.
  return { panelId: panel.id, locked: false, reason: null, appliedRuleId: null, preview: false };
}

/** A work/chapter gate: panels before `previewPanelCount` (by `index`) are free. */
function gateWithPreview(
  rule: EvaluatorRule,
  entitlement: EntitlementSnapshot,
  panelId: string,
  index: number,
): AccessDecision {
  if (index < (rule.previewPanelCount ?? 0)) {
    return { panelId, locked: false, reason: null, appliedRuleId: rule.id, preview: true };
  }
  const ok = satisfiesRule(rule, entitlement);
  return {
    panelId,
    locked: !ok,
    reason: ok ? null : lockReasonFor(rule),
    appliedRuleId: rule.id,
    preview: false,
  };
}

/** Is the extras block `extraId` locked by an extras-scoped rule? */
export function isExtraLocked(
  rules: EvaluatorRule[],
  entitlement: EntitlementSnapshot,
  extraId: string,
): boolean {
  return rules.some(
    (r) =>
      r.isActive &&
      r.scope === 'extras' &&
      (r.targetIds ?? []).includes(extraId) &&
      !satisfiesRule(r, entitlement),
  );
}

/** Evaluate a whole work (panels in reading order). */
export function evaluateWorkAccess(
  rules: EvaluatorRule[],
  entitlement: EntitlementSnapshot,
  panels: PanelRef[],
): AccessDecision[] {
  return panels.map((panel) => evaluatePanelAccess(rules, entitlement, panel));
}

/** A snapshot with no entitlements — what an anonymous first-time reader has. */
export const ANONYMOUS_READER: EntitlementSnapshot = Object.freeze({
  subscriptionTier: null,
  purchasedProductIds: [],
  ageVerified: false,
});

// ── Manifest bridge ────────────────────────────────────────────────────────

const KNOWN_ENTITLEMENT_TYPES: EvaluatorEntitlementType[] = [
  'free',
  'subscription',
  'purchase',
  'age_gate',
];

/**
 * Normalise one manifest rule onto the evaluator's shape.
 *
 * The manifest carries two generations of field names side by side (the
 * schema allows both): `requireEntitlement` / `previewPanels` / `ageGate` from
 * the original format, and `entitlementType` / `previewPanelCount` /
 * `minimumAge` written by the CMS exporter. Prefer the CMS names and fall
 * back to the originals, so a manifest from either era gates identically.
 *
 * A rule with `minimumAge`/`ageGate` but no recognised entitlement type is an
 * age gate — that is the only sane reading of a rule that names an age.
 */
export function fromManifestRule(rule: ManifestPaywallRule, index: number): EvaluatorRule {
  const raw = rule as ManifestPaywallRule & Record<string, unknown>;

  const declared = (raw['entitlementType'] ?? raw['requireEntitlement']) as string | undefined;
  const minimumAge = (raw['minimumAge'] ?? raw['ageGate']) as number | undefined;

  let entitlementType: EvaluatorEntitlementType;
  if (declared && KNOWN_ENTITLEMENT_TYPES.includes(declared as EvaluatorEntitlementType)) {
    entitlementType = declared as EvaluatorEntitlementType;
  } else if (minimumAge !== undefined) {
    entitlementType = 'age_gate';
  } else if (declared === 'premium') {
    // Original format's subscription marker.
    entitlementType = 'subscription';
  } else if (declared) {
    // 'token', 'purchaseId', or any custom marker: treat as a purchase gate.
    entitlementType = 'purchase';
  } else {
    entitlementType = 'free';
  }

  // Extras-scoped rules keep their scope: they gate an extras block, never
  // panels (mapping them onto 'work' used to lock the whole work).
  const scope = raw['scope'] as EvaluatorScope | undefined;
  const refId = raw['refId'] as string | undefined;

  return {
    id: (raw['id'] as string) ?? `rule-${index}`,
    scope: scope ?? 'work',
    entitlementType,
    // A manifest only carries rules the CMS already filtered to active.
    isActive: true,
    subscriptionTiers: raw['subscriptionTiers'] as string[] | undefined,
    requiredProductIds: raw['requiredProductIds'] as string[] | undefined,
    minimumAge,
    previewPanelCount: (raw['previewPanelCount'] ?? raw['previewPanels']) as number | undefined,
    targetPanelIds: (raw['targetPanelIds'] as string[] | undefined) ??
      // A panel-scoped rule from the original format names its single target
      // in refId rather than a list.
      (scope === 'panel' && refId ? [refId] : undefined),
    targetIds: (scope === 'chapter' || scope === 'extras') && refId ? [refId] : undefined,
    name: raw['name'] as string | undefined,
    description: raw['description'] as string | undefined,
    price: raw['price'] as EvaluatorRule['price'],
    entitlementKey: raw['requireEntitlement'] as string | undefined,
  };
}

/** Normalise every rule in a manifest. Returns [] when the work has no paywall. */
export function rulesFromManifest(manifest: PanelWaveManifest | null): EvaluatorRule[] {
  const rules = manifest?.paywall?.rules;
  if (!rules?.length) return [];
  return rules.map(fromManifestRule);
}

/** Chapter id and within-chapter index per panel id (chapter-rule previews). */
export function chapterOrderFromManifest(
  manifest: PanelWaveManifest | null,
): Map<string, { chapterId: string; chapterIndex: number }> {
  const out = new Map<string, { chapterId: string; chapterIndex: number }>();
  for (const chapter of manifest?.chapters ?? []) {
    Object.keys(chapter.panels ?? {}).forEach((panelId, chapterIndex) =>
      out.set(panelId, { chapterId: chapter.id, chapterIndex }),
    );
  }
  return out;
}

/**
 * Global reading order for preview counting: chapters in array order, and
 * within a chapter the panel declaration order.
 *
 * That declaration order IS the reading order as the CMS exports it, and it is
 * the same order the author saw when they chose a preview length — which is
 * what makes "the first N panels are free" mean the same thing on both sides.
 */
export function readingOrderFromManifest(manifest: PanelWaveManifest | null): string[] {
  if (!manifest?.chapters?.length) return [];
  const order: string[] = [];
  for (const chapter of manifest.chapters) {
    for (const panelId of Object.keys(chapter.panels ?? {})) {
      order.push(panelId);
    }
  }
  return order;
}

/**
 * Map a decision onto the player's `EntitlementStatus` contract.
 */
export function toEntitlementStatus(
  decision: AccessDecision,
  entitlement: EntitlementSnapshot,
): { ok: boolean; entitlements: Record<string, boolean>; reason?: string } {
  return {
    ok: !decision.locked,
    entitlements: {
      subscription: entitlement.subscriptionTier !== null,
      purchased: entitlement.purchasedProductIds.length > 0,
      ageVerified: entitlement.ageVerified,
      preview: decision.preview,
    },
    ...(decision.locked && decision.reason ? { reason: decision.reason } : {}),
  };
}
