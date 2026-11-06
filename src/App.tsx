import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { lazy, Suspense, useEffect } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { DataProvider, useData } from './db/DataContext';
import { today } from './domain/months';
import DebugPage from './features/debug/DebugPage';
import { TabsLayout } from './features/shell/TabsLayout';
import InstallGuidePage from './pwa/InstallGuidePage';
import { UpdateToast } from './pwa/UpdateToast';
import { InviteGate } from './features/google/InviteGate';
import { SheetSyncHost } from './features/google/SheetSyncHost';
import { useThemeSync } from './ui/useThemeSync';

// Ionic's stack needs a routed page to exist the moment it is navigated to: a lazy one leaves a blank
// screen with no back button while its code loads. Only overlays, which it does not manage, are lazy.
const TransactionFormHost = lazy(() => import('./features/form/TransactionForm'));
const Onboarding = lazy(() => import('./features/onboarding/Onboarding'));
const LockGate = lazy(() => import('./features/settings/LockGate'));
const BillFormHost = lazy(() => import('./features/bills/BillForm'));

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

  return (
    <Suspense fallback={null}>
      <TransactionFormHost />
      <BillFormHost />
      {!settings.onboarded && <Onboarding />}
      <InviteGate />
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
            <Route path="/debug" element={<DebugPage />} />
            <Route path="/install" element={<InstallGuidePage />} />
          </IonRouterOutlet>
        </IonReactRouter>
        <Overlays />
        <SheetSyncHost />
      </DataProvider>
      <UpdateToast />
    </IonApp>
  );
}
