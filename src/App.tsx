import { IonApp, IonRouterOutlet } from '@ionic/react';
import { IonReactRouter } from '@ionic/react-router';
import { lazy, Suspense } from 'react';
import { Navigate, Route } from 'react-router-dom';
import { TabsLayout } from './features/shell/TabsLayout';
import { UpdateToast } from './pwa/UpdateToast';
import { useThemeSync } from './ui/useThemeSync';

const DebugPage = lazy(() => import('./features/debug/DebugPage'));
const InstallGuidePage = lazy(() => import('./pwa/InstallGuidePage'));

export function App() {
  useThemeSync();

  return (
    <IonApp>
      <IonReactRouter>
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
      <UpdateToast />
    </IonApp>
  );
}
