import { useIonAlert } from '@ionic/react';
import { useEffect, useState, type ChangeEvent } from 'react';
import { useData } from '../../db/DataContext';
import {
  backupToFile,
  markBackupDone,
  parseBackupFile,
  restoreBackup,
  type ParsedBackup,
  type RestoreMode,
} from '../../io/backup';
import { shareFile } from '../../io/share';
import { requestPersistentStorage } from '../../pwa/register';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { ChoiceChips, Field, Section } from '../../ui/parts';
import { updateSettings } from '../../db/ops';
import { useToast } from '../../ui/useToast';

function formatMb(bytes: number | undefined): string {
  return bytes == null ? '—' : `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function BackupPage() {
  const { settings } = useData();
  const presentToast = useToast();
  const [presentAlert] = useIonAlert();
  // Each hook holds one overlay at a time, and the second alert opens while the first is closing.
  const [presentSecondAlert] = useIonAlert();
  const [withAttachments, setWithAttachments] = useState(false);
  const [parsed, setParsed] = useState<ParsedBackup | null>(null);
  const [mode, setMode] = useState<RestoreMode>('merge');
  const [error, setError] = useState('');
  const [storage, setStorage] = useState<{
    used?: number;
    quota?: number;
    persisted: boolean | null;
  }>({ persisted: null });

  useEffect(() => {
    void (async () => {
      const estimate = await navigator.storage?.estimate?.().catch(() => undefined);
      const persisted = (await navigator.storage?.persisted?.().catch(() => null)) ?? null;
      setStorage({ used: estimate?.usage, quota: estimate?.quota, persisted });
    })();
  }, []);

  const toast = (message: string) =>
    void presentToast({ message, duration: 2500, position: 'top' });

  const exportBackup = async () => {
    const file = await backupToFile(withAttachments);
    const result = await shareFile(file);
    if (result === 'shared' || result === 'downloaded') {
      await markBackupDone();
      toast('Backup gerado. Guarde o arquivo em um lugar fora do celular.');
    } else if (result === 'failed') {
      toast('Não foi possível gerar o backup.');
    }
  };

  const pick = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setError('');
    try {
      setParsed(await parseBackupFile(file));
    } catch (e) {
      setParsed(null);
      setError(e instanceof Error ? e.message : 'Não foi possível ler o arquivo.');
    }
  };

  const run = async () => {
    if (!parsed) return;
    const { written, skipped } = await restoreBackup(parsed, mode);
    setParsed(null);
    toast(
      mode === 'replace'
        ? 'Backup restaurado.'
        : `${written} registros atualizados, ${skipped} já estavam em dia.`,
    );
  };

  const restore = () => {
    if (mode === 'merge') {
      void run();
      return;
    }
    // Two steps, because this is the one action here with no undo.
    void presentAlert({
      header: 'Substituir tudo?',
      message: 'Todos os dados deste aparelho serão apagados e trocados pelos do backup.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Continuar',
          handler: () => {
            void presentSecondAlert({
              header: 'Tem certeza?',
              message: 'Essa ação não pode ser desfeita.',
              buttons: [
                { text: 'Cancelar', role: 'cancel' },
                { text: 'Substituir tudo', role: 'destructive', handler: () => void run() },
              ],
            });
          },
        },
      ],
    });
  };

  return (
    <LargeTitlePage title="Backup" backHref="/tabs/more">
      <div className="page-pad">
        <div className="notice">
          <div>
            Os dados de vocês ficam só neste aparelho. Se o celular for perdido ou o sistema limpar
            o armazenamento, é o backup que salva tudo.
          </div>
        </div>
        <Section title="Exportar">
          <div className="card stack">
            <label className="toggle-row" style={{ marginBottom: 0 }}>
              <span>Incluir fotos dos comprovantes</span>
              <input
                type="checkbox"
                checked={withAttachments}
                onChange={(e) => setWithAttachments(e.target.checked)}
              />
            </label>
            <button type="button" className="primary-button" onClick={() => void exportBackup()}>
              Exportar backup
            </button>
            <span className="small muted">
              {settings.lastBackupAt
                ? `Último backup: ${new Date(settings.lastBackupAt).toLocaleString('pt-BR')}`
                : 'Nenhum backup feito ainda.'}
            </span>
          </div>
        </Section>

        <Section title="Restaurar">
          <div className="card stack">
            <label className="secondary-button" style={{ position: 'relative' }}>
              Escolher arquivo de backup
              <input
                type="file"
                accept="application/json,.json,application/zip,.zip"
                aria-label="Arquivo de backup"
                style={{ position: 'absolute', inset: 0, opacity: 0 }}
                onChange={(e) => void pick(e)}
              />
            </label>
            {error && (
              <p className="tone-expense small" style={{ margin: 0 }}>
                {error}
              </p>
            )}
            {parsed && (
              <>
                <p className="subhead" style={{ margin: 0 }}>
                  Backup de {new Date(parsed.backup.exportedAt).toLocaleString('pt-BR')}:{' '}
                  {parsed.counts.transactions} lançamentos, {parsed.counts.accounts} contas,{' '}
                  {parsed.counts.goals} sonhos.
                </p>
                {parsed.errors.length > 0 ? (
                  <p className="tone-expense small" style={{ margin: 0 }}>
                    O arquivo tem registros inválidos e não será aplicado: {parsed.errors[0]}
                  </p>
                ) : (
                  <>
                    <Field label="Como restaurar">
                      <ChoiceChips
                        value={mode}
                        onChange={setMode}
                        options={[
                          { value: 'merge', label: 'Mesclar' },
                          { value: 'replace', label: 'Substituir tudo' },
                        ]}
                      />
                    </Field>
                    <button type="button" className="primary-button" onClick={restore}>
                      Restaurar
                    </button>
                  </>
                )}
              </>
            )}
          </div>
        </Section>

        <Section title="Lembrete">
          <div className="card">
            <Field label="Lembrar a cada">
              <ChoiceChips
                value={String(settings.backupReminderDays)}
                onChange={(v) => void updateSettings({ backupReminderDays: Number(v) })}
                options={[
                  { value: '7', label: '7 dias' },
                  { value: '14', label: '14 dias' },
                  { value: '30', label: '30 dias' },
                  { value: '0', label: 'Nunca' },
                ]}
              />
            </Field>
          </div>
        </Section>

        <Section title="Armazenamento">
          <div className="card stack subhead">
            <span>
              Usado: {formatMb(storage.used)} de {formatMb(storage.quota)}
            </span>
            <span>
              {storage.persisted
                ? 'Protegido contra limpeza automática.'
                : 'O sistema ainda pode limpar estes dados se faltar espaço.'}
            </span>
            {!storage.persisted && (
              <button
                type="button"
                className="secondary-button"
                onClick={() =>
                  void requestPersistentStorage().then((ok) => {
                    setStorage((s) => ({ ...s, persisted: ok }));
                    toast(
                      ok
                        ? 'Armazenamento protegido.'
                        : 'O sistema não concedeu a proteção: mantenha os backups em dia.',
                    );
                  })
                }
              >
                Pedir proteção
              </button>
            )}
          </div>
        </Section>
      </div>
    </LargeTitlePage>
  );
}
