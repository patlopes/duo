import {
  IonLabel,
  IonRouterOutlet,
  IonTabBar,
  IonTabButton,
  IonTabs,
  useIonActionSheet,
} from '@ionic/react';
import {
  DotsThreeOutlineIcon,
  HouseIcon,
  ListBulletsIcon,
  PlusIcon,
  TargetIcon,
} from '@phosphor-icons/react';
import { useRef, type ReactElement } from 'react';
import { Navigate, Route, useLocation } from 'react-router-dom';
import type { TxFormType } from '../../schemas/settingsDefaults';
import { useUi } from '../../ui/uiStore';
import { AccountDetailPage, AccountsPage } from '../accounts/AccountsPage';
import AiPage from '../ai/AiPage';
import { CardDetailPage, CardsPage } from '../cards/CardsPage';
import { CategoriesPage, RulesPage } from '../categories/CategoriesPage';
import { CouplePage, IncomesPage } from '../couple/CouplePage';
import BackupPage from '../data/BackupPage';
import HealthPage from '../data/HealthPage';
import HistoryPage from '../data/HistoryPage';
import ImportPage from '../data/ImportPage';
import HomePage from '../home/HomePage';
import GoalDetailPage from '../planning/GoalDetailPage';
import PlanningPage from '../planning/PlanningPage';
import ReportsPage from '../reports/ReportsPage';
import SalariesPage from '../salaries/SalariesPage';
import MorePage from '../settings/MorePage';
import SharePage from '../share/SharePage';
import SimulatorPage from '../simulator/SimulatorPage';
import SettingsPage from '../settings/SettingsPage';
import TransactionsPage from '../transactions/TransactionsPage';
import styles from './TabsLayout.module.css';

// Screens reached from more than one tab exist under each: going back then stays in the tab you are
// in, instead of jumping to wherever the screen was first opened from.
const SHARED_ROUTES = ['home', 'planning', 'more'];
const DETAIL_PAGES: [string, ReactElement][] = [
  ['accounts', <AccountsPage />],
  ['accounts/:id', <AccountDetailPage />],
  ['cards', <CardsPage />],
  ['cards/:id', <CardDetailPage />],
  ['goals/:id', <GoalDetailPage />],
  ['couple', <CouplePage />],
  ['reports', <ReportsPage />],
  ['backup', <BackupPage />],
  ['salaries', <SalariesPage />],
  ['simulator', <SimulatorPage />],
  ['share', <SharePage />],
];

const TABS = [
  { tab: 'home', href: '/tabs/home', label: 'Início', Icon: HouseIcon },
  { tab: 'transactions', href: '/tabs/transactions', label: 'Lançamentos', Icon: ListBulletsIcon },
  { tab: 'planning', href: '/tabs/planning', label: 'Planejamento', Icon: TargetIcon },
  { tab: 'more', href: '/tabs/more', label: 'Mais', Icon: DotsThreeOutlineIcon },
] as const;

const LONG_PRESS_MS = 450;

interface AddTabButtonProps {
  /** IonTabBar indexes its children by this prop, even for a button that never navigates. */
  tab: string;
}

function AddTabButton(_props: AddTabButtonProps) {
  const [presentSheet] = useIonActionSheet();
  const openForm = useUi((s) => s.openForm);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const openBill = useUi((s) => s.openBill);
  const open = (type: TxFormType) => openForm({ type });

  const showMenu = () =>
    void presentSheet({
      header: 'O que vocês querem lançar?',
      buttons: [
        { text: 'Conta fixa, todo mês', handler: () => openBill({ mode: 'recurring' }) },
        { text: 'Conta ou compra futura', handler: () => openBill({ mode: 'once' }) },
        { text: 'Despesa', handler: () => open('expense') },
        { text: 'Receita', handler: () => open('income') },
        { text: 'Despesa no cartão', handler: () => open('card') },
        { text: 'Transferência', handler: () => open('transfer') },
        { text: 'Cancelar', role: 'cancel' },
      ],
    });

  const cancelTimer = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };

  return (
    <div className={styles.addSlot}>
      <button
        type="button"
        className={`${styles.add} pressable`}
        aria-label="Novo lançamento"
        onPointerDown={() => {
          longPressed.current = false;
          timer.current = setTimeout(() => {
            longPressed.current = true;
            openBill({ mode: 'recurring' });
          }, LONG_PRESS_MS);
        }}
        onPointerUp={cancelTimer}
        onPointerLeave={cancelTimer}
        onPointerCancel={cancelTimer}
        onContextMenu={(e) => e.preventDefault()}
        onClick={() => {
          if (!longPressed.current) showMenu();
        }}
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
        <Route path="more/rules" element={<RulesPage />} />
        <Route path="more/categories" element={<CategoriesPage />} />
        <Route path="more/settings" element={<SettingsPage />} />
        <Route path="more/incomes" element={<IncomesPage />} />
        <Route path="more/history" element={<HistoryPage />} />
        <Route path="more/health" element={<HealthPage />} />
        <Route path="more/import" element={<ImportPage />} />
        <Route path="more/ai" element={<AiPage />} />
        {SHARED_ROUTES.flatMap((base) =>
          DETAIL_PAGES.map(([path, element]) => (
            <Route key={`${base}/${path}`} path={`${base}/${path}`} element={element} />
          )),
        )}
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
