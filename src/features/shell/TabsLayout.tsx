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
import { lazy, Suspense, useRef, type ComponentType, type LazyExoticComponent } from 'react';
import { Navigate, Route, useLocation } from 'react-router-dom';
import { useData } from '../../db/DataContext';
import type { TxFormType } from '../../schemas/settingsDefaults';
import { useUi } from '../../ui/uiStore';
import styles from './TabsLayout.module.css';

function named<T>(loader: () => Promise<T>, name: keyof T) {
  return lazy(() => loader().then((m) => ({ default: m[name] as ComponentType })));
}

const pages = {
  Home: lazy(() => import('../home/HomePage')),
  Transactions: lazy(() => import('../transactions/TransactionsPage')),
  Planning: lazy(() => import('../planning/PlanningPage')),
  GoalDetail: lazy(() => import('../planning/GoalDetailPage')),
  More: lazy(() => import('../settings/MorePage')),
  Settings: lazy(() => import('../settings/SettingsPage')),
  Categories: named(() => import('../categories/CategoriesPage'), 'CategoriesPage'),
  Rules: named(() => import('../categories/CategoriesPage'), 'RulesPage'),
  Accounts: named(() => import('../accounts/AccountsPage'), 'AccountsPage'),
  AccountDetail: named(() => import('../accounts/AccountsPage'), 'AccountDetailPage'),
  Cards: named(() => import('../cards/CardsPage'), 'CardsPage'),
  CardDetail: named(() => import('../cards/CardsPage'), 'CardDetailPage'),
  Reports: lazy(() => import('../reports/ReportsPage')),
  Couple: named(() => import('../couple/CouplePage'), 'CouplePage'),
  Incomes: named(() => import('../couple/CouplePage'), 'IncomesPage'),
  Backup: lazy(() => import('../data/BackupPage')),
  History: lazy(() => import('../data/HistoryPage')),
  Health: lazy(() => import('../data/HealthPage')),
  Import: lazy(() => import('../data/ImportPage')),
  Ai: lazy(() => import('../ai/AiPage')),
};

function page(Component: LazyExoticComponent<ComponentType>) {
  return (
    <Suspense fallback={null}>
      <Component />
    </Suspense>
  );
}

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
  const { settings } = useData();
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const longPressed = useRef(false);

  const open = (type: TxFormType) => openForm({ type });

  const showMenu = () =>
    void presentSheet({
      header: 'O que vocês querem lançar?',
      buttons: [
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
            open(settings.lastTxType);
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
        <Route path="home" element={page(pages.Home)} />
        <Route path="transactions" element={page(pages.Transactions)} />
        <Route path="planning" element={page(pages.Planning)} />
        <Route path="planning/goals/:id" element={page(pages.GoalDetail)} />
        <Route path="more" element={page(pages.More)} />
        <Route path="more/settings" element={page(pages.Settings)} />
        <Route path="more/categories" element={page(pages.Categories)} />
        <Route path="more/rules" element={page(pages.Rules)} />
        <Route path="more/accounts" element={page(pages.Accounts)} />
        <Route path="more/accounts/:id" element={page(pages.AccountDetail)} />
        <Route path="more/cards" element={page(pages.Cards)} />
        <Route path="more/cards/:id" element={page(pages.CardDetail)} />
        <Route path="more/reports" element={page(pages.Reports)} />
        <Route path="more/couple" element={page(pages.Couple)} />
        <Route path="more/incomes" element={page(pages.Incomes)} />
        <Route path="more/backup" element={page(pages.Backup)} />
        <Route path="more/history" element={page(pages.History)} />
        <Route path="more/health" element={page(pages.Health)} />
        <Route path="more/import" element={page(pages.Import)} />
        <Route path="more/ai" element={page(pages.Ai)} />
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
