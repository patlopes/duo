import { expect, test } from '@playwright/test';
import {
  expectActiveTitle,
  gotoTab,
  loadSeed,
  saveScreen,
  simulateSafeArea,
  skipOnboarding,
} from './helpers';

test.beforeEach(async ({ page }, testInfo) => {
  await simulateSafeArea(page, testInfo);
});

test('navega pelas abas e abre o menu do +', async ({ page }) => {
  await page.goto('?source=pwa');
  await skipOnboarding(page);
  await expect(page).toHaveURL(/\/tabs\/home$/);
  await expectActiveTitle(page, 'Início');

  await gotoTab(page, 'Lançamentos');
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
  await page.goto('./');
  await skipOnboarding(page);
  const box = await page.getByRole('button', { name: 'Novo lançamento' }).boundingBox();
  const viewport = page.viewportSize()!;
  expect(box!.width).toBeGreaterThanOrEqual(44);
  expect(box!.height).toBeGreaterThanOrEqual(44);
  expect(Math.abs(box!.x + box!.width / 2 - viewport.width / 2)).toBeLessThanOrEqual(1);
});

test('o tema escolhido sobrevive a uma recarga', async ({ page }) => {
  await page.goto('tabs/more/settings');
  await skipOnboarding(page);
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
  await page.goto('debug');
  await skipOnboarding(page);
  await expectActiveTitle(page, 'Diagnóstico');
  const row = page.locator('ion-item', { hasText: 'IndexedDB (gravar e ler)' });
  await expect(row.getByText('ok', { exact: true })).toBeVisible();
  await expect(page.getByText('canShare .json application/json')).toBeVisible();
});

test('o guia de instalação aparece no celular e pode ser dispensado', async ({ page }) => {
  await page.goto('tabs/home');
  await skipOnboarding(page);
  const card = page.getByText('Instale no celular');
  await expect(card).toBeVisible();
  await page.getByRole('button', { name: 'Dispensar aviso de instalação' }).click();
  await expect(card).toBeHidden();

  await page.reload();
  await expectActiveTitle(page, 'Início');
  await expect(card).toBeHidden();
});

test('a primeira visita não anuncia uma versão nova', async ({ page }) => {
  await page.goto('./');
  await skipOnboarding(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expectActiveTitle(page, 'Início');
  await page.waitForTimeout(1000);
  await expect(page.getByText('Nova versão disponível')).toBeHidden();
});

test('versão nova: aparece sem esperar o cache do sw.js e atualizar recarrega o app', async ({
  page,
}) => {
  await page.goto('./');
  await skipOnboarding(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expectActiveTitle(page, 'Início');
  await page.waitForTimeout(500);
  await expect(page.getByText('Nova versão disponível')).toBeHidden();

  // A deploy happened: version.json says so, though nothing else changed on this device yet.
  // page.route can't see this fetch while a service worker controls the page.
  await page.evaluate(() => sessionStorage.setItem('fake-deploy', '1'));
  await page.addInitScript(() => {
    const realFetch = window.fetch.bind(window);
    window.fetch = (input, init) =>
      String(input).includes('version.json') && sessionStorage.getItem('fake-deploy')
        ? Promise.resolve(Response.json({ build: 'next-deploy' }))
        : realFetch(input, init);
  });
  await page.reload();
  await expectActiveTitle(page, 'Início');
  await expect(page.getByText('Nova versão disponível')).toBeVisible({ timeout: 15_000 });

  const reloaded = page.waitForEvent('load');
  await page.locator('ion-toast').getByRole('button', { name: 'Atualizar' }).click();
  await reloaded;
  await expect(page.getByText('Nova versão disponível')).toBeHidden();
  await expect
    .poll(() =>
      page.evaluate(async () => (await navigator.serviceWorker.getRegistration())?.waiting),
    )
    .toBeFalsy();
});

test('sem deploy novo, procurar atualização diz que está em dia', async ({ page }) => {
  await page.goto('tabs/more/settings');
  await skipOnboarding(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await page.getByRole('button', { name: 'Procurar atualização' }).click();
  await expect(page.getByText('Vocês já estão na versão mais recente.')).toBeVisible();
});

test('abre sem internet depois da primeira visita', async ({ page, context }) => {
  await page.goto('./');
  await skipOnboarding(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.waitForTimeout(500);
  await page.reload();
  await expectActiveTitle(page, 'Início');

  await context.setOffline(true);
  await page.reload();
  await expectActiveTitle(page, 'Início');
  await gotoTab(page, 'Mais');
  await expectActiveTitle(page, 'Mais');
  await context.setOffline(false);
});

test.describe('telas', () => {
  for (const colorScheme of ['light', 'dark'] as const) {
    test.describe(colorScheme, () => {
      test.use({ colorScheme });
      test.setTimeout(90_000);

      test(`captura as telas do app (${colorScheme})`, async ({ page }, testInfo) => {
        const shot = (name: string) => saveScreen(page, testInfo, 'app', name);
        await loadSeed(page);

        await page.goto('tabs/home');
        await expectActiveTitle(page, 'Início');
        await shot('home');
        await page.evaluate(() =>
          (
            document.querySelector('.ion-page ion-content') as unknown as {
              scrollToPoint: (x: number, y: number) => Promise<void>;
            }
          ).scrollToPoint(0, 560),
        );
        await shot('home-scrolled');

        await gotoTab(page, 'Lançamentos');
        await expect(page.getByText('Internet').locator('visible=true').first()).toBeVisible();
        await shot('transactions');

        await page.getByRole('button', { name: 'Novo lançamento' }).click();
        await page
          .locator('ion-action-sheet')
          .getByRole('button', { name: 'Despesa', exact: true })
          .click();
        await expect(page.getByRole('group', { name: 'Teclado de valor' })).toBeVisible();
        await shot('form');
        await page.getByRole('button', { name: 'Cancelar' }).click();
        await expect(page.getByRole('group', { name: 'Teclado de valor' })).toBeHidden();

        const routes: [string, string, string][] = [
          ['tabs/planning', 'Planejamento', 'fixed'],
          ['tabs/planning?view=future', 'Planejamento', 'future'],
          ['tabs/planning?view=budgets', 'Planejamento', 'budgets'],
          ['tabs/more/salaries', 'Salários', 'salaries'],
          ['tabs/more/simulator', 'Simulador', 'simulator'],
          ['tabs/more/share', 'Compartilhar', 'share'],
          ['tabs/planning?view=goals', 'Planejamento', 'goals'],
          ['tabs/more/couple', 'Acerto do mês', 'couple'],
          ['tabs/more/incomes', 'Outras rendas', 'incomes'],
          ['tabs/more/accounts', 'Contas', 'accounts'],
          ['tabs/more/cards', 'Cartões', 'cards'],
          ['tabs/more/reports', 'Relatórios', 'reports'],
          ['tabs/more/ai', 'Pedir para uma IA', 'ai'],
          ['tabs/more/import', 'Importar extrato', 'import'],
          ['tabs/more/backup', 'Backup', 'backup'],
          ['tabs/more/health', 'Saúde dos dados', 'health'],
          ['tabs/more/settings', 'Ajustes', 'settings'],
          ['tabs/more/categories', 'Categorias', 'categories'],
          ['tabs/more', 'Mais', 'more'],
          ['install', 'Instalar', 'install-guide'],
          ['debug', 'Diagnóstico', 'debug'],
        ];
        for (const [path, title, name] of routes) {
          await page.goto(path);
          await expectActiveTitle(page, title);
          await shot(name);
        }

        await page.goto('tabs/planning?view=goals');
        await page.locator('a.row', { hasText: 'Casamento' }).click();
        await expectActiveTitle(page, 'Casamento');
        await shot('goal-detail');

        await page.goto('tabs/more/accounts');
        await page.locator('a.row', { hasText: 'Conta conjunta' }).click();
        await expectActiveTitle(page, 'Conta conjunta');
        await shot('account-detail');

        await page.goto('tabs/more/cards');
        await page.locator('a.row', { hasText: 'Cartão A' }).click();
        await expectActiveTitle(page, 'Cartão A');
        await shot('card-detail');

        await page.goto('tabs/more/reports');
        await expectActiveTitle(page, 'Relatórios');
        await page.getByText('Receitas × despesas').scrollIntoViewIfNeeded();
        await page.waitForTimeout(600);
        await shot('reports-charts');
      });
    });
  }
});
