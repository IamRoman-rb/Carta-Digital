import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';

/** Carga asíncrona con estado de carga/error y recarga manual. */
export function useAsync(fn, deps = []) {
  const [state, setState] = useState({ data: null, error: null, loading: true });
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  const seq = useRef(0);

  const reload = useCallback(async ({ silent = false } = {}) => {
    const id = ++seq.current;
    if (!silent) setState((s) => ({ ...s, loading: true }));
    try {
      const data = await fnRef.current();
      if (id === seq.current) setState({ data, error: null, loading: false });
      return data;
    } catch (error) {
      if (id === seq.current) setState((s) => ({ ...s, error, loading: false }));
      return null;
    }
  }, []);

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);

  return { ...state, reload, setData: (data) => setState((s) => ({ ...s, data: typeof data === 'function' ? data(s.data) : data })) };
}

/** Ejecuta fn cada `ms` solo mientras la pestaña está visible (ahorro de datos y batería). */
export function usePolling(fn, ms, enabled = true) {
  const fnRef = useRef(fn);
  useLayoutEffect(() => {
    fnRef.current = fn;
  });
  useEffect(() => {
    if (!enabled) return undefined;
    let timer;
    const tick = () => {
      if (document.visibilityState === 'visible') fnRef.current();
    };
    const start = () => {
      clearInterval(timer);
      timer = setInterval(tick, ms);
    };
    const onVisible = () => {
      if (document.visibilityState === 'visible') {
        tick();
        start();
      } else clearInterval(timer);
    };
    start();
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [ms, enabled]);
}

/** Reloj que se actualiza cada `ms`. */
export function useNow(ms = 1000) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), ms);
    return () => clearInterval(t);
  }, [ms]);
  return now;
}

/** Estado persistido en localStorage con caducidad opcional. */
export function readStored(key, maxAgeMs) {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    const { value, at } = JSON.parse(raw);
    if (maxAgeMs && Date.now() - at > maxAgeMs) {
      localStorage.removeItem(key);
      return null;
    }
    return value;
  } catch {
    return null;
  }
}

export function writeStored(key, value) {
  try {
    if (value == null) localStorage.removeItem(key);
    else localStorage.setItem(key, JSON.stringify({ value, at: Date.now() }));
  } catch {
    /* almacenamiento no disponible (modo privado): se ignora */
  }
}
