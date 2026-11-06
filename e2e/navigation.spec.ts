import { expect, test, type Page } from '@playwright/test';
import { gotoTab, loadSeed, simulateSafeArea } from './helpers';

const back = (page: Page) => page.locator('ion-back-button:not(.ion-cloned-element):visible');
const tapLink = (page: Page, name: string | RegExp) =>
  page.getByRole('link', { name }).locator('visible=true').first().click();

/** Going back restores the scroll, so the large title may be collapsed: the toolbar one always exists. */
async function expectScreen(page: Page, title: string): Promise<void> {
  await expect(
    page
      .locator('ion-header:not(.header-collapse-condense) ion-title', { hasText: title })
      .locator('visible=true'),
  ).toBeVisible();
}

test.beforeEach(async ({ page }, testInfo) => {
  await simulateSafeArea(page, testInfo);
  await loadSeed(page);
  await page.goto('tabs/home');
  await expectScreen(page, 'Início');
});

/** Navigation is exercised by tapping: the back bug never showed up when tests opened screens by URL. */
test('toda tela aberta pelo Mais volta para o Mais', async ({ page }) => {
  for (const [link, title] of [
    [/Salários/, 'Salários'],
    [/Simulador/, 'Simulador'],
    [/Compartilhar/, 'Compartilhar'],
    [/Contas/, 'Contas'],
    [/Relatórios/, 'Relatórios'],
    [/Backup/, 'Backup'],
    [/Ajustes/, 'Ajustes'],
  ] as const) {
    await gotoTab(page, 'Mais');
    await expectScreen(page, 'Mais');
    await tapLink(page, link);
    await expectScreen(page, title);
    await back(page).click();
    await expectScreen(page, 'Mais');
  }
});

test('o Simular da Início volta para a Início, não para o Mais', async ({ page }) => {
  await tapLink(page, 'Simular');
  await expectScreen(page, 'Simulador');
  await expect(page).toHaveURL(/tabs\/home\/simulator/);
  await back(page).click();
  await expectScreen(page, 'Início');
  await expect(page).toHaveURL(/tabs\/home$/);
});

test('trocar de aba no meio de uma pilha não mistura as pilhas', async ({ page }) => {
  await gotoTab(page, 'Mais');
  await tapLink(page, /Contas/);
  await expectScreen(page, 'Contas');
  await gotoTab(page, 'Início');
  await expectScreen(page, 'Início');
  await tapLink(page, 'Simular');
  await expectScreen(page, 'Simulador');
  await back(page).click();
  await expectScreen(page, 'Início');
  await gotoTab(page, 'Mais');
  await expect(page).toHaveURL(/tabs\/more/);
});

test('o voltar do sistema refaz o caminho', async ({ page }) => {
  await gotoTab(page, 'Mais');
  await tapLink(page, /Simulador/);
  await expectScreen(page, 'Simulador');
  await page.goBack();
  await expectScreen(page, 'Mais');
});

test('link direto ainda tem para onde voltar', async ({ page }) => {
  await page.goto('tabs/more/simulator');
  await expectScreen(page, 'Simulador');
  await back(page).click();
  await expectScreen(page, 'Mais');
});

test('rede lenta: a tela nova aparece com o voltar, mesmo com o toque duplo', async ({ page }) => {
  await page.route('**/assets/**', async (route) => {
    await new Promise((resolve) => setTimeout(resolve, 400));
    await route.continue();
  });
  await gotoTab(page, 'Mais');
  await page
    .getByRole('link', { name: /Relatórios/ })
    .locator('visible=true')
    .first()
    .dblclick();
  await expectScreen(page, 'Relatórios');
  await back(page).click();
  await expectScreen(page, 'Mais');
});
