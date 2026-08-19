/**
 * Panel Variant Utilities
 *
 * Runtime resolution of panel `variants` (schema `PanelVariant`):
 * each variant carries a JSON Logic `when` condition evaluated against
 * the flat variable context, and an `overrides` object (schema
 * `PanelPartial`) whose fields REPLACE the corresponding base panel
 * fields wholesale (no deep merge).
 *
 * Selection: variants are evaluated in manifest order; the FIRST
 * variant whose `when` evaluates truthy wins. If none match, the base
 * panel applies unchanged.
 */

import type { JsonLogic } from '../types';
import type { Panel, PanelVariant } from '../types/panel.types';
import { evaluateJsonLogic } from './json-logic-utils';

/** Flat JSON Logic evaluation context (see VariableStoreService.createContext). */
export type VariantContext = Record<string, unknown> | null | undefined;

/** Result of resolving a panel against the variable context. */
export interface ResolvedPanel {
  /** The effective panel (=== the input panel when no variant applies). */
  panel: Panel;
  /** Id of the applied variant, if any. */
  variantId?: string;
}

/**
 * The panel fields a variant may override — mirrors the schema's
 * `PanelPartial` (additionalProperties: false). Anything else in
 * `overrides` is ignored so a manifest can never swap ids or nest
 * variants.
 */
const OVERRIDABLE_KEYS = [
  'title',
  'description',
  'durationMs',
  'formatViews',
  'layers',
  'animations',
  'speechBubbles',
  'hotspots',
  'audio',
  'video',
  'plugins',
  'accessibility',
  'shareable',
  'age_rating_override',
  'preloadHints',
  'memoryBudgetHint',
  'contentWarnings',
] as const;

/**
 * Select the first variant whose `when` condition matches the context.
 * Returns undefined when the panel has no variants or none match.
 */
export function selectVariant(
  panel: Panel | undefined | null,
  context: VariantContext
): PanelVariant | undefined {
  if (!panel?.variants?.length) {
    return undefined;
  }
  return panel.variants.find(
    (variant) =>
      !!variant &&
      variant.when !== undefined &&
      evaluateJsonLogic(variant.when as JsonLogic, context ?? {})
  );
}

/**
 * Apply a variant's overrides to a panel (whole-field replacement,
 * restricted to the schema's PanelPartial keys). Always returns a new
 * object; the base panel is never mutated.
 */
export function applyVariantOverrides(panel: Panel, variant: PanelVariant): Panel {
  const effective: Panel = { ...panel };
  const overrides = (variant.overrides ?? {}) as Record<string, unknown>;
  for (const key of OVERRIDABLE_KEYS) {
    if (Object.prototype.hasOwnProperty.call(overrides, key) && overrides[key] !== undefined) {
      (effective as Record<string, unknown>)[key] = overrides[key];
    }
  }
  return effective;
}

/**
 * Resolve a panel against the variable context.
 *
 * @param forcedVariantId - When set, skips condition evaluation and
 *   applies this variant directly (manual variant cycling). `null`
 *   forces the base panel. Unknown ids fall back to condition-based
 *   selection.
 * @returns `panel === input` (same reference) when no variant applies,
 *   so identity-based comparisons and OnPush bindings stay stable.
 */
export function resolvePanelVariant(
  panel: Panel,
  context: VariantContext,
  forcedVariantId?: string | null
): ResolvedPanel {
  if (!panel.variants?.length) {
    return { panel };
  }

  if (forcedVariantId === null) {
    return { panel };
  }

  let variant: PanelVariant | undefined;
  if (forcedVariantId !== undefined) {
    variant = panel.variants.find((v) => v?.id === forcedVariantId);
  }
  if (!variant) {
    variant = selectVariant(panel, context);
  }
  if (!variant) {
    return { panel };
  }
  return { panel: applyVariantOverrides(panel, variant), variantId: variant.id };
}

/**
 * Resolve every panel of a chapter against the context. Panels without
 * an applying variant keep their original object identity; when NO
 * panel in the record changes, the input record itself is returned.
 */
export function resolvePanels(
  panels: Record<string, Panel>,
  context: VariantContext
): Record<string, Panel> {
  let changed = false;
  const resolved: Record<string, Panel> = {};
  for (const [id, panel] of Object.entries(panels)) {
    const result = resolvePanelVariant(panel, context);
    resolved[id] = result.panel;
    if (result.panel !== panel) {
      changed = true;
    }
  }
  return changed ? resolved : panels;
}
