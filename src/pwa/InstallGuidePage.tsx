import { CheckCircleIcon, ExportIcon, PlusSquareIcon } from '@phosphor-icons/react';
import type { ReactNode } from 'react';
import { BRAND } from '../brand';
import { LargeTitlePage } from '../ui/LargeTitlePage';
import styles from './InstallGuidePage.module.css';
import { isStandalone } from './platform';

const STEPS: { icon: ReactNode; title: string; text: string }[] = [
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
  {
    icon: <CheckCircleIcon />,
    title: `Abra pelo ícone do ${BRAND.name}`,
    text: 'A partir daqui, use sempre o ícone: é ele que funciona sem internet.',
  },
];

export default function InstallGuidePage() {
  return (
    <LargeTitlePage title="Instalar" backHref="/tabs/more">
      {isStandalone() && <p className={styles.done}>Tudo certo: o app já está instalado.</p>}
      <ol className={styles.steps}>
        {STEPS.map((step) => (
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
