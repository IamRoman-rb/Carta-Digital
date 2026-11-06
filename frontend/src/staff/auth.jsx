import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import { api, refreshSession, session } from '../lib/api.js';
import { readStored, writeStored } from '../lib/hooks.js';

// Marca no sensible: evita pedir /auth/refresh si nunca hubo sesión en este navegador.
const HINT = 'staff-session';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(() => !!readStored(HINT));

  useEffect(() => {
    const unsubscribe = session.subscribe((u) => setUser(u));
    // Restaura la sesión con la cookie httpOnly de refresh (si existe).
    if (!readStored(HINT)) return unsubscribe;
    refreshSession()
      .catch(() => writeStored(HINT, null))
      .finally(() => setLoading(false));
    return unsubscribe;
  }, []);

  const login = useCallback(async (username, password) => {
    const data = await api.post('/auth/login', { username, password });
    session.set(data.accessToken, data.user);
    writeStored(HINT, true);
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    await api.post('/auth/logout').catch(() => null);
    writeStored(HINT, null);
    session.clear();
  }, []);

  const changePassword = useCallback(async (currentPassword, newPassword) => {
    const data = await api.post('/auth/change-password', { currentPassword, newPassword });
    session.set(data.accessToken, data.user);
  }, []);

  const value = useMemo(() => {
    const perms = new Set(user?.permissions ?? []);
    return { user, loading, login, logout, changePassword, can: (...codes) => codes.some((c) => perms.has(c)) };
  }, [user, loading, login, logout, changePassword]);

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);
