import type { PanelWaveManifest, PaywallRule } from 'player';

/** Fields that say WHAT a rule gates (kept), as opposed to what it costs. */
const TARGET_FIELDS = [
  'id',
  'scope',
  'refId',
  'targetPanelIds',
  'previewPanelCount',
  'previewPanels',
];

/**
 * A review link shows the paid parts but keeps age gates (a self-declaration
 * the reviewer must answer like any reader). So every paywall rule is cut
 * down to its age part: a rule with an age (`minimumAge` / `ageGate`, or an
 * `age_gate` entitlement) becomes a pure age gate on the same target with the
 * same preview; a rule without one is dropped. The rest of the manifest is
 * passed through untouched (and the input is not mutated).
 */
export function forReview(manifest: PanelWaveManifest): PanelWaveManifest {
  const rules = manifest.paywall?.rules;
  if (!manifest.paywall || !rules) {
    return manifest;
  }
  return { ...manifest, paywall: { ...manifest.paywall, rules: rules.flatMap(agePartOf) } };
}

function agePartOf(rule: PaywallRule): PaywallRule[] {
  const raw = rule as unknown as Record<string, unknown>;
  const minimumAge = (raw['minimumAge'] ?? raw['ageGate']) as number | undefined;
  const isAgeGate =
    raw['entitlementType'] === 'age_gate' || raw['requireEntitlement'] === 'age_gate';
  if (minimumAge === undefined && !isAgeGate) {
    return [];
  }
  const kept: Record<string, unknown> = {};
  for (const field of TARGET_FIELDS) {
    if (raw[field] !== undefined) {
      kept[field] = raw[field];
    }
  }
  kept['entitlementType'] = 'age_gate';
  if (minimumAge !== undefined) {
    kept['minimumAge'] = minimumAge;
  }
  return [kept as unknown as PaywallRule];
}
