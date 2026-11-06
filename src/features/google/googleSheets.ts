import type { SheetCells, SheetStore } from '../../io/sheetSync';

const SHEETS = 'https://sheets.googleapis.com/v4/spreadsheets';
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const DATA_TAB = 'dados';
const CHUNK = 500;

export const SHEET_TITLE = 'Meu Bem: dados do casal';

export class GoogleApiError extends Error {
  readonly status: number;
  constructor(status: number) {
    super(`O Google recusou o pedido (erro ${status}).`);
    this.status = status;
  }
}

async function call<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new GoogleApiError(response.status);
  return (await response.json()) as T;
}

const post = (body: unknown): RequestInit => ({ method: 'POST', body: JSON.stringify(body) });

async function writeRanges(
  accessToken: string,
  sheetId: string,
  data: { range: string; values: string[][] }[],
): Promise<void> {
  await call(
    `${SHEETS}/${sheetId}/values:batchUpdate`,
    accessToken,
    post({ valueInputOption: 'RAW', data }),
  );
}

export function sheetStore(accessToken: string, sheetId: string): SheetStore {
  return {
    async read() {
      const range = encodeURIComponent(`${DATA_TAB}!A2:E`);
      const result = await call<{ values?: string[][] }>(
        `${SHEETS}/${sheetId}/values/${range}`,
        accessToken,
      );
      return result.values ?? [];
    },
    async append(rows: SheetCells[]) {
      const range = encodeURIComponent(`${DATA_TAB}!A1`);
      for (let i = 0; i < rows.length; i += CHUNK) {
        await call(
          `${SHEETS}/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
          accessToken,
          post({ values: rows.slice(i, i + CHUNK) }),
        );
      }
    },
    async update(updates) {
      for (let i = 0; i < updates.length; i += CHUNK) {
        await writeRanges(
          accessToken,
          sheetId,
          updates.slice(i, i + CHUNK).map(({ rowNumber, cells }) => ({
            range: `${DATA_TAB}!A${rowNumber}:E${rowNumber}`,
            values: [cells],
          })),
        );
      }
    },
  };
}

/** The file both phones use. The first tab tells anyone who opens it not to edit the data by hand. */
export async function createCoupleSheet(accessToken: string): Promise<string> {
  const { spreadsheetId } = await call<{ spreadsheetId: string }>(
    SHEETS,
    accessToken,
    post({
      properties: { title: SHEET_TITLE },
      sheets: [{ properties: { title: 'Leia-me' } }, { properties: { title: DATA_TAB } }],
    }),
  );
  await writeRanges(accessToken, spreadsheetId, [
    {
      range: 'Leia-me!A1:A3',
      values: [
        ['Estes são os dados do casal no app Meu Bem.'],
        ['O app lê e escreve aqui sozinho: use o app para fazer mudanças.'],
        ['Apagar esta planilha desliga a sincronização, mas o que está nos celulares continua lá.'],
      ],
    },
    {
      range: `${DATA_TAB}!A1:E1`,
      values: [['Tabela', 'Id', 'Atualizado em', 'Excluído em', 'Dados']],
    },
  ]);
  return spreadsheetId;
}

export async function inviteToSheet(
  accessToken: string,
  sheetId: string,
  email: string,
): Promise<void> {
  const message = encodeURIComponent(
    'Abra o Meu Bem, vá em Mais → Compartilhar e toque em "Abrir a planilha do casal".',
  );
  await call(
    `${DRIVE}/${sheetId}/permissions?sendNotificationEmail=true&emailMessage=${message}`,
    accessToken,
    post({ type: 'user', role: 'writer', emailAddress: email }),
  );
}
