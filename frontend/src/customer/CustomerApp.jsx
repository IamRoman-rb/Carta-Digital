import { lazy, Suspense, useEffect } from 'react';
import { Link, Route, Switch, useLocation } from 'wouter';
import { BookOpen, Box, ConciergeBell, QrCode, ReceiptText } from 'lucide-react';
import { Spinner, cx } from '../ui/index.jsx';
import { useCart, cartCount, useTable, tableActions, loadMenu, useMenu, useScanner, scannerActions } from './store.js';
import CallWaiterButton from './components/CallWaiterButton.jsx';
import MenuPage from './pages/MenuPage.jsx';
import NotFoundPage from './pages/NotFoundPage.jsx';

// Primer acceso = solo la carta. El resto se descarga al navegar (y queda en caché del service worker).
const ProductPage = lazy(() => import('./pages/ProductPage.jsx'));
const OrderPage = lazy(() => import('./pages/OrderPage.jsx'));
const BillPage = lazy(() => import('./pages/BillPage.jsx'));
const LegalPage = lazy(() => import('./pages/LegalPage.jsx'));
// El visor 3D/AR (model-viewer + three.js) se descarga solo si el comensal lo abre.
const ArPage = lazy(() => import('./pages/ArPage.jsx'));
// Escáner del QR de la mesa: solo cuando el comensal va a pedir, llamar al mozo o pedir la cuenta.
const TableScanner = lazy(() => import('./components/TableScanner.jsx'));

function ScannerHost() {
  const { open, reason } = useScanner();
  if (!open) return null;
  return (
    <Suspense fallback={<div className="fixed inset-0 z-[60] grid place-items-center bg-black"><Spinner className="!text-white" label="Abriendo la cámara…" /></div>}>
      <TableScanner reason={reason} />
    </Suspense>
  );
}

function Header() {
  const { info } = useTable();
  const { data } = useMenu();
  return (
    <header className="glass sticky top-0 z-40 shadow-base">
      <div className="mx-auto flex h-16 max-w-5xl items-center justify-between gap-3 px-4">
        <Link href="/" className="flex min-w-0 items-center gap-2">
          <img src="/favicon.svg" alt="" className="size-8 shrink-0" width="32" height="32" />
          <span className="truncate font-headline text-headline-sm font-bold text-primary">{data?.settings.business_name ?? 'Carta'}</span>
        </Link>
        {info ? (
          <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-surface-container px-3 py-1 text-label font-semibold">
            <span className="size-2 rounded-full bg-tertiary-container" aria-hidden="true" />
            Mesa {info.session?.tables?.join(' + ') ?? info.table.number} · {info.table.sector}
          </span>
        ) : (
          <button
            type="button"
            onClick={() => scannerActions.open('Escaneá el QR impreso en tu mesa para poder pedir desde el celular.')}
            className="flex shrink-0 items-center gap-1.5 rounded-full bg-primary-container px-3 py-1.5 text-label font-semibold text-white"
          >
            <QrCode className="size-4" aria-hidden="true" /> Escanear mesa
          </button>
        )}
      </div>
    </header>
  );
}

const NAV = [
  { href: '/', label: 'Carta', icon: BookOpen },
  { href: '/ar', label: 'Ver en AR', icon: Box },
  { href: '/pedido', label: 'Mi pedido', icon: ConciergeBell, badge: true },
  { href: '/cuenta', label: 'Cuenta', icon: ReceiptText },
];

function BottomNav() {
  const [location] = useLocation();
  const count = cartCount(useCart());
  return (
    <nav aria-label="Navegación principal" className="glass pb-safe fixed inset-x-0 bottom-0 z-40 border-t border-outline-variant/30">
      <ul className="mx-auto grid h-16 max-w-xl grid-cols-4">
        {NAV.map(({ href, label, icon: Icon, badge }) => {
          const active = href === '/' ? location === '/' : location.startsWith(href);
          return (
            <li key={href}>
              <Link href={href} aria-current={active ? 'page' : undefined} className={cx('relative flex h-full flex-col items-center justify-center gap-0.5 text-micro font-semibold', active ? 'text-primary' : 'text-on-surface-variant')}>
                <Icon className="size-6" aria-hidden="true" />
                {label}
                {badge && count > 0 && (
                  <span className="absolute top-1.5 left-[calc(50%+6px)] grid min-w-5 place-items-center rounded-full bg-secondary-container px-1 text-micro font-bold text-on-secondary-container" aria-label={`${count} en el pedido`}>
                    {count}
                  </span>
                )}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

export default function CustomerApp() {
  const [location] = useLocation();
  useEffect(() => {
    loadMenu();
    tableActions.refresh();
  }, []);
  useEffect(() => {
    // Llaves explícitas: en navegadores recientes scrollTo() devuelve una Promise y no debe tomarse como cleanup.
    window.scrollTo(0, 0);
  }, [location]);

  return (
    <div className="flex min-h-dvh flex-col">
      <a href="#contenido" className="sr-only focus:not-sr-only focus:absolute focus:top-2 focus:left-2 focus:z-50 focus:rounded-full focus:bg-on-surface focus:px-4 focus:py-2 focus:text-surface">
        Saltar al contenido
      </a>
      <Header />
      <main id="contenido" className="mx-auto w-full max-w-5xl flex-1 px-4 pt-4 pb-40">
        <Suspense fallback={<Spinner />}>
          <Switch>
            <Route path="/" component={MenuPage} />
            <Route path="/plato/:id" component={ProductPage} />
            <Route path="/ar/:id?" component={ArPage} />
            <Route path="/pedido" component={OrderPage} />
            <Route path="/cuenta" component={BillPage} />
            <Route path="/legales" component={LegalPage} />
            <Route component={NotFoundPage} />
          </Switch>
        </Suspense>
      </main>
      <CallWaiterButton />
      <BottomNav />
      <ScannerHost />
    </div>
  );
}
