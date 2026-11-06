import { useIonAlert } from '@ionic/react';
import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '../../db/database';
import { undoImport } from '../../io/changeset';
import { LargeTitlePage } from '../../ui/LargeTitlePage';

const KIND_LABEL = {
  backup: 'Backup',
  changeset: 'IA',
  ofx: 'OFX',
  csv: 'CSV',
  sheet: 'Planilha',
} as const;

export default function HistoryPage() {
  const logs = useLiveQuery(() => db.importLogs.orderBy('appliedAt').reverse().toArray(), [], []);
  const [presentAlert] = useIonAlert();

  const undo = (id: string) =>
    void presentAlert({
      header: 'Desfazer esta importação?',
      message:
        'Tudo o que ela criou ou alterou volta a ser como era. O que vocês editaram depois nesses registros também se perde.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        { text: 'Desfazer', handler: () => void undoImport(id) },
      ],
    });

  return (
    <LargeTitlePage title="Histórico" backHref="/tabs/more">
      <div className="page-pad">
        <div className="card-list">
          {logs.length === 0 && <p className="empty-note">Nenhuma importação até agora.</p>}
          {logs.map((log) => (
            <div key={log.id} className="row">
              <span className="row-main">
                <span className="row-title">{log.summary}</span>
                <span className="row-sub">
                  {KIND_LABEL[log.kind]} · {new Date(log.appliedAt).toLocaleString('pt-BR')}
                  {log.undoneAt ? ' · desfeita' : ''}
                </span>
              </span>
              {!log.undoneAt && (
                <button type="button" className="chip" onClick={() => undo(log.id)}>
                  Desfazer
                </button>
              )}
            </div>
          ))}
        </div>
      </div>
    </LargeTitlePage>
  );
}
