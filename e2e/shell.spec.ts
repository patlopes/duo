import { expect, test } from '@playwright/test';
import { expectActiveTitle, gotoTab, saveScreen, simulateSafeArea } from './helpers';

const PHASE = 'phase-0';

test.beforeEach(async ({ page }, testInfo) => {
  await simulateSafeArea(page, testInfo);
});

test('navega pelas abas e abre o menu do +', async ({ page }) => {
  await page.goto('/?source=pwa');
  await expect(page).toHaveURL(/\/tabs\/home$/);
  await expectActiveTitle(page, 'Início');

  await gotoTab(page, 'Lançamentos');
  await expectActiveTitle(page, 'Lançamentos');
  await expect(page).toHaveURL(/\/tabs\/transactions$/);

  await gotoTab(page, 'Planejamento');
  await expectActiveTitle(page, 'Planejamento');

  await gotoTab(page, 'Mais');
  await expectActiveTitle(page, 'Mais');

  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  const sheet = page.locator('ion-action-sheet');
  await expect(sheet.getByRole('button', { name: 'Despesa', exact: true })).toBeVisible();
  await expect(sheet.getByRole('button', { name: 'Transferência' })).toBeVisible();
});

test('botão + cabe no alvo mínimo de toque e fica centralizado', async ({ page }) => {
  await page.goto('/');
  const box = await page.getByRole('button', { name: 'Novo lançamento' }).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
});

test('o tema escolhido sobrevive a uma recarga', async ({ page }) => {
  await page.goto('/tabs/more');
  await page.locator('ion-segment-button', { hasText: 'Escuro' }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');

  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const background = await page.evaluate(() =>
    getComputedStyle(document.documentElement).getPropertyValue('--color-bg').trim(),
  );
  expect(background.toLowerCase()).toBe('#141013');
});

test('/debug mostra o diagnóstico sem depender do aparelho', async ({ page }) => {
  await page.goto('/debug');
  await expectActiveTitle(page, 'Diagnóstico');
  await expect(page.getByText('IndexedDB (gravar e ler)')).toBeVisible();
  const row = page.locator('ion-item', { hasText: 'IndexedDB (gravar e ler)' });
  await expect(row.getByText('ok', { exact: true })).toBeVisible();
  await expect(page.getByText('canShare .json application/json')).toBeVisible();
});

test('o guia de instalação aparece no Safari do iPhone e pode ser dispensado', async ({ page }) => {
  await page.goto('/tabs/home');
  const card = page.getByText('Instale na Tela de Início');
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Dispensar aviso de instalação' }).click();
  await expect(card).toBeHidden();

  await page.reload();
  await expectActiveTitle(page, 'Início');
  await expect(card).toBeHidden();
});

test('a primeira visita não anuncia uma versão nova', async ({ page }) => {
  await page.goto('/');
  await expectActiveTitle(page, 'Início');
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expectActiveTitle(page, 'Início');
  await page.waitForTimeout(1000);
  await expect(page.getByText('Nova versão disponível')).toBeHidden();
});

test('abre sem internet depois da primeira visita', async ({ page, context }) => {
  await page.goto('/');
  await expectActiveTitle(page, 'Início');

  // The first visit installs the worker; only the next load runs under its control.
  await page.evaluate(async () => {
    const registration = await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => {
        navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), {
          once: true,
        });
        registration.active?.postMessage({ type: 'SKIP_WAITING' });
        setTimeout(resolve, 3000);
      });
    }
  });

  await page.reload();
  await expectActiveTitle(page, 'Início');

  await context.setOffline(true);
  await page.reload();
  await expectActiveTitle(page, 'Início');
  await gotoTab(page, 'Lançamentos');
  await expectActiveTitle(page, 'Lançamentos');
  await context.setOffline(false);
});

test.describe('telas', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(colorScheme, () => {
      test.use({ colorScheme });

      test(`captura as telas da fase 0 (${colorScheme})`, async ({ page }, testInfo) => {
        await page.goto('/tabs/home');
        await expectActiveTitle(page, 'Início');
        await saveScreen(page, testInfo, PHASE, 'home');

        await gotoTab(page, 'Mais');
        await expectActiveTitle(page, 'Mais');
        await saveScreen(page, testInfo, PHASE, 'more');

        await page.getByRole('button', { name: 'Novo lançamento' }).click();
        await expect(
          page.locator('ion-action-sheet').getByRole('button', { name: 'Receita' }),
        ).toBeVisible();
        await saveScreen(page, testInfo, PHASE, 'add-sheet');

        await page.goto('/install');
        await expectActiveTitle(page, 'Instalar');
        await saveScreen(page, testInfo, PHASE, 'install-guide');

        await page.goto('/debug');
        await expectActiveTitle(page, 'Diagnóstico');
        await saveScreen(page, testInfo, PHASE, 'debug');

        // Scrolled, the large title collapses and content must blur behind the translucent toolbar.
        await page.evaluate(() =>
          (
            document.querySelector('.ion-page ion-content') as unknown as {
              scrollToPoint: (x: number, y: number) => Promise<void>;
            }
          ).scrollToPoint(0, 320),
        );
        await saveScreen(page, testInfo, PHASE, 'debug-scrolled');
      });
    });
  }
});
