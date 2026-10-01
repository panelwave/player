import type { Panel } from '../types/panel.types';

/**
 * True when a panel is a server-side paywall stub: public manifests strip
 * the content of paid panels and flag them `"x-locked": true`. Only the
 * boolean `true` counts (a `"true"` string is not a lock).
 */
export function isLockedPanel(panel: Panel | null | undefined): boolean {
  return panel?.['x-locked'] === true;
}
