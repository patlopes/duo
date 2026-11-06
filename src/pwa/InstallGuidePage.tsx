import {
  CheckCircleIcon,
  DotsThreeVerticalIcon,
  ExportIcon,
  PlusSquareIcon,
} from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { BRAND } from '../brand';
import { LargeTitlePage } from '../ui/LargeTitlePage';
import styles from './InstallGuidePage.module.css';
import { isAndroid, isStandalone } from './platform';
import { usePwaStore } from './pwaStore';

interface Step {
  icon: ReactNode;
  title: string;
  text: string;
}

const LAST: Step = {
  icon: <CheckCircleIcon />,
  title: `Abra pelo ícone do ${BRAND.name}`,
  text: 'A partir daqui, use sempre o ícone: é ele que funciona sem internet.',
};

const IOS: Step[] = [
  {
    icon: <ExportIcon />,
    title: 'Toque em Compartilhar',
    text: 'É o quadrado com a seta para cima, na barra do Safari.',
  },
  {
    icon: <PlusSquareIcon />,
    title: 'Adicionar à Tela de Início',
    text: 'Role a lista de opções até encontrar. Depois, toque em Adicionar.',
  },
  LAST,
];

const ANDROID: Step[] = [
  {
    icon: <DotsThreeVerticalIcon />,
    title: 'Abra o menu do Chrome',
    text: 'São os três pontos no canto. Use uma aba normal: em aba anônima a opção de instalar não aparece.',
  },
  {
    icon: <PlusSquareIcon />,
    title: 'Adicionar à tela inicial',
    text: 'Depois, escolha Instalar. A opção Criar atalho só abre o site dentro do navegador.',
  },
  LAST,
];

export default function InstallGuidePage() {
  const prompt = usePwaStore((s) => s.installPrompt);
  const steps = isAndroid() ? ANDROID : IOS;
  return (
    <LargeTitlePage title="Instalar" backHref="/tabs/more">
      {isStandalone() && <p className={styles.done}>Tudo certo: o app já está instalado.</p>}
      {prompt && (
        <div className="page-pad" style={{ paddingBottom: 0 }}>
          <button type="button" className="primary-button" onClick={() => void prompt.prompt()}>
            Instalar agora
          </button>
        </div>
      )}
      <ol className={styles.steps}>
        {steps.map((step) => (
          <li key={step.title} className="card">
            <span className={styles.icon} aria-hidden="true">
              {step.icon}
            </span>
            <div>
              <strong>{step.title}</strong>
              <p>{step.text}</p>
            </div>
          </li>
        ))}
      </ol>
    </LargeTitlePage>
  );
}
