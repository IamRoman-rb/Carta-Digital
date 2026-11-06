import { lazy, Suspense } from 'react';
import { Redirect, Route, Switch } from 'wouter';
import { ShieldAlert } from 'lucide-react';
import { EmptyState, Spinner } from '../ui/index.jsx';
import { AuthProvider, useAuth } from './auth.jsx';
import { StaffDataProvider } from './staffData.jsx';
import StaffLayout from './layout/StaffLayout.jsx';
import LoginPage from './pages/LoginPage.jsx';
import ChangePasswordPage from './pages/ChangePasswordPage.jsx';

// Cada pantalla se descarga al visitarla por primera vez.
const FloorPage = lazy(() => import('./pages/FloorPage.jsx'));
const CashierPage = lazy(() => import('./pages/CashierPage.jsx'));
const KitchenPage = lazy(() => import('./pages/KitchenPage.jsx'));
const MenuAdminPage = lazy(() => import('./pages/menu/MenuAdminPage.jsx'));
const ReportsPage = lazy(() => import('./pages/ReportsPage.jsx'));
const TeamPage = lazy(() => import('./pages/TeamPage.jsx'));
const SettingsPage = lazy(() => import('./pages/SettingsPage.jsx'));
const NewOrderPage = lazy(() => import('./pages/NewOrderPage.jsx'));
const TicketPage = lazy(() => import('./pages/TicketPage.jsx'));

export const STAFF_ROUTES = [
  { path: '/salon', perms: ['salon.ver'], component: FloorPage },
  { path: '/caja', perms: ['caja.ver'], component: CashierPage },
  { path: '/cocina', perms: ['cocina.ver'], component: KitchenPage },
  { path: '/carta', perms: ['carta.ver'], component: MenuAdminPage },
  { path: '/informes', perms: ['informes.ver'], component: ReportsPage },
  { path: '/equipo', perms: ['equipo.ver'], component: TeamPage },
  { path: '/ajustes', perms: [], component: SettingsPage },
  { path: '/pedido/:sessionId?', perms: ['pedidos.crear'], component: NewOrderPage },
  { path: '/ticket/:id', perms: ['caja.ver', 'salon.operar'], component: TicketPage },
];

function Guard({ perms, component: Component }) {
  const { can } = useAuth();
  if (perms.length && !can(...perms)) {
    return <EmptyState icon={ShieldAlert} title="Sin permiso" text="Tu rol no tiene acceso a esta sección. Consultá con un administrador." />;
  }
  return <Component />;
}

function homeFor(can) {
  const first = STAFF_ROUTES.find((r) => r.perms.length && can(...r.perms) && !r.path.includes(':'));
  return first?.path ?? '/ajustes';
}

function Gate() {
  const { user, loading, can } = useAuth();
  if (loading) return <Spinner className="min-h-dvh" label="Verificando sesión…" />;
  if (!user) return <LoginPage />;
  if (user.mustChangePassword) return <ChangePasswordPage forced />;
  return (
    <StaffDataProvider>
      <StaffLayout>
        <Suspense fallback={<Spinner />}>
          <Switch>
            {STAFF_ROUTES.map((r) => (
              <Route key={r.path} path={r.path}>
                <Guard perms={r.perms} component={r.component} />
              </Route>
            ))}
            <Route>
              <Redirect to={homeFor(can)} replace />
            </Route>
          </Switch>
        </Suspense>
      </StaffLayout>
    </StaffDataProvider>
  );
}

export default function StaffApp() {
  return (
    <AuthProvider>
      <Gate />
    </AuthProvider>
  );
}
