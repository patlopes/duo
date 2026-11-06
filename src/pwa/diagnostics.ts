import { db } from '../db/database';
import { isIos, isStandalone } from './platform';

export interface DiagnosticRow {
  label: string;
  value: string;
}

export interface DiagnosticGroup {
  title: string;
  rows: DiagnosticRow[];
}

function yesNo(value: boolean): string {
  return value ? 'sim' : 'não';
}

function row(label: string, value: string | number | boolean | null | undefined): DiagnosticRow {
  if (typeof value === 'boolean') return { label, value: yesNo(value) };
  return { label, value: value == null ? '—' : String(value) };
}

/** `env()` only resolves inside CSS, so an element has to carry it for us to read it back. */
function readSafeAreas(): Record<'top' | 'right' | 'bottom' | 'left', number> {
  const probe = document.createElement('div');
  probe.style.cssText =
    'position:fixed;visibility:hidden;padding:env(safe-area-inset-top) env(safe-area-inset-right) env(safe-area-inset-bottom) env(safe-area-inset-left);';
  document.body.append(probe);
  const style = getComputedStyle(probe);
  const areas = {
    top: parseFloat(style.paddingTop),
    right: parseFloat(style.paddingRight),
    bottom: parseFloat(style.paddingBottom),
    left: parseFloat(style.paddingLeft),
  };
  probe.remove();
  return areas;
}

/** Whether the iOS share sheet accepts a file depends on its type, and the spec relies on JSON. */
function canShareFile(name: string, type: string): boolean | null {
  if (!navigator.canShare) return null;
  try {
    return navigator.canShare({ files: [new File(['{"ok":true}'], name, { type })] });
  } catch {
    return false;
  }
}

function formatBytes(bytes: number | undefined): string {
  if (bytes == null) return '—';
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function indexedDbRoundTrip(): Promise<string> {
  try {
    const key = '__debug';
    const stamp = new Date().toISOString();
    await db.table('settings').put({ id: key, stamp });
    const read = await db.table('settings').get(key);
    await db.table('settings').delete(key);
    return read?.stamp === stamp ? 'ok' : 'leu valor diferente';
  } catch (error) {
    return `erro: ${String(error)}`;
  }
}

async function platformAuthenticator(): Promise<boolean | string> {
  if (!window.PublicKeyCredential) return 'WebAuthn indisponível';
  try {
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch (error) {
    return `erro: ${String(error)}`;
  }
}

export async function collectDiagnostics(): Promise<DiagnosticGroup[]> {
  const safe = readSafeAreas();
  const viewport = window.visualViewport;
  const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
  const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
  const registration = await navigator.serviceWorker?.getRegistration().catch(() => undefined);

  return [
    {
      title: 'App',
      rows: [
        row('Build', __BUILD_ID__),
        row('Gerado em', __BUILD_TIME__),
        row('Origem', location.origin),
        row('Standalone (Tela de Início)', isStandalone()),
        row('navigator.standalone', navigator.standalone ?? null),
        row('iOS detectado', isIos()),
        row('Online', navigator.onLine),
        row('User agent', navigator.userAgent),
      ],
    },
    {
      title: 'Tela',
      rows: [
        row('Safe area topo', safe.top),
        row('Safe area base', safe.bottom),
        row('Safe area esquerda', safe.left),
        row('Safe area direita', safe.right),
        row('window.innerWidth × innerHeight', `${innerWidth} × ${innerHeight}`),
        row(
          'visualViewport',
          viewport
            ? `${Math.round(viewport.width)} × ${Math.round(viewport.height)}, topo ${Math.round(viewport.offsetTop)}, escala ${viewport.scale}`
            : null,
        ),
        row('Device pixel ratio', devicePixelRatio),
        row(
          'Tema do sistema',
          matchMedia('(prefers-color-scheme: dark)').matches ? 'escuro' : 'claro',
        ),
        row('Suporta 100dvh', CSS.supports('height', '100dvh')),
        row('Suporta backdrop-filter', CSS.supports('backdrop-filter', 'blur(1px)')),
        row('Suporta color-mix', CSS.supports('color', 'color-mix(in srgb, red, blue)')),
      ],
    },
    {
      title: 'Armazenamento',
      rows: [
        row('IndexedDB (gravar e ler)', await indexedDbRoundTrip()),
        row('storage.persisted()', persisted),
        row('Usado', formatBytes(estimate?.usage)),
        row('Quota', formatBytes(estimate?.quota)),
      ],
    },
    {
      title: 'Service worker',
      rows: [
        row('Disponível', 'serviceWorker' in navigator),
        row('Controlando esta página', navigator.serviceWorker?.controller != null),
        row('Estado', registration?.active?.state ?? null),
        row('Script', registration?.active?.scriptURL ?? null),
        row('Atualização esperando', registration?.waiting != null),
      ],
    },
    {
      title: 'Recursos do iOS',
      rows: [
        row('navigator.share', 'share' in navigator),
        row('navigator.canShare', 'canShare' in navigator),
        row('canShare .json application/json', canShareFile('duo.json', 'application/json')),
        row('canShare .json text/plain', canShareFile('duo.json', 'text/plain')),
        row('canShare .txt text/plain', canShareFile('duo.txt', 'text/plain')),
        row('canShare .zip application/zip', canShareFile('duo.zip', 'application/zip')),
        row('clipboard.writeText', 'clipboard' in navigator),
        row('setAppBadge', 'setAppBadge' in navigator),
        row('Web Push (PushManager)', 'PushManager' in window),
        row('Notificações', 'Notification' in window ? Notification.permission : null),
        row('Face ID / WebAuthn de plataforma', await platformAuthenticator()),
        row('WebCrypto (crypto.subtle)', 'subtle' in crypto),
        row('navigator.vibrate', 'vibrate' in navigator),
      ],
    },
  ];
}

export function diagnosticsToText(groups: DiagnosticGroup[], log: string[]): string {
  const body = groups
    .map((g) => [`# ${g.title}`, ...g.rows.map((r) => `${r.label}: ${r.value}`)].join('\n'))
    .join('\n\n');
  return log.length > 0 ? `${body}\n\n# Testes\n${log.join('\n')}` : body;
}
