/**
 * Estado del comensal: mesa (token del QR), carrito local y carta en memoria.
 * Store observable mínimo con useSyncExternalStore (sin librerías extra).
 */
import { useSyncExternalStore } from 'react';
import { publicApi } from '../lib/api.js';
import { readStored, writeStored } from '../lib/hooks.js';

const TABLE_KEY = 'mesa-pase';
const CART_KEY = 'carrito';

function createStore(initial) {
  let state = initial;
  const listeners = new Set();
  return {
    get: () => state,
    set(next) {
      state = typeof next === 'function' ? next(state) : next;
      listeners.forEach((l) => l());
    },
    subscribe(l) {
      listeners.add(l);
      return () => listeners.delete(l);
    },
  };
}

// ---------------- Mesa ----------------
// La carta es libre. Para pedir, llamar al mozo o pedir la cuenta hay que escanear el QR de la mesa:
// el backend lo canjea por un "pase de mesa" que vence y se invalida cuando la mesa se libera.
function readPass() {
  const saved = readStored(TABLE_KEY);
  return saved && Date.parse(saved.expiresAt) > Date.now() ? saved : null;
}
const initialPass = readPass();
const tableStore = createStore({ pass: initialPass?.pass ?? null, expiresAt: initialPass?.expiresAt ?? null, info: null });

/** Extrae el token de un QR de mesa (URL .../m/<token>) o de un token suelto. */
export function qrTokenFrom(text) {
  const raw = String(text ?? '').trim();
  let candidate = raw;
  try {
    const url = new URL(raw);
    const match = url.pathname.match(/\/m\/([\w-]{8,64})\/?$/);
    candidate = match ? match[1] : '';
  } catch {
    /* no es una URL: puede ser el token solo */
  }
  return /^[\w-]{8,64}$/.test(candidate) ? candidate : null;
}

const scannerStore = createStore({ open: false, reason: null });
let scannerResolve = null;

export const tableActions = {
  /** Canjea el token de un QR escaneado por el pase de mesa. */
  async checkin(qrToken) {
    const { pass, expires_at: expiresAt, ...info } = await publicApi.post('/checkin', { qr: qrToken });
    writeStored(TABLE_KEY, { pass, expiresAt });
    tableStore.set({ pass, expiresAt, info });
    return info;
  },
  async refresh() {
    if (!tableStore.get().pass) return null;
    try {
      const info = await tableApi.get('');
      tableStore.set((s) => ({ ...s, info }));
      return info;
    } catch {
      return null;
    }
  },
  leave() {
    writeStored(TABLE_KEY, null);
    tableStore.set({ pass: null, expiresAt: null, info: null });
  },
  /**
   * Garantiza que el comensal escaneó el QR de su mesa antes de una acción.
   * Si no hay pase vigente abre el escáner y resuelve con la info de la mesa (o null si cancela).
   */
  async ensure(reason) {
    const { pass, info } = tableStore.get();
    if (pass && info) return info;
    if (pass) {
      const fresh = await tableActions.refresh();
      if (fresh) return fresh;
    }
    return new Promise((resolve) => {
      scannerResolve?.(null);
      scannerResolve = resolve;
      scannerStore.set({ open: true, reason });
    });
  },
};

export const scannerActions = {
  /** Abre el escáner sin una acción pendiente (p. ej. desde la cabecera). */
  open(reason) {
    return tableActions.ensure(reason);
  },
  done(info) {
    scannerStore.set({ open: false, reason: null });
    scannerResolve?.(info ?? null);
    scannerResolve = null;
  },
};

export const useScanner = () => useSyncExternalStore(scannerStore.subscribe, scannerStore.get);
export const useTable = () => useSyncExternalStore(tableStore.subscribe, tableStore.get);

/** Llamadas a la API de la mesa con el pase. Si el pase venció, se descarta y se vuelve a pedir el escaneo. */
async function withPass(fn) {
  const { pass } = tableStore.get();
  try {
    return await fn({ headers: { 'X-Table-Pass': pass ?? '' } });
  } catch (err) {
    if (err.code === 'CHECKIN_REQUIRED') tableActions.leave();
    throw err;
  }
}
export const tableApi = {
  get: (p) => withPass((o) => publicApi.get(`/table${p}`, o)),
  post: (p, body) => withPass((o) => publicApi.post(`/table${p}`, body, o)),
};

// ---------------- Carrito ----------------
const cartStore = createStore(readStored(CART_KEY) ?? []);
cartStore.subscribe(() => writeStored(CART_KEY, cartStore.get()));

const keyOf = (line) => `${line.product_id}|${[...line.modifiers].sort().join(',')}|${line.notes ?? ''}`;

export const cartActions = {
  add(line) {
    const key = keyOf(line);
    cartStore.set((items) => {
      const existing = items.find((i) => i.key === key);
      if (existing) return items.map((i) => (i.key === key ? { ...i, quantity: Math.min(50, i.quantity + line.quantity) } : i));
      return [...items, { ...line, key }];
    });
  },
  setQuantity(key, quantity) {
    cartStore.set((items) => (quantity <= 0 ? items.filter((i) => i.key !== key) : items.map((i) => (i.key === key ? { ...i, quantity } : i))));
  },
  remove(key) {
    cartStore.set((items) => items.filter((i) => i.key !== key));
  },
  clear() {
    cartStore.set([]);
  },
};

export const useCart = () => useSyncExternalStore(cartStore.subscribe, cartStore.get);
export const cartTotal = (items) => items.reduce((s, i) => s + i.unit_price * i.quantity, 0);
export const cartCount = (items) => items.reduce((s, i) => s + i.quantity, 0);

// ---------------- Carta ----------------
const menuStore = createStore({ data: null, error: null, loading: false });
let inflight = null;

export function loadMenu(force = false) {
  if (!force && (menuStore.get().data || inflight)) return inflight;
  menuStore.set((s) => ({ ...s, loading: true }));
  inflight = publicApi
    .get('/menu')
    .then((data) => menuStore.set({ data, error: null, loading: false }))
    .catch((error) => menuStore.set((s) => ({ ...s, error, loading: false })))
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

export function useMenu() {
  const state = useSyncExternalStore(menuStore.subscribe, menuStore.get);
  if (!state.data && !state.loading && !state.error) queueMicrotask(() => loadMenu());
  return state;
}

/** Precio unitario de una línea: precio final + adicionales elegidos. */
export function unitPriceFor(product, modifierIds) {
  const deltas = product.modifier_groups.flatMap((g) => g.options).filter((o) => modifierIds.includes(o.id)).reduce((s, o) => s + o.price_delta, 0);
  return product.final_price + deltas;
}
