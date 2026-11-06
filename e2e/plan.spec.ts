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
  await expect(page.getByRole('button', { name: /^Diarista/ })).toBeVisible();
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

test('corrigir o salário a partir da Início muda a renda somada', async ({ page }) => {
  await page.getByRole('button', { name: 'Editar salários' }).click();
  await expectActiveTitle(page, 'Salários');
  await page.getByRole('button', { name: 'Editar', exact: true }).first().click();
  await page.getByRole('textbox', { name: 'Salário', exact: true }).fill('900000');
  await page.locator('ion-modal').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('.big-money').first()).toHaveText('R$ 9.000,00');
  await page.locator('ion-back-button:not(.ion-cloned-element):visible').click();
  await expect(page.locator('.hero-amount')).toHaveText('R$ 14.500,00');

  // A correction stays after opening the app again, and doesn't leave the wrong amount behind.
  await page.reload();
  await expect(page.locator('.hero-amount')).toHaveText('R$ 14.500,00');
});

test('muda o nome ao lado do bichinho direto na Início', async ({ page }) => {
  await page.getByRole('button', { name: 'Mudar o nome de Pessoa B' }).click();
  await page.getByRole('textbox', { name: 'Nome da pessoa 2' }).fill('Ana');
  await page.locator('ion-modal').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('.person-name', { hasText: 'Ana' })).toBeVisible();
  await expect(page.locator('.person-name', { hasText: 'Pessoa B' })).toHaveCount(0);
});

test('conta fixa some da lista pela lixeira: esta e as próximas, e não volta', async ({ page }) => {
  const toPay = await page.locator('.hero-strong').first().innerText();
  await page.locator('.bucket-head', { hasText: 'Contas do casal' }).click();
  await page.getByRole('button', { name: 'Excluir Internet' }).click();
  await page
    .locator('ion-action-sheet')
    .getByRole('button', { name: 'Esta e as próximas' })
    .click();

  await expect(page.getByText('contas excluídas').locator('visible=true')).toBeVisible();
  await expect(page.getByRole('button', { name: /^Internet/ })).toBeHidden();
  await expect(page.locator('.hero-strong').first()).not.toHaveText(toPay);

  await page.reload();
  await expect(page.locator('.hero-amount')).toHaveText('R$ 13.500,00');
  await page.locator('.bucket-head', { hasText: 'Contas do casal' }).click();
  await expect(page.getByRole('button', { name: /^Plano de saúde/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^Internet/ })).toBeHidden();

  await gotoTab(page, 'Planejamento');
  await expect(page.getByRole('button', { name: 'Excluir Plano de saúde' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Excluir Internet' })).toBeHidden();
});

test('dá para desfazer a exclusão e excluir também pelo formulário', async ({ page }) => {
  await page.locator('.bucket-head', { hasText: 'Contas do casal' }).click();
  await page.getByRole('button', { name: 'Excluir Internet' }).click();
  await page.locator('ion-action-sheet').getByRole('button', { name: 'Só esta' }).click();
  await expect(page.getByRole('button', { name: /^Internet/ })).toBeHidden();
  await page.locator('ion-toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('button', { name: /^Internet/ })).toBeVisible();

  await page.getByRole('button', { name: /^Internet/ }).click();
  await page.getByRole('button', { name: 'Excluir conta' }).click();
  await page.locator('ion-action-sheet').getByRole('button', { name: 'Todas' }).click();
  await expect(page.getByRole('button', { name: 'Excluir conta' })).toBeHidden();
  await expect(page.getByRole('button', { name: /^Internet/ })).toBeHidden();
});

test('no resumo do gráfico, tocar numa conta abre para editar ou excluir', async ({ page }) => {
  await page.locator('.donut-legend-row', { hasText: 'Moradia' }).click();
  await page
    .locator('ion-modal')
    .getByRole('button', { name: /Aluguel/ })
    .click();
  await expect(page.getByRole('button', { name: 'Excluir conta' })).toBeVisible();
});
