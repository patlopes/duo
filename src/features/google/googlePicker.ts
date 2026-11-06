import { GOOGLE_API_KEY, GOOGLE_PROJECT_NUMBER } from './googleAuth';
import { SHEET_TITLE } from './googleSheets';

interface PickerResult {
  action: string;
  docs?: { id: string }[];
}

interface PickerBuilder {
  addView(view: unknown): PickerBuilder;
  setAppId(id: string): PickerBuilder;
  setDeveloperKey(key: string): PickerBuilder;
  setOAuthToken(token: string): PickerBuilder;
  setOrigin(origin: string): PickerBuilder;
  setSize(width: number, height: number): PickerBuilder;
  setTitle(title: string): PickerBuilder;
  setCallback(callback: (result: PickerResult) => void): PickerBuilder;
  build(): { setVisible(visible: boolean): void; dispose(): void };
}

interface PickerApi {
  PickerBuilder: new () => PickerBuilder;
  DocsView: new (viewId: string) => {
    setMode(mode: string): unknown;
    setQuery(query: string): unknown;
    setFileIds(ids: string): unknown;
  };
  ViewId: { SPREADSHEETS: string };
  DocsViewMode: { LIST: string };
  Action: { PICKED: string; CANCEL: string };
}

declare global {
  interface Window {
    gapi?: { load: (name: string, done: () => void) => void };
  }
}

const pickerApi = () => (window.google as unknown as { picker?: PickerApi } | undefined)?.picker;

export async function loadPicker(): Promise<void> {
  if (pickerApi()) return;
  if (!window.gapi) {
    await new Promise<void>((resolve, reject) => {
      const script = document.createElement('script');
      script.src = 'https://apis.google.com/js/api.js';
      script.async = true;
      script.onload = () => resolve();
      script.onerror = () => reject(new Error('Não deu para abrir a janela do Google.'));
      document.head.append(script);
    });
  }
  await new Promise<void>((resolve) => window.gapi!.load('picker', resolve));
}

/**
 * The narrow Drive permission only reaches files the person picks, so the one who was invited has to
 * choose the shared sheet once. Resolves to its id, or null if they back out.
 */
export function pickCoupleSheet(accessToken: string, sheetId?: string): Promise<string | null> {
  const api = pickerApi();
  if (!api) return Promise.reject(new Error('A janela do Google ainda está carregando.'));
  return new Promise((resolve) => {
    const view = new api.DocsView(api.ViewId.SPREADSHEETS);
    view.setMode(api.DocsViewMode.LIST);
    if (sheetId) view.setFileIds(sheetId);
    else view.setQuery(SHEET_TITLE);
    const builder = new api.PickerBuilder()
      .addView(view)
      .setAppId(GOOGLE_PROJECT_NUMBER)
      .setOAuthToken(accessToken)
      .setOrigin(location.origin)
      .setSize(window.innerWidth, window.innerHeight)
      .setTitle('Escolha a planilha do casal')
      .setCallback((result) => {
        if (result.action === api.Action.PICKED) {
          picker.dispose();
          resolve(result.docs?.[0]?.id ?? null);
        } else if (result.action === api.Action.CANCEL) {
          picker.dispose();
          resolve(null);
        }
      });
    if (GOOGLE_API_KEY) builder.setDeveloperKey(GOOGLE_API_KEY);
    const picker = builder.build();
    picker.setVisible(true);
  });
}
