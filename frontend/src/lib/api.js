/**
 * Cliente HTTP. El token de acceso vive solo en memoria (no en localStorage, mitigando XSS);
 * la renovación usa la cookie httpOnly del refresh token.
 */
const BASE = import.meta.env.VITE_API_URL;
if (!BASE) throw new Error('Falta VITE_API_URL (ver frontend/.env.example)');

let accessToken = null;
let refreshing = null;
const authListeners = new Set();

export class ApiError extends Error {
  constructor(status, body) {
    super(body?.error?.message ?? `Error ${status}`);
    this.status = status;
    this.code = body?.error?.code;
    this.details = body?.error?.details;
  }
}

export const session = {
  get token() {
    return accessToken;
  },
  set(token, user) {
    accessToken = token;
    authListeners.forEach((l) => l(user ?? null));
  },
  clear() {
    accessToken = null;
    authListeners.forEach((l) => l(null));
  },
  subscribe(listener) {
    authListeners.add(listener);
    return () => authListeners.delete(listener);
  },
};

export async function refreshSession() {
  refreshing ??= fetch(`${BASE}/auth/refresh`, { method: 'POST', credentials: 'include' })
    .then(async (res) => {
      if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
      const data = await res.json();
      session.set(data.accessToken, data.user);
      return data.user;
    })
    .finally(() => {
      refreshing = null;
    });
  return refreshing;
}

async function request(path, { method = 'GET', body, form, auth = true, signal, raw = false, retry = true, headers: extra } = {}) {
  const headers = { ...extra };
  if (body !== undefined) headers['Content-Type'] = 'application/json';
  if (auth && accessToken) headers.Authorization = `Bearer ${accessToken}`;
  let res;
  try {
    res = await fetch(`${BASE}${path}`, {
      method,
      headers,
      body: form ?? (body !== undefined ? JSON.stringify(body) : undefined),
      credentials: auth ? 'include' : 'same-origin',
      signal,
    });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new ApiError(0, { error: { message: 'Sin conexión. Revisá tus datos móviles o WiFi.' } });
  }
  if (res.status === 401 && auth && retry && !path.startsWith('/auth/')) {
    try {
      await refreshSession();
      return request(path, { method, body, form, auth, signal, raw, retry: false });
    } catch {
      session.clear();
    }
  }
  if (!res.ok) throw new ApiError(res.status, await res.json().catch(() => null));
  if (raw) return res;
  if (res.status === 204) return null;
  return res.json();
}

export const api = {
  get: (p, o) => request(p, o),
  post: (p, body, o) => request(p, { ...o, method: 'POST', body }),
  put: (p, body, o) => request(p, { ...o, method: 'PUT', body }),
  patch: (p, body, o) => request(p, { ...o, method: 'PATCH', body }),
  del: (p, o) => request(p, { ...o, method: 'DELETE' }),
  upload(p, file) {
    const form = new FormData();
    form.append('file', file);
    return request(p, { method: 'POST', form });
  },
  raw: (p, o) => request(p, { ...o, raw: true }),
};

/** API pública para comensales (sin credenciales). */
export const publicApi = {
  get: (p, o) => request(`/public${p}`, { ...o, auth: false }),
  post: (p, body, o) => request(`/public${p}`, { ...o, method: 'POST', body, auth: false }),
};

export const streamUrl = () => `${BASE}/realtime/stream?token=${encodeURIComponent(accessToken ?? '')}`;
