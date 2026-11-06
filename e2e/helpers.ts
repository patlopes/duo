import { expect, type Page, type TestInfo } from '@playwright/test';

/**
 * Linux WebKit reports no safe areas, so screenshots would hide notch bugs. Ionic reads these
 * variables, which lets the tests lay the app out as it would be on the real device.
 */
const SAFE_AREAS: Record<string, { top: number; bottom: number }> = {
  'iphone-15-pro': { top: 59, bottom: 34 },
  'iphone-se': { top: 20, bottom: 0 },
};

export async function simulateSafeArea(page: Page, testInfo: TestInfo): Promise<void> {
  const area = SAFE_AREAS[testInfo.project.name] ?? { top: 0, bottom: 0 };
  await page.addInitScript((a) => {
    const apply = () => {
      const style = document.createElement('style');
      style.textContent = `:root{--ion-safe-area-top:${a.top}px;--ion-safe-area-bottom:${a.bottom}px}`;
      document.head.append(style);
    };
    if (document.head) apply();
    else document.addEventListener('DOMContentLoaded', apply);
  }, area);
}

export async function saveScreen(
  page: Page,
  testInfo: TestInfo,
  phase: string,
  name: string,
): Promise<void> {
  const scheme = await page.evaluate(() => {
    const forced = document.documentElement.dataset.theme;
    if (forced) return forced;
    return matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });
  // Lets transitions and translucent blurs settle before the capture.
  await page.waitForTimeout(450);
  await page.screenshot({
    path: `docs/screens/${phase}/${name}-${testInfo.project.name}-${scheme}.png`,
    animations: 'disabled',
  });
}

export async function expectActiveTitle(page: Page, title: string): Promise<void> {
  await expect(
    page.locator('.ion-page:not(.ion-page-hidden) ion-title.title-large', { hasText: title }),
  ).toBeVisible();
}

export async function gotoTab(page: Page, label: string): Promise<void> {
  await page.locator('ion-tab-button', { hasText: label }).click();
}
