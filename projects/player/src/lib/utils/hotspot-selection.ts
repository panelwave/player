/**
 * Hotspot selection state
 *
 * A hotspot shows as "selected" while the story still reflects the reader's
 * choice, so a reader who comes back to the panel sees what they picked.
 * The state is DERIVED, never recorded separately: it follows the variables
 * (incl. their persistence and resets) and the chosen path exactly.
 *
 * - Mutations whose result can be read back decide first: `set` (the variable
 *   still holds the value), `toggle` (the flag is on), `append` (the list
 *   still contains the value). All of them must match. Two options writing
 *   the same variable are therefore mutually exclusive: picking B deselects A.
 * - A `goTo` without such mutations is selected when the reader's choice on
 *   this panel led to its target (`chosenTarget`).
 * - Anything else (`increment`/`decrement`/`remove`/`clear` only, `openModal`,
 *   `openExtras`, `pluginEvent`) is repeatable and never shows as selected.
 */

import type { Hotspot, VariableContext } from '../types';

interface MutationLike {
  op: string;
  var: string;
  value?: unknown;
}

const READABLE_OPS = new Set(['set', 'toggle', 'append']);

/**
 * Whether a hotspot currently reads as selected.
 * @param hotspot - The hotspot (manifest shape)
 * @param context - Flat variable context (null: variables unknown)
 * @param chosenTarget - Panel the reader's choice on this hotspot's panel led to
 */
export function isHotspotSelected(
  hotspot: Hotspot,
  context: VariableContext | null,
  chosenTarget?: string | null
): boolean {
  const action = hotspot.action;
  if (!action) return false;
  if (action.type !== 'setVariables' && action.type !== 'goTo') return false;

  const mutations = ((action.mutations ?? []) as MutationLike[]).filter(
    (m) => m && typeof m.var === 'string' && READABLE_OPS.has(m.op)
  );
  if (mutations.length > 0) {
    return !!context && mutations.every((m) => mutationHolds(m, context));
  }
  return action.type === 'goTo' && !!chosenTarget && action.to === chosenTarget;
}

function mutationHolds(m: MutationLike, context: VariableContext): boolean {
  const current = (context as Record<string, unknown>)[m.var];
  switch (m.op) {
    case 'set':
      return sameValue(current, m.value);
    case 'toggle':
      return current === true;
    case 'append':
      return Array.isArray(current) && current.some((item) => sameValue(item, m.value));
    default:
      return false;
  }
}

function sameValue(a: unknown, b: unknown): boolean {
  if (a === b) return true;
  if (a === undefined || b === undefined) return false;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null) return false;
  try {
    return JSON.stringify(a) === JSON.stringify(b);
  } catch {
    return false;
  }
}
