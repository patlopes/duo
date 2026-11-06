import {
  IonLabel,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
  useIonActionSheet,
  useIonToast,
} from '@ionic/react';
import {
  DotsThreeOutlineIcon,
  HouseIcon,
  ListBulletsIcon,
  PlusIcon,
  TargetIcon,
} from '@phosphor-icons/react';
import { Navigate, Route, useLocation } from 'react-router-dom';
import { HomePage } from '../home/HomePage';
import { PlanningPage } from '../planning/PlanningPage';
import { MorePage } from '../settings/MorePage';
import { TransactionsPage } from '../transactions/TransactionsPage';
import styles from './TabsLayout.module.css';

const TABS = [
  { tab: 'home', href: '/tabs/home', label: 'Início', Icon: HouseIcon },
  { tab: 'transactions', href: '/tabs/transactions', label: 'Lançamentos', Icon: ListBulletsIcon },
  { tab: 'planning', href: '/tabs/planning', label: 'Planejamento', Icon: TargetIcon },
  { tab: 'more', href: '/tabs/more', label: 'Mais', Icon: DotsThreeOutlineIcon },
] as const;

interface AddTabButtonProps {
  /** IonTabBar indexes its children by this prop, even for a button that never navigates. */
  tab: string;
}

function AddTabButton(_props: AddTabButtonProps) {
  const [presentSheet] = useIonActionSheet();
  const [presentToast] = useIonToast();

  const open = () =>
    void presentSheet({
      header: 'O que vocês querem lançar?',
      buttons: [
        ...['Despesa', 'Receita', 'Despesa no cartão', 'Transferência'].map((text) => ({
          text,
          handler: () =>
            void presentToast({
              message: `${text}: o formulário chega na Fase 1`,
              duration: 2000,
              position: 'top',
            }),
        })),
        { text: 'Cancelar', role: 'cancel' },
      ],
    });

  return (
    <div className={styles.addSlot}>
      <button
        type="button"
        className={`${styles.add} pressable`}
        aria-label="Novo lançamento"
        onClick={open}
      >
        <PlusIcon size={26} weight="bold" aria-hidden="true" />
      </button>
    </div>
  );
}
// IonTabBar drops any child that is not a tab button; this flag is how it recognizes custom ones.
AddTabButton.isTabButton = true;

export function TabsLayout() {
  const { pathname } = useLocation();

  const renderTab = ({ tab, href, label, Icon }: (typeof TABS)[number]) => (
    <IonTabButton key={tab} tab={tab} href={href}>
      <Icon size={26} weight={pathname.startsWith(href) ? 'fill' : 'regular'} aria-hidden="true" />
      <IonLabel>{label}</IonLabel>
    </IonTabButton>
  );

  return (
    <IonTabs>
      <IonRouterOutlet>
        <Route index element={<Navigate to="home" replace />} />
        <Route path="home" element={<HomePage />} />
        <Route path="transactions" element={<TransactionsPage />} />
        <Route path="planning" element={<PlanningPage />} />
        <Route path="more" element={<MorePage />} />
      </IonRouterOutlet>
      <IonTabBar slot="bottom" translucent>
        {renderTab(TABS[0])}
        {renderTab(TABS[1])}
        <AddTabButton tab="add" />
        {renderTab(TABS[2])}
        {renderTab(TABS[3])}
      </IonTabBar>
    </IonTabs>
  );
}
