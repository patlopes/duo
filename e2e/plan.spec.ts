import { expect, test } from '@playwright/test';
import { expectActiveTitle, gotoTab, loadSeed, saveScreen, simulateSafeArea } from './helpers';

test.beforeEach(async ({ page }, testInfo) => {
  await simulateSafeArea(page, testInfo);
  await loadSeed(page);
  await page.goto('tabs/home');
  await expectActiveTitle(page, 'Início');
});

test('a Início soma as rendas e diz quanto cabe a cada um', async ({ page }) => {
  await expect(page.locator('.hero-amount')).toHaveText('R$ 13.500,00');
  await expect(page.getByRole('button', { name: /Pela renda/ })).toHaveText(/59% e 41%/);

  const amounts = page.locator('.person-amount');
  const proportional = await amounts.first().innerText();
  await page.getByRole('button', { name: /Metade para cada/ }).click();
  await expect(amounts.first()).not.toHaveText(proportional);
  // The amounts count up, so they are compared once they settle. An odd total leaves one cent over.
  const cents = async (i: number) => Number((await amounts.nth(i).innerText()).replace(/\D/g, ''));
  await expect
    .poll(async () => Math.abs((await cents(0)) - (await cents(1))))
    .toBeLessThanOrEqual(1);

  await page.getByRole('button', { name: /Pela renda/ }).click();
  await expect(amounts.first()).toHaveText(proportional);
});

test('marcar a transferência para a conjunta e desfazer', async ({ page }) => {
  const call = page.locator('.call', { hasText: 'Pessoa B' });
  await expect(call).toContainText('para a conjunta');
  await call.getByRole('button', { name: 'Transferi' }).click();
  await expect(call).toBeHidden();
  await page.locator('ion-toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(call).toBeVisible();
});

test('conta fixa aparece neste mês e nos próximos; pagar é um toque', async ({ page }) => {
  await page.getByRole('button', { name: 'Conta', exact: false }).first().click();
  await page.getByRole('textbox', { name: 'Nome da conta' }).fill('Diarista');
  await page.getByRole('textbox', { name: 'Valor da conta' }).fill('40000');
  await page.locator('ion-modal').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByText('Conta fixa criada para todos os meses')).toBeVisible();

  const bucket = page.locator('.bucket', { hasText: 'Diarista' });
  await bucket.locator('.bucket-head').first().click();
  const check = page.getByRole('checkbox', { name: /Diarista/ });
  await check.click();
  await expect(check).toHaveAttribute('aria-checked', 'true');

  await gotoTab(page, 'Planejamento');
  await expect(page.getByRole('button', { name: /Diarista/ })).toBeVisible();
});

test('tocar no gráfico da Início abre o resumo', async ({ page }, testInfo) => {
  await page.locator('.donut-legend-row', { hasText: 'Moradia' }).click();
  const sheet = page.locator('ion-modal').filter({ hasText: 'Aluguel' });
  await expect(sheet).toBeVisible();
  await expect(sheet.getByText('Condomínio')).toBeVisible();
  await saveScreen(page, testInfo, 'app', 'home-chart-sheet');
});

test('o simulador mostra o efeito de um aumento e só salva quando pedem', async ({ page }) => {
  await page.getByRole('link', { name: 'Simular' }).click();
  await expectActiveTitle(page, 'Simulador');
  await expect(page.getByText('nada aqui muda')).toBeVisible();
  const salary = page.getByRole('textbox', { name: /Salário simulado de Pessoa B/ });
  await salary.fill('900000');
  await expect(page.locator('.sim-delta').first()).toBeVisible();

  await page.goBack();
  await expect(page.locator('.hero-amount')).toHaveText('R$ 13.500,00');
});
