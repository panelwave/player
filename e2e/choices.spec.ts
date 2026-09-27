import { test, expect } from '@playwright/test';
import { openPlayer, expectPanel, stubManifest } from './helpers/player';
import { conditionalManifest } from './fixtures/conditional-manifest';

/**
 * The toolbar's "Choices" button appears only while at least two paths out
 * of the current panel are open (edge conditions evaluated like the
 * chooser does). pA has an unconditional edge and one that opens once the
 * reader takes the lantern (hotspot sets hasLantern = true).
 */
function branchingManifest(): unknown {
  const manifest = structuredClone(conditionalManifest) as typeof conditionalManifest;
  const chapter = manifest.chapters[0] as unknown as {
    graph: { entry: string; edges: Record<string, unknown>[] };
  };
  chapter.graph.edges = [
    { from: 'pA', to: 'pB', label: { 'en-US': 'Walk on in the dark' } },
    { from: 'pA', to: 'pB', label: { 'en-US': 'Light the way' }, condition: { '==': [{ var: 'hasLantern' }, true] } },
  ];
  return manifest;
}

test.describe('choices', () => {
  test('the Choices button shows only once two paths are open', async ({ page }) => {
    await stubManifest(page, branchingManifest());
    await openPlayer(page);
    await expectPanel(page, 'pA');

    const choices = page.getByRole('button', { name: 'Choices ahead' });
    await expect(choices).toHaveCount(0);

    await page.getByRole('button', { name: 'Take the lantern' }).click();
    await expect(choices).toBeVisible();

    await choices.click();
    const chooser = page.getByRole('dialog', { name: 'Choose your path' });
    await expect(chooser.locator('.branch-chooser-option')).toHaveCount(2);
    await chooser.getByRole('button', { name: /Light the way/ }).click();
    await expectPanel(page, 'pB');
  });
});
