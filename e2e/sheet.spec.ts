import { expect, test, type Page } from '@playwright/test';
import { expectActiveTitle, simulateSafeArea, skipOnboarding } from './helpers';

/** Google's side, in memory: a real sign-in needs a real account. */
async function fakeGoogle(page: Page) {
  await page.addInitScript(() => {
    const store = {
      rows: [] as string[][],
      invited: [] as unknown[],
      posts: 0,
    };
    (window as unknown as { fakeSheet: typeof store }).fakeSheet = store;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = decodeURIComponent(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes('oauth2/v3/userinfo')) return Response.json({ email: 'casal@example.com' });
      if (url.includes('/permissions')) {
        store.invited.push(body.emailAddress);
        return Response.json({ id: 'p1' });
      }
      if (!url.includes('sheets.googleapis.com')) return realFetch(input, init);
      store.posts += 1;
      if (url.endsWith('/spreadsheets')) return Response.json({ spreadsheetId: 'fake-sheet' });
      if (url.includes(':batchUpdate')) {
        for (const { range, values } of body.data) {
          const row = /dados!A(\d+):/.exec(range)?.[1];
          if (row && row !== '1') store.rows[Number(row) - 2] = values[0];
        }
        return Response.json({});
      }
      if (url.includes(':append')) {
        store.rows.push(...body.values);
        return Response.json({});
      }
      return Response.json({ values: store.rows });
    };
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () => callback({ access_token: 'fake', expires_in: 3599 }),
          }),
        },
      },
    };
  });
}

const sheetRows = (page: Page) =>
  page.evaluate(() => (window as unknown as { fakeSheet: { rows: string[][] } }).fakeSheet.rows);

test('cria a planilha, envia os dados, convida e manda as mudanças sozinho', async ({
  page,
}, testInfo) => {
  await simulateSafeArea(page, testInfo);
  await fakeGoogle(page);
  await page.goto('tabs/more/share');
  await skipOnboarding(page);
  await expectActiveTitle(page, 'Compartilhar');

  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(page.getByText('Conectado como casal@example.com')).toBeVisible();
  await page.getByRole('button', { name: 'Criar a planilha do casal' }).click();
  await expect(page.getByText('Planilha criada.').locator('visible=true')).toBeVisible();
  await expect.poll(async () => (await sheetRows(page)).length).toBeGreaterThan(10);

  await page.getByRole('textbox', { name: 'Gmail de quem vai dividir' }).fill('ana@example.com');
  await page.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByText('Convite enviado por e-mail.').locator('visible=true')).toBeVisible();

  await page.getByRole('button', { name: 'Novo lançamento' }).click();
  await page
    .locator('ion-action-sheet')
    .getByRole('button', { name: /Conta fixa/ })
    .click();
  await page.getByRole('textbox', { name: 'Nome da conta' }).fill('Aluguel de teste');
  await page.getByRole('textbox', { name: 'Valor da conta' }).fill('150000');
  await page.locator('ion-modal').getByRole('button', { name: 'Salvar' }).click();
  await expect
    .poll(async () => JSON.stringify(await sheetRows(page)), { timeout: 15_000 })
    .toContain('Aluguel de teste');
});

test('quando o login vence, a Início pede um toque e sincroniza', async ({ page }, testInfo) => {
  await simulateSafeArea(page, testInfo);
  await fakeGoogle(page);
  await page.goto('tabs/more/share');
  await skipOnboarding(page);
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByRole('button', { name: 'Criar a planilha do casal' }).click();
  await expect.poll(async () => (await sheetRows(page)).length).toBeGreaterThan(10);

  await page.evaluate(() => localStorage.removeItem('duo-google-token'));
  await page.goto('tabs/home');
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(page.getByText('Atualizar com a planilha')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('duo-google-token')))
    .toContain('fake');
});
