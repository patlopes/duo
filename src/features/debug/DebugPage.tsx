import { IonButton, IonItem, IonLabel } from '@ionic/react';
import { useCallback, useEffect, useState, type ChangeEvent } from 'react';
import { collectDiagnostics, diagnosticsToText, type DiagnosticGroup } from '../../pwa/diagnostics';
import { requestPersistentStorage } from '../../pwa/register';
import { GroupedList } from '../../ui/GroupedList';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import styles from './DebugPage.module.css';

export default function DebugPage() {
  const [groups, setGroups] = useState<DiagnosticGroup[]>([]);
  const [log, setLog] = useState<string[]>([]);

  const refresh = useCallback(() => {
    void collectDiagnostics().then(setGroups);
  }, []);

  useEffect(() => {
    refresh();
    window.visualViewport?.addEventListener('resize', refresh);
    return () => window.visualViewport?.removeEventListener('resize', refresh);
  }, [refresh]);

  const addLog = (line: string) => setLog((current) => [...current, line]);

  const copyReport = async () => {
    const text = diagnosticsToText(groups, log);
    try {
      await navigator.clipboard.writeText(text);
      addLog('Copiar relatório: ok');
    } catch (error) {
      addLog(`Copiar relatório: falhou (${String(error)})`);
    }
  };

  const shareJson = async () => {
    const file = new File(
      [JSON.stringify({ format: 'duo-debug', at: new Date().toISOString() })],
      'duo-teste.json',
      { type: 'application/json' },
    );
    try {
      await navigator.share({ files: [file] });
      addLog('Compartilhar .json: ok');
    } catch (error) {
      addLog(`Compartilhar .json: ${String(error)}`);
    }
  };

  const persist = async () => {
    addLog(`storage.persist(): ${String(await requestPersistentStorage())}`);
    refresh();
  };

  const badge = async () => {
    try {
      await navigator.setAppBadge(3);
      addLog('setAppBadge(3): ok');
    } catch (error) {
      addLog(`setAppBadge(3): ${String(error)}`);
    }
  };

  const pickFile = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    addLog(
      file ? `Arquivo: ${file.name}, ${file.size} bytes, tipo "${file.type}"` : 'Nenhum arquivo',
    );
  };

  return (
    <LargeTitlePage title="Diagnóstico" backHref="/tabs/more">
      <div className={styles.actions}>
        <IonButton onClick={() => void copyReport()}>Copiar relatório</IonButton>
        <IonButton fill="outline" onClick={() => void shareJson()}>
          Compartilhar .json
        </IonButton>
        <IonButton fill="outline" onClick={() => void persist()}>
          Pedir armazenamento persistente
        </IonButton>
        <IonButton fill="outline" onClick={() => void badge()}>
          Testar badge no ícone
        </IonButton>
        <label className={styles.file}>
          Escolher arquivo .json
          <input type="file" accept="application/json,.json" onChange={pickFile} />
        </label>
      </div>

      {log.length > 0 && (
        <GroupedList title="Testes">
          {log.map((line, index) => (
            <IonItem key={index}>
              <IonLabel className="ion-text-wrap">{line}</IonLabel>
            </IonItem>
          ))}
        </GroupedList>
      )}

      {groups.map((group) => (
        <GroupedList key={group.title} title={group.title}>
          {group.rows.map((row) => (
            <IonItem key={row.label}>
              <div className={styles.row}>
                <span className={styles.label}>{row.label}</span>
                <span className={styles.value}>{row.value}</span>
              </div>
            </IonItem>
          ))}
        </GroupedList>
      ))}
    </LargeTitlePage>
  );
}
