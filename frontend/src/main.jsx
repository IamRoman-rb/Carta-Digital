import { StrictMode, lazy, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { Route, Switch } from 'wouter';
import './index.css';
import CustomerApp from './customer/CustomerApp.jsx';
import TableEntry from './customer/pages/TableEntry.jsx';
import { Spinner } from './ui/index.jsx';

// El panel del personal es un bundle aparte: el comensal nunca lo descarga.
const StaffApp = lazy(() => import('./staff/StaffApp.jsx'));

createRoot(document.getElementById('root')).render(
  <StrictMode>
    <Switch>
      <Route path="/staff" nest>
        <Suspense fallback={<Spinner className="min-h-dvh" />}>
          <StaffApp />
        </Suspense>
      </Route>
      <Route path="/m/:token" component={TableEntry} />
      <Route>
        <CustomerApp />
      </Route>
    </Switch>
  </StrictMode>,
);
