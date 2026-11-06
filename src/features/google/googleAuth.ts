/** Public by design: it identifies the app to Google. The client secret never goes in this repo. */
export const GOOGLE_CLIENT_ID =
  '758644931446-usjucdb4fvd3b0kc6e2alebr58bgllin.apps.googleusercontent.com';

// drive.file only reaches files the app itself created or was handed, never the rest of the Drive.
const SCOPES = 'openid email https://www.googleapis.com/auth/drive.file';
const GIS_URL = 'https://accounts.google.com/gsi/client';

export type GooglePrompt = '' | 'select_account';

export interface GoogleToken {
  accessToken: string;
  expiresInSeconds: number;
}

interface TokenResponse {
  access_token?: string;
  expires_in?: number | string;
  error?: string;
}

interface TokenClient {
  requestAccessToken: (config?: { prompt?: GooglePrompt }) => void;
}

declare global {
  interface Window {
    google?: {
      accounts: {
        oauth2: {
          initTokenClient: (config: {
            client_id: string;
            scope: string;
            callback: (response: TokenResponse) => void;
            error_callback: (error: { type?: string }) => void;
          }) => TokenClient;
        };
      };
    };
  }
}

const MESSAGES: Record<string, string> = {
  popup_failed_to_open: 'O aparelho bloqueou a janela do Google.',
  popup_closed: 'A janela do Google foi fechada antes de terminar.',
  access_denied: 'O Google negou o acesso. Confira se este e-mail é usuário de teste do projeto.',
};

const describe = (code?: string) =>
  MESSAGES[code ?? ''] ?? `O Google respondeu: ${code ?? 'erro'}.`;

let client: TokenClient | null = null;
let settle: { resolve: (t: GoogleToken) => void; reject: (e: Error) => void } | null = null;

/** Safari only opens the popup inside the tap itself, so this has to finish before the button works. */
export async function loadGoogle(): Promise<void> {
  if (client) return;
  if (!window.google) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = GIS_URL;
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Não deu para carregar o login do Google.'));
      document.head.append(script);
    });
  }
  client = window.google!.accounts.oauth2.initTokenClient({
    client_id: GOOGLE_CLIENT_ID,
    scope: SCOPES,
    callback: (response) => {
      if (response.access_token) {
        settle?.resolve({
          accessToken: response.access_token,
          expiresInSeconds: Number(response.expires_in ?? 0),
        });
      } else {
        settle?.reject(new Error(describe(response.error)));
      }
    },
    error_callback: (error) => settle?.reject(new Error(describe(error.type))),
  });
}

/** Call it directly from a tap: an `await` before this line would get the popup blocked. */
export function requestToken(prompt: GooglePrompt): Promise<GoogleToken> {
  return new Promise((resolve, reject) => {
    if (!client) return reject(new Error('O login do Google ainda está carregando.'));
    settle = { resolve, reject };
    client.requestAccessToken({ prompt });
  });
}

async function googleJson<T>(url: string, accessToken: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, {
    ...init,
    headers: { Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' },
  });
  if (!response.ok) throw new Error(`O Google recusou o pedido (erro ${response.status}).`);
  return (await response.json()) as T;
}

export async function fetchEmail(accessToken: string): Promise<string> {
  const user = await googleJson<{ email?: string }>(
    'https://www.googleapis.com/oauth2/v3/userinfo',
    accessToken,
  );
  return user.email ?? 'conta sem e-mail';
}

export async function createTestSheet(accessToken: string): Promise<string> {
  const sheet = await googleJson<{ spreadsheetUrl: string }>(
    'https://sheets.googleapis.com/v4/spreadsheets',
    accessToken,
    {
      method: 'POST',
      body: JSON.stringify({ properties: { title: 'Meu Bem (teste de conexão)' } }),
    },
  );
  return sheet.spreadsheetUrl;
}
