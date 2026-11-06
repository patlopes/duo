import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { DataProvider, useData } from './db/DataContext';
import { today } from './domain/months';
import { TabsLayout } from './features/shell/TabsLayout';
import { UpdateToast } from './pwa/UpdateToast';
import { useThemeSync } from './ui/useThemeSync';

const DebugPage = lazy(() => import('./features/debug/DebugPage'));
const InstallGuidePage = lazy(() => import('./pwa/InstallGuidePage'));
const TransactionFormHost = lazy(() => import('./features/form/TransactionForm'));
const Onboarding = lazy(() => import('./features/onboarding/Onboarding'));
const LockGate = lazy(() => import('./features/settings/LockGate'));

/** Screens are split so the first paint stays small; this fetches them right after it. */
function preloadScreens() {
  void import('./features/form/TransactionForm');
  void import('./features/transactions/TransactionsPage');
  void import('./features/settings/MorePage');
  void import('./features/planning/PlanningPage');
}

function Overlays() {
  const { settings, transactions } = useData();
  const now = today();
  const dueCount = transactions.filter(
    (t) => t.kind === 'expense' && t.status === 'pending' && !t.cardId && t.date <= now,
  ).length;

  useEffect(() => {
    // Not every browser has this, and it can refuse: the badge is a nicety, never a dependency.
    if (dueCount > 0) void navigator.setAppBadge?.(dueCount)?.catch(() => undefined);
    else void navigator.clearAppBadge?.()?.catch(() => undefined);
  }, [dueCount]);

  useEffect(() => {
    const id = setTimeout(preloadScreens, 800);
    return () => clearTimeout(id);
  }, []);

  return (
    <Suspense fallback={null}>
      <TransactionFormHost />
      {!settings.onboarded && <Onboarding />}
      {settings.lockEnabled && <LockGate />}
    </Suspense>
  );
}

export function App() {
  useThemeSync();

  return (
    <IonApp>
      <DataProvider>
        <IonReactRouter basename={import.meta.env.BASE_URL.replace(/\/$/, '')}>
          <IonRouterOutlet>
            <Route path="/" element={<Navigate to="/tabs/home" replace />} />
            <Route path="/tabs/*" element={<TabsLayout />} />
            <Route
              path="/debug"
              element={
                <Suspense fallback={null}>
                  <DebugPage />
                </Suspense>
              }
            />
            <Route
              path="/install"
              element={
                <Suspense fallback={null}>
                  <InstallGuidePage />
                </Suspense>
              }
            />
          </IonRouterOutlet>
        </IonReactRouter>
        <Overlays />
      </DataProvider>
      <UpdateToast />
    </IonApp>
  );
}
