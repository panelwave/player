import { isLockedPanel, type PanelWaveManifest, type PlayerShellComponent } from 'player';

type ShellEntitlementAdapter = NonNullable<PlayerShellComponent['entitlementAdapter']>;

/**
 * Anonymous-reader entitlement: public manifests strip paid panels and flag
 * them `x-locked: true`; those are the only panels without access.
 */
export function lockedAdapterFor(manifest: PanelWaveManifest): ShellEntitlementAdapter {
  const locked = new Set<string>();
  for (const chapter of manifest.chapters ?? []) {
    for (const [id, panel] of Object.entries(chapter.panels ?? {})) {
      if (isLockedPanel(panel)) {
        locked.add(id);
      }
    }
  }
  return {
    hasAccess: (panelId: string) => Promise.resolve(!locked.has(panelId)),
    getContext: () => Promise.resolve({ anonymous: true }),
  };
}
