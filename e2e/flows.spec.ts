import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  expectActiveTitle,
  gotoTab,
  loadSeed,
  openAdd,
  saveForm,
  simulateSafeArea,
  skipOnboarding,
  typeAmount,
} from './helpers';

test.beforeEach(async ({ page }, testInfo) => {
  await simulateSafeArea(page, testInfo);
});

test('onboarding: passa pelas 3 telas e cria as contas com os nomes', async ({ page }) => {
  await page.goto('./');
  await expect(page.getByText('Lance um gasto em segundos')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Dividam de um jeito justo')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Realizem sonhos juntos')).toBeVisible();
  await page.getByRole('button', { name: 'Continuar' }).click();
  await page.getByRole('textbox', { name: 'Nome de quem divide com você' }).fill('Ana');
  await page.getByRole('button', { name: 'Começar' }).click();

  await expectActiveTitle(page, 'Início');
  await expect(page.getByText('Conta de Patrick')).toBeVisible();
  await expect(page.getByText('Conta de Ana')).toBeVisible();

  await page.reload();
  await expectActiveTitle(page, 'Início');
  await expect(page.getByText('Lance um gasto em segundos')).toBeHidden();
});

test('lança despesa com no máximo 4 toques depois do +, sem contar os dígitos', async ({
  page,
}) => {
  await page.goto('./');
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'Novo lançamento' }).click();

  await page
    .locator('ion-action-sheet')
    .getByRole('button', { name: 'Despesa', exact: true })
    .click(); // 1
  await typeAmount(page, '4590');
  await expect(page.getByRole('button', { name: /Valor: R\$ 45,90/ })).toBeVisible();
  await page.getByRole('button', { name: 'Mercado', exact: true }).click(); // 2
  await page.getByRole('button', { name: 'Salvar', exact: true }).click(); // 3

  await expect(page.getByRole('group', { name: 'Teclado de valor' })).toBeHidden();
  await expect(page.getByText('-R$ 45,90').first()).toBeVisible();
  await gotoTab(page, 'Lançamentos');
  await expect(page.getByText('Mercado').first()).toBeVisible();
});

test('10 gastos em menos de 1 minuto com "Salvar e criar outro"', async ({ page }) => {
  await page.goto('./');
  await skipOnboarding(page);
  const start = Date.now();
  await openAdd(page, 'Despesa');
  for (let i = 1; i <= 10; i++) {
    await typeAmount(page, `${i}00`);
    await page.getByRole('button', { name: 'Restaurantes', exact: true }).click();
    await page.getByRole('button', { name: 'Salvar e criar outro' }).click();
    await expect(page.getByRole('button', { name: /Valor: R\$ 0,00/ })).toBeVisible();
  }
  await page.getByRole('button', { name: 'Cancelar' }).click();
  expect(Date.now() - start).toBeLessThan(60_000);

  await expect(page.getByText('-R$ 55,00').first()).toBeVisible();
});

test('editar, excluir com desfazer, ocultar valores e persistir', async ({ page }) => {
  await page.goto('./');
  await skipOnboarding(page);
  await openAdd(page, 'Despesa');
  await typeAmount(page, '1000');
  await page.getByRole('textbox', { name: 'Descrição' }).fill('Padaria');
  await page.getByRole('button', { name: 'Mercado', exact: true }).click();
  await saveForm(page);

  await gotoTab(page, 'Lançamentos');
  await page.getByRole('button', { name: /Padaria/ }).click();
  await page.getByRole('button', { name: /Valor: R\$ 10,00/ }).click();
  await typeAmount(page, '0');
  await saveForm(page);
  await expect(page.getByRole('button', { name: /Padaria.*-R\$ 100,00/ })).toBeVisible();

  await page.getByRole('button', { name: /Padaria/ }).click();
  await page.getByRole('button', { name: 'Excluir' }).click();
  await expect(page.getByText('Lançamento excluído')).toBeVisible();
  await expect(page.getByRole('button', { name: /Padaria/ })).toBeHidden();
  await page.locator('ion-toast').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByRole('button', { name: /Padaria/ })).toBeVisible();

  await gotoTab(page, 'Início');
  await page.getByRole('button', { name: 'Ocultar valores' }).click();
  await expect(page.getByText('R$ ••••').first()).toBeVisible();
  await expect(page.getByText('R$ 100,00')).toBeHidden();
  await page.reload();
  await expect(page.getByText('R$ ••••').first()).toBeVisible();
});

test('transferência muda os dois saldos e não conta como gasto', async ({ page }) => {
  await page.goto('./');
  await skipOnboarding(page);
  await openAdd(page, 'Transferência');
  await typeAmount(page, '25000');
  await saveForm(page);

  const row = (name: string) => page.locator('a.row', { hasText: name });
  await expect(row('Conta de Patrick').getByText('-R$ 250,00')).toBeVisible();
  await expect(row('Conta de Pessoa B').getByText('R$ 250,00')).toBeVisible();
});

test('compra parcelada no cartão, limite e pagamento da fatura', async ({ page }) => {
  await page.goto('tabs/more/cards');
  await skipOnboarding(page);
  await expectActiveTitle(page, 'Cartões');
  await page.getByRole('button', { name: 'Cadastrar cartão' }).click();
  await page.getByRole('textbox', { name: 'Nome do cartão' }).fill('Cartão A');
  await page.getByRole('textbox', { name: 'Limite' }).fill('500000');
  await page.locator('ion-modal').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('a.row', { hasText: 'Cartão A' })).toBeVisible();

  await openAdd(page, 'Despesa no cartão');
  await typeAmount(page, '60000');
  await page.getByRole('textbox', { name: 'Descrição' }).fill('Sofá');
  await page.getByRole('button', { name: 'Mercado', exact: true }).click();
  await page.getByRole('button', { name: /Mais opções/ }).click();
  const details = page.locator('ion-modal').filter({ hasText: 'Repetir' });
  await details.getByRole('radio', { name: 'Parcelado' }).click();
  await details.getByRole('textbox', { name: 'Número de parcelas' }).fill('6');
  await details.getByRole('button', { name: 'Pronto' }).click();
  await saveForm(page);

  await page.locator('a.row', { hasText: 'Cartão A' }).click();
  await expectActiveTitle(page, 'Cartão A');
  await expect(page.locator('.stat-value', { hasText: 'R$ 4.400,00' })).toBeVisible();
  await page.getByRole('button', { name: 'Próxima fatura' }).click();
  await expect(page.getByText('Sofá').first()).toBeVisible();
  await expect(page.getByText('R$ 100,00').first()).toBeVisible();
  await page.getByRole('button', { name: 'Fatura anterior' }).click();

  await page.getByRole('button', { name: 'Pagar fatura' }).click();
  await page
    .locator('ion-modal')
    .filter({ hasText: 'Pagar com' })
    .getByRole('button', { name: 'Pagar', exact: true })
    .click();
  await expect(page.getByText('Paga', { exact: true })).toBeVisible();
  await expect(page.locator('.stat-value', { hasText: 'R$ 4.500,00' })).toBeVisible();
});

test('acerto do casal: registrar e fechar o mês', async ({ page }) => {
  await loadSeed(page);
  await page.goto('tabs/more/couple');
  await expectActiveTitle(page, 'Acerto do mês');
  await expect(page.getByText(/manda R\$ .* para|Tudo certo entre vocês/)).toBeVisible();

  if (await page.getByRole('button', { name: 'Registrar acerto' }).isVisible()) {
    await page.getByRole('button', { name: 'Registrar acerto' }).click();
    await page
      .locator('ion-modal')
      .filter({ hasText: 'Sai da conta' })
      .getByRole('button', { name: 'Salvar' })
      .click();
    await expect(page.getByText('Tudo certo entre vocês')).toBeVisible();
  }

  await page.getByRole('button', { name: /^Fechar / }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Fechar mês' }).click();
  await expect(page.getByText('Mês fechado')).toBeVisible();
  await page.getByRole('button', { name: 'Reabrir mês' }).click();
  await expect(page.getByText('Mês fechado')).toBeHidden();
});

test('pacote para IA → change-set → revisão → aplicar → desfazer', async ({ page }) => {
  await page.goto('tabs/more/ai');
  await skipOnboarding(page);
  await expectActiveTitle(page, 'Pedir para uma IA');

  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Compartilhar arquivo' }).click();
  const file = await (await download).path();
  const pkg = JSON.parse(readFileSync(file, 'utf8'));
  expect(pkg.format).toBe('duo-ai-export');
  const account = pkg.lookups.accounts[0].id;
  const category = pkg.lookups.categories.find((c: { name: string }) => c.name === 'Mercado').id;

  const answer = {
    format: 'duo-changeset',
    schemaVersion: 1,
    basedOnExportId: pkg.exportId,
    summary: 'Lancei a compra da padaria',
    questions: ['Essa compra foi de vocês dois?'],
    operations: [
      {
        op: 'create',
        entity: 'transaction',
        tempId: 'tmp:1',
        data: {
          amountCents: 4321,
          description: 'Padaria da IA',
          date: new Date().toISOString().slice(0, 10),
          accountId: account,
          categoryId: category,
        },
        reason: 'Linha 1 da fatura',
      },
      { op: 'update', entity: 'transaction', id: 'nao-existe', patch: {} },
    ],
  };
  await page
    .getByRole('textbox', { name: 'Resposta da IA' })
    .fill(`Claro! Aqui está:\n\`\`\`json\n${JSON.stringify(answer)}\n\`\`\``);
  await page.getByRole('button', { name: 'Revisar mudanças' }).click();

  const sheet = page.locator('ion-modal').filter({ hasText: 'Lancei a compra da padaria' });
  await expect(sheet.getByText('Essa compra foi de vocês dois?')).toBeVisible();
  await expect(sheet.getByText('+1 criados')).toBeVisible();
  await expect(sheet.getByText(/Não existe transaction/)).toBeVisible();
  await sheet.getByRole('button', { name: 'Aplicar 1' }).click();

  await expect(page.getByText('Aplicado: Lancei a compra da padaria')).toBeVisible();
  await page
    .locator('ion-modal')
    .filter({ hasText: 'Saúde dos dados' })
    .getByRole('button', { name: 'Cancelar' })
    .click();

  await gotoTab(page, 'Lançamentos');
  await expect(page.getByRole('button', { name: /Padaria da IA/ })).toBeVisible();

  await page.goto('tabs/more/history');
  await page.getByRole('button', { name: 'Desfazer' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Desfazer' }).click();
  await expect(page.getByText(/desfeita/)).toBeVisible();
  await page.goto('tabs/transactions');
  await expect(page.getByRole('button', { name: /Padaria da IA/ })).toBeHidden();
});

test('importa OFX, reconhece repetidos na segunda vez', async ({ page }) => {
  await page.goto('tabs/more/import');
  await skipOnboarding(page);
  await expectActiveTitle(page, 'Importar extrato');
  const ofx = {
    name: 'extrato.ofx',
    mimeType: 'application/x-ofx',
    buffer: Buffer.from(
      'OFXHEADER:100\nCHARSET:1252\n\n<OFX><STMTTRN><DTPOSTED>' +
        new Date().toISOString().slice(0, 10).replace(/-/g, '') +
        '<TRNAMT>-41,35<FITID>F1<MEMO>PADARIA S\xC3O JO\xC3O</STMTTRN></OFX>',
      'latin1',
    ),
  };
  const input = page.getByLabel('Arquivo de extrato');
  await input.setInputFiles(ofx);
  await expect(page.getByText('PADARIA SÃO JOÃO')).toBeVisible();
  await page.getByRole('button', { name: 'Importar 1 lançamentos' }).click();
  await expect(page.getByText(/Importação concluída/)).toBeVisible();

  await input.setInputFiles(ofx);
  await expect(page.getByText('Já importado')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Importar 0 lançamentos' })).toBeDisabled();
});

test('backup: exporta e restaura depois de perder os dados', async ({ page }) => {
  await page.goto('./');
  await skipOnboarding(page);
  await openAdd(page, 'Despesa');
  await typeAmount(page, '1234');
  await page.getByRole('textbox', { name: 'Descrição' }).fill('Antes do backup');
  await page.getByRole('button', { name: 'Mercado', exact: true }).click();
  await saveForm(page);

  await page.goto('tabs/more/backup');
  await expectActiveTitle(page, 'Backup');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Exportar backup' }).click();
  const file = await (await download).path();
  const backup = readFileSync(file);
  await expect(page.getByText(/Último backup/)).toBeVisible();

  await page.goto('tabs/more/accounts');
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const request = indexedDB.deleteDatabase('duo');
        request.onsuccess = request.onerror = request.onblocked = () => resolve(null);
      }),
  );
  await page.reload();
  await skipOnboarding(page);
  await page.goto('tabs/more/backup');
  await page
    .getByLabel('Arquivo de backup')
    .setInputFiles({ name: 'duo-backup.json', mimeType: 'application/json', buffer: backup });
  await page.getByRole('radio', { name: 'Substituir tudo' }).click();
  await page.getByRole('button', { name: 'Restaurar' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Continuar' }).click();
  await expect(page.getByText('Essa ação não pode ser desfeita.')).toBeVisible();
  await page
    .locator('ion-alert', { hasText: 'Tem certeza' })
    .getByRole('button', { name: 'Substituir tudo' })
    .click();
  await expect(page.getByText('Backup restaurado.')).toBeVisible();
  await page.goto('tabs/transactions');
  await expect(page.getByRole('button', { name: /Antes do backup/ })).toBeVisible();
});

test('trava com PIN pede o código e aceita o certo', async ({ page }) => {
  await page.goto('tabs/more/settings');
  await skipOnboarding(page);
  await page.locator('ion-toggle', { hasText: 'Bloquear com PIN' }).click();
  await page.getByRole('textbox', { name: 'Novo PIN' }).fill('1234');
  await page.getByRole('textbox', { name: 'Repita o PIN' }).fill('1234');
  await page.locator('ion-modal').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.getByRole('textbox', { name: 'Novo PIN' })).toBeHidden({ timeout: 15_000 });

  await page.reload();
  const lock = page.getByRole('dialog', { name: 'App bloqueado' });
  await expect(lock).toBeVisible();
  const pad = page.getByRole('group', { name: 'Teclado do PIN' });
  for (const d of '1234') await pad.getByRole('button', { name: d, exact: true }).click();
  await expect(lock).toBeHidden({ timeout: 15_000 });
});

test('funciona offline com dados: lança sem internet e mantém depois', async ({
  page,
  context,
}) => {
  await page.goto('./');
  await skipOnboarding(page);
  await page.evaluate(() => navigator.serviceWorker.ready);
  await page.reload();
  await expectActiveTitle(page, 'Início');

  await context.setOffline(true);
  await page.reload();
  await expectActiveTitle(page, 'Início');
  await openAdd(page, 'Despesa');
  await typeAmount(page, '700');
  await page.getByRole('textbox', { name: 'Descrição' }).fill('Sem internet');
  await page.getByRole('button', { name: 'Mercado', exact: true }).click();
  await saveForm(page);
  await page.reload();
  await gotoTab(page, 'Lançamentos');
  await expect(page.getByRole('button', { name: /Sem internet/ })).toBeVisible();
  await context.setOffline(false);
});
