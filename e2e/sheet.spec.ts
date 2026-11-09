import { expect, test, type Page } from '@playwright/test';
import { expectActiveTitle, simulateSafeArea } from './helpers';

type FakeOptions = {
  email: string;
  rows?: string[][];
  found?: string | null;
  lockedUntilPicked?: boolean;
};

/** Google's side, in memory: a real sign-in needs a real account. */
async function fakeGoogle(page: Page, options: FakeOptions) {
  await page.addInitScript((o: FakeOptions) => {
    const saved = localStorage.getItem('fake-rows');
    const store = {
      rows: (saved ? JSON.parse(saved) : (o.rows ?? [])) as string[][],
      invited: [] as string[],
      picked: !o.lockedUntilPicked,
    };
    const persist = () => localStorage.setItem('fake-rows', JSON.stringify(store.rows));
    (window as unknown as { fakeSheet: typeof store }).fakeSheet = store;
    const realFetch = window.fetch.bind(window);
    window.fetch = async (input, init) => {
      const url = decodeURIComponent(String(input));
      const body = init?.body ? JSON.parse(String(init.body)) : {};
      if (url.includes('oauth2/v3/userinfo')) {
        return Response.json({ email: localStorage.getItem('fake-email') ?? o.email });
      }
      if (url.includes('/permissions')) {
        store.invited.push(body.emailAddress);
        return Response.json({ id: 'p1' });
      }
      if (url.includes('drive/v3/files')) {
        return Response.json({ files: o.found ? [{ id: o.found, ownedByMe: true }] : [] });
      }
      if (!url.includes('sheets.googleapis.com')) return realFetch(input, init);
      if (!store.picked) return new Response('{}', { status: 404 });
      if (url.endsWith('/spreadsheets')) return Response.json({ spreadsheetId: 'fake-sheet' });
      if (url.includes(':batchUpdate')) {
        for (const { range, values } of body.data) {
          const row = /dados!A(\d+):/.exec(range)?.[1];
          if (row && row !== '1') store.rows[Number(row) - 2] = values[0];
        }
        persist();
        return Response.json({});
      }
      if (url.includes(':append')) {
        store.rows.push(...body.values);
        persist();
        return Response.json({});
      }
      return Response.json({ values: store.rows });
    };
    const chain = {
      addView: () => chain,
      setAppId: () => chain,
      setDeveloperKey: () => chain,
      setOAuthToken: () => chain,
      setOrigin: () => chain,
      setSize: () => chain,
      setTitle: () => chain,
      setCallback: (done: (r: unknown) => void) => {
        (chain as unknown as { done: typeof done }).done = done;
        return chain;
      },
      build: () => ({
        dispose: () => undefined,
        setVisible: () => {
          store.picked = true;
          (chain as unknown as { done: (r: unknown) => void }).done({
            action: 'picked',
            docs: [{ id: 'fake-sheet' }],
          });
        },
      }),
    };
    (window as unknown as { google: unknown }).google = {
      accounts: {
        oauth2: {
          initTokenClient: ({ callback }: { callback: (r: unknown) => void }) => ({
            requestAccessToken: () => callback({ access_token: 'fake', expires_in: 3599 }),
          }),
        },
      },
      picker: {
        PickerBuilder: function () {
          return chain;
        },
        DocsView: function () {
          return { setMode: () => null, setQuery: () => null, setFileIds: () => null };
        },
        ViewId: { SPREADSHEETS: 'spreadsheets' },
        DocsViewMode: { LIST: 'list' },
        Action: { PICKED: 'picked', CANCEL: 'cancel' },
      },
    };
  }, options);
}

const sheetRows = (page: Page) =>
  page.evaluate(() => (window as unknown as { fakeSheet: { rows: string[][] } }).fakeSheet.rows);

/** A couple's phone: signed in from the first screen, with one fixed bill in the sheet. */
async function firstPhone(page: Page) {
  await fakeGoogle(page, { email: 'patrick@example.com' });
  await page.goto('./');
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByRole('textbox', { name: 'Seu nome' }).fill('Patrick');
  await page.getByRole('button', { name: 'Começar' }).click();
  await expectActiveTitle(page, 'Início');
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
  return sheetRows(page);
}

test('entrar na primeira tela cria a planilha e as mudanças sobem sozinhas', async ({
  page,
}, testInfo) => {
  await simulateSafeArea(page, testInfo);
  const rows = await firstPhone(page);
  expect(JSON.stringify(rows)).toContain('patrick@example.com');
});

test('num computador novo, é só entrar com o Google e ver os dados', async ({
  page,
  browser,
}, testInfo) => {
  await simulateSafeArea(page, testInfo);
  const rows = await firstPhone(page);

  const pc = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const screen = await pc.newPage();
  await fakeGoogle(screen, { email: 'patrick@example.com', rows, found: 'fake-sheet' });
  await screen.goto('./');
  await screen.getByRole('button', { name: 'Entrar com Google' }).click();

  await expectActiveTitle(screen, 'Início');
  await expect(screen.getByText('Quem são vocês?')).toBeHidden();
  await expect(screen.getByText('Boas-vindas')).toBeHidden();
  await screen.locator('.bucket-head').first().click();
  await expect(screen.getByRole('button', { name: /^Aluguel de teste/ })).toBeVisible();
  await pc.close();
});

test('o convite é um link: quem recebe entra, escolhe a planilha e vira a outra pessoa', async ({
  page,
  browser,
}, testInfo) => {
  await simulateSafeArea(page, testInfo);
  const rows = await firstPhone(page);

  await page.getByRole('button', { name: /^Convidar/ }).click();
  await page.getByRole('textbox', { name: 'Gmail de quem vai dividir' }).fill('ana@example.com');
  await page.getByRole('button', { name: 'Enviar convite' }).click();
  await expect(page.getByText('Convite enviado para ana@example.com')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Enviar o link' })).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => (window as unknown as { fakeSheet: { invited: string[] } }).fakeSheet.invited,
      ),
    )
    .toEqual(['ana@example.com']);

  const other = await browser.newContext({ baseURL: testInfo.project.use.baseURL });
  const phone = await other.newPage();
  await fakeGoogle(phone, { email: 'ana@example.com', rows, lockedUntilPicked: true });
  await phone.goto('./?convite=fake-sheet');
  await expect(phone.getByText('Você foi convidado')).toBeVisible();
  await phone.locator('.invite-gate').getByRole('button', { name: 'Entrar com Google' }).click();

  await expect(phone.getByText('Você foi convidado')).toBeHidden();
  await expectActiveTitle(phone, 'Início');
  await phone.locator('.bucket-head').first().click();
  await expect(phone.getByRole('button', { name: /^Aluguel de teste/ })).toBeVisible();
  await expect
    .poll(async () => JSON.stringify(await sheetRows(phone)))
    .toContain('ana@example.com');
  await other.close();
});

test('quando o login vence, a Início pede um toque e sincroniza', async ({ page }, testInfo) => {
  await simulateSafeArea(page, testInfo);
  await firstPhone(page);
  await page.evaluate(() => localStorage.removeItem('duo-google-token'));
  await page.goto('tabs/home');
  await page.getByRole('button', { name: 'Atualizar agora' }).click();
  await expect(page.getByText('Atualizar com a planilha')).toBeHidden();
  await expect
    .poll(() => page.evaluate(() => localStorage.getItem('duo-google-token')))
    .toContain('fake');
});

test('conta errada: Sair fica visível, os dados ficam e dá para entrar com a certa', async ({
  page,
}, testInfo) => {
  await simulateSafeArea(page, testInfo);
  await fakeGoogle(page, { email: 'errada@example.com' });
  await page.goto('./');
  await page.locator('.onboarding').getByRole('button', { name: 'Entrar com Google' }).click();
  await page.getByRole('button', { name: 'Começar' }).click();
  await expectActiveTitle(page, 'Início');

  const bar = page.locator('.account-bar').locator('visible=true');
  await expect(bar).toContainText('errada@example.com');
  await page.getByRole('button', { name: 'Conta', exact: true }).click();
  await page.getByRole('textbox', { name: 'Nome da conta' }).fill('Fica no aparelho');
  await page.getByRole('textbox', { name: 'Valor da conta' }).fill('10000');
  await page.locator('ion-modal').getByRole('button', { name: 'Salvar' }).click();
  await expect(page.locator('.bucket-head').first()).toBeVisible();

  await bar.getByRole('button', { name: 'Sair' }).click();
  await page.locator('ion-alert').getByRole('button', { name: 'Sair' }).click();
  await expect(bar).toHaveCount(0);
  await expect(page.locator('.bucket-head').first()).toBeVisible();
  await expect
    .poll(async () => JSON.stringify(await sheetRows(page)))
    .not.toContain('errada@example.com');

  await page.evaluate(() => localStorage.setItem('fake-email', 'certa@example.com'));
  await page.getByRole('button', { name: 'Entrar com Google' }).click();
  await expect(bar).toContainText('certa@example.com');
  await expect(page.getByRole('button', { name: 'Sair' }).locator('visible=true')).toBeVisible();
});

test('a barra da conta também aparece no Mais', async ({ page }, testInfo) => {
  await simulateSafeArea(page, testInfo);
  await firstPhone(page);
  await page.locator('ion-tab-button', { hasText: 'Mais' }).click();
  await expectActiveTitle(page, 'Mais');
  await expect(page.locator('.account-bar').locator('visible=true')).toContainText(
    'patrick@example.com',
  );
});

test('fechar o site no meio do login não perde o convite nem trava o botão', async ({
  page,
  context,
}, testInfo) => {
  await simulateSafeArea(page, testInfo);
  await page.addInitScript(() => {
    (window as unknown as { google: unknown }).google = {
      accounts: { oauth2: { initTokenClient: () => ({ requestAccessToken: () => undefined }) } },
    };
  });
  await page.goto('./?convite=fake-sheet');
  const enter = page.locator('.invite-gate').getByRole('button', { name: 'Entrar com Google' });
  await expect(page.locator('.invite-gate').getByText('não feche a janela dele')).toBeVisible();
  await enter.click();
  // Google's window died without telling anyone: the button can't be left disabled.
  await expect(enter).toBeEnabled();

  await page.close();
  const again = await context.newPage();
  await again.goto('./');
  await expect(again.getByText('Você foi convidado')).toBeVisible();
});
