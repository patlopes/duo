import {
  IonItem,
  IonLabel,
  IonSegment,
  IonSegmentButton,
  IonToggle,
  useIonAlert,
} from '@ionic/react';
import { ArrowDownIcon, ArrowUpIcon } from '@phosphor-icons/react';
import { useEffect, useState } from 'react';
import { useData } from '../../db/DataContext';
import { updateSettings } from '../../db/ops';
import type { HomeBlock, ThemeMode } from '../../schemas/settingsDefaults';
import { GroupedList } from '../../ui/GroupedList';
import { LargeTitlePage } from '../../ui/LargeTitlePage';
import { Field, Sheet } from '../../ui/parts';
import { BRAND } from '../../brand';
import { NamesSheet } from '../couple/CouplePage';
import { faceIdAvailable, hashPin, newSalt, registerFaceId } from './lock';
import { useToast } from '../../ui/useToast';

const BLOCK_LABEL: Record<HomeBlock, string> = {
  summary: 'Saldo e resumo',
  accounts: 'Contas',
  cards: 'Cartões',
  bills: 'Contas a pagar',
  categories: 'Gastos por categoria',
  budgets: 'Orçamentos',
  dreams: 'Sonhos',
  couple: 'Entre vocês',
};

function PinSheet({ onClose }: { onClose: () => void }) {
  const [pin, setPin] = useState('');
  const [again, setAgain] = useState('');
  const [error, setError] = useState('');
  const save = async () => {
    if (!/^\d{4,6}$/.test(pin)) return setError('Use de 4 a 6 números.');
    if (pin !== again) return setError('Os dois PINs não são iguais.');
    const salt = newSalt();
    await updateSettings({ lockEnabled: true, lockSalt: salt, lockHash: await hashPin(pin, salt) });
    onClose();
  };
  return (
    <Sheet isOpen onClose={onClose} title="Criar PIN" onSave={() => void save()}>
      <Field
        label="PIN de 4 a 6 números"
        hint="Isto é uma trava de tela, não uma criptografia: os dados não ficam cifrados."
      >
        <input
          className="input tabular"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Novo PIN"
          value={pin}
          onChange={(e) => setPin(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </Field>
      <Field label="Repita o PIN">
        <input
          className="input tabular"
          type="password"
          inputMode="numeric"
          autoComplete="off"
          aria-label="Repita o PIN"
          value={again}
          onChange={(e) => setAgain(e.target.value.replace(/\D/g, '').slice(0, 6))}
        />
      </Field>
      {error && <p className="tone-expense small">{error}</p>}
    </Sheet>
  );
}

export default function SettingsPage() {
  const { settings, members } = useData();
  const presentToast = useToast();
  const [presentAlert] = useIonAlert();
  const [pinOpen, setPinOpen] = useState(false);
  // Cancelling the PIN sheet has to flip the toggle back, which only a fresh instance does.
  const [lockToggleKey, setLockToggleKey] = useState(0);
  const [namesOpen, setNamesOpen] = useState(false);
  const [canFaceId, setCanFaceId] = useState(false);
  const [versionTaps, setVersionTaps] = useState(0);
  const devMode = import.meta.env.DEV || versionTaps >= 5;

  useEffect(() => {
    void faceIdAvailable().then(setCanFaceId);
  }, []);

  const toast = (message: string) =>
    void presentToast({ message, duration: 2500, position: 'top' });

  const move = (block: HomeBlock, delta: number) => {
    const list = [...settings.homeBlocks];
    const from = list.indexOf(block);
    const to = from + delta;
    if (to < 0 || to >= list.length) return;
    list.splice(from, 1);
    list.splice(to, 0, block);
    void updateSettings({ homeBlocks: list });
  };

  const toggleBlock = (block: HomeBlock, visible: boolean) =>
    void updateSettings({
      hiddenHomeBlocks: visible
        ? settings.hiddenHomeBlocks.filter((b) => b !== block)
        : [...settings.hiddenHomeBlocks, block],
    });

  const enableFaceId = async () => {
    try {
      await updateSettings({ lockCredentialId: await registerFaceId() });
      toast('Face ID ativado.');
    } catch {
      toast('Não foi possível ativar o Face ID neste aparelho.');
    }
  };

  const seed = () =>
    void presentAlert({
      header: 'Carregar dados de exemplo?',
      message: 'Os dados atuais deste aparelho serão substituídos pelo cenário de teste.',
      buttons: [
        { text: 'Cancelar', role: 'cancel' },
        {
          text: 'Carregar',
          handler: () =>
            void import('./devSeed')
              .then((m) => m.loadDevSeed())
              .then(() => toast('Dados de exemplo carregados.')),
        },
      ],
    });

  return (
    <LargeTitlePage title="Ajustes" backHref="/tabs/more">
      <GroupedList title="Aparência">
        <IonItem lines="none">
          <IonSegment
            aria-label="Tema do app"
            value={settings.theme}
            onIonChange={(e) => void updateSettings({ theme: e.detail.value as ThemeMode })}
          >
            <IonSegmentButton value="system">
              <IonLabel>Automático</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="light">
              <IonLabel>Claro</IonLabel>
            </IonSegmentButton>
            <IonSegmentButton value="dark">
              <IonLabel>Escuro</IonLabel>
            </IonSegmentButton>
          </IonSegment>
        </IonItem>
      </GroupedList>

      <GroupedList title="Privacidade">
        <IonItem>
          <IonToggle
            checked={settings.hideValues}
            onIonChange={(e) => void updateSettings({ hideValues: e.detail.checked })}
          >
            Ocultar valores
          </IonToggle>
        </IonItem>
        <IonItem>
          <IonToggle
            key={lockToggleKey}
            checked={settings.lockEnabled}
            onIonChange={(e) => {
              if (e.detail.checked) setPinOpen(true);
              else
                void updateSettings({
                  lockEnabled: false,
                  lockHash: null,
                  lockSalt: null,
                  lockCredentialId: null,
                });
            }}
          >
            Bloquear com PIN
          </IonToggle>
        </IonItem>
        {settings.lockEnabled && canFaceId && !settings.lockCredentialId && (
          <IonItem button detail onClick={() => void enableFaceId()}>
            <IonLabel>Ativar Face ID</IonLabel>
          </IonItem>
        )}
      </GroupedList>

      <GroupedList title="Casal">
        <IonItem button detail onClick={() => setNamesOpen(true)}>
          <IonLabel>Nomes</IonLabel>
        </IonItem>
        <IonItem>
          <IonLabel>Este celular é de</IonLabel>
          <select
            className="plain-select"
            aria-label="Este celular é de"
            value={settings.deviceMemberIndex}
            onChange={(e) =>
              void updateSettings({ deviceMemberIndex: Number(e.target.value) as 0 | 1 })
            }
          >
            <option value={0}>{members[0].name}</option>
            <option value={1}>{members[1].name}</option>
          </select>
        </IonItem>
        <IonItem>
          <IonToggle
            checked={settings.showOtherPersonal}
            onIonChange={(e) => void updateSettings({ showOtherPersonal: e.detail.checked })}
          >
            Mostrar gastos individuais do outro
          </IonToggle>
        </IonItem>
        <IonItem>
          <IonLabel>Meses de reserva de emergência</IonLabel>
          <input
            className="plain-select tabular"
            inputMode="numeric"
            aria-label="Meses de reserva"
            style={{ width: 60 }}
            value={settings.emergencyMonths}
            onChange={(e) =>
              void updateSettings({
                emergencyMonths: Math.max(1, Number(e.target.value.replace(/\D/g, '')) || 1),
              })
            }
          />
        </IonItem>
      </GroupedList>

      <GroupedList title="Blocos do Início">
        {settings.homeBlocks.map((block, i) => (
          <IonItem key={block}>
            <IonToggle
              slot="start"
              aria-label={`Mostrar ${BLOCK_LABEL[block]}`}
              checked={!settings.hiddenHomeBlocks.includes(block)}
              onIonChange={(e) => toggleBlock(block, e.detail.checked)}
            />
            <IonLabel>{BLOCK_LABEL[block]}</IonLabel>
            <button
              type="button"
              className="icon-button"
              aria-label={`Subir ${BLOCK_LABEL[block]}`}
              disabled={i === 0}
              onClick={() => move(block, -1)}
            >
              <ArrowUpIcon size={18} aria-hidden="true" />
            </button>
            <button
              type="button"
              className="icon-button"
              aria-label={`Descer ${BLOCK_LABEL[block]}`}
              disabled={i === settings.homeBlocks.length - 1}
              onClick={() => move(block, 1)}
            >
              <ArrowDownIcon size={18} aria-hidden="true" />
            </button>
          </IonItem>
        ))}
      </GroupedList>

      {devMode && (
        <GroupedList title="Desenvolvedor">
          <IonItem button detail onClick={seed}>
            <IonLabel>Carregar dados de exemplo</IonLabel>
          </IonItem>
        </GroupedList>
      )}

      {/* Tapping the version five times reveals the developer tools, as on Android. */}
      <button
        type="button"
        className="link-reset small muted center"
        style={{
          display: 'block',
          width: '100%',
          minHeight: 44,
          margin: 'var(--space-4) 0 var(--space-7)',
        }}
        onClick={() => setVersionTaps((n) => n + 1)}
      >
        {BRAND.name} · versão {__BUILD_ID__}
      </button>

      {pinOpen && (
        <PinSheet
          onClose={() => {
            setPinOpen(false);
            setLockToggleKey((k) => k + 1);
          }}
        />
      )}
      {namesOpen && <NamesSheet onClose={() => setNamesOpen(false)} />}
    </LargeTitlePage>
  );
}
