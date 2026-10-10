import { expect, type Page } from '@playwright/test';

declare global {
  interface Window {
    axe: typeof import('axe-core');
  }
}

export async function expectAccessible(page: Page): Promise<void> {
  await page.addScriptTag({ path: require.resolve('axe-core/axe.min.js') });
  const violations = await page.evaluate(async () => {
    const axe = window.axe;
    return (
      await axe.run(document, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
      })
    ).violations;
  });
  expect(violations, JSON.stringify(violations, null, 2)).toEqual([]);
}
