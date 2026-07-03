import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import { getItem, setItem, deleteItem } from '@utils/secureStorage';
import Constants from 'expo-constants';
import { createPinnedAdapter } from './pinnedAdapter';

const BASE_URL = Constants.expoConfig?.extra?.API_BASE_URL ?? 'https://api.gridclanpuzzle.win';

// Certificate pinning in production builds; undefined → default transport (dev)
const pinnedAdapter = createPinnedAdapter();

export const apiClient = axios.create({
  baseURL: BASE_URL,
  timeout: 10_000,
  headers: { 'Content-Type': 'application/json' },
  ...(pinnedAdapter ? { adapter: pinnedAdapter } : {}),
});

// ── Request interceptor — attach access token ──────────────────────────────
apiClient.interceptors.request.use(async (config: InternalAxiosRequestConfig) => {
  const token = await getItem('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor — auto-refresh on 401 ────────────────────────────
let refreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

// ── Fresh-token helper for non-axios transports (WebSocket/STOMP) ──────────
// The STOMP CONNECT frame carries a JWT. Access tokens live only 5 minutes,
// so every (re)connect attempt must fetch a currently-valid one — a token
// captured once at socket creation goes stale and every reconnect is then
// rejected. Refreshes are deduped so a reconnect storm can't burn the
// rotating refresh token.
let wsRefresh: Promise<string | null> | null = null;

function tokenExpiresSoon(token: string): boolean {
  try {
    const b64 = token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = typeof atob === 'function'
      ? atob(b64)
      : (globalThis as any).Buffer?.from(b64, 'base64').toString('utf8');
    if (!json) return false;
    const exp = JSON.parse(json)?.exp;
    return typeof exp === 'number' && exp * 1000 < Date.now() + 30_000;
  } catch {
    return false;  // undecodable → use as-is, let the server decide
  }
}

export async function getFreshAccessToken(): Promise<string | null> {
  const token = await getItem('access_token');
  if (token && !tokenExpiresSoon(token)) return token;
  if (!wsRefresh) {
    wsRefresh = (async () => {
      try {
        const refreshToken = await getItem('refresh_token');
        if (!refreshToken) return token;
        const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken },
          pinnedAdapter ? { adapter: pinnedAdapter } : undefined);
        await setItem('access_token',  data.accessToken);
        await setItem('refresh_token', data.refreshToken);
        return data.accessToken as string;
      } catch {
        return token;  // let the CONNECT fail visibly rather than throw here
      } finally {
        wsRefresh = null;
      }
    })();
  }
  return wsRefresh;
}

apiClient.interceptors.response.use(
  res => res,
  async (error: AxiosError) => {
    const original = error.config as InternalAxiosRequestConfig & { _retry?: boolean };

    if (error.response?.status !== 401 || original._retry) {
      return Promise.reject(error);
    }

    // Skip refresh loop for auth endpoints
    if (original.url?.includes('/auth/')) {
      return Promise.reject(error);
    }

    if (refreshing) {
      // Queue concurrent requests while refresh is in flight
      return new Promise((resolve, reject) => {
        refreshQueue.push((token: string) => {
          original.headers.Authorization = `Bearer ${token}`;
          resolve(apiClient(original));
        });
      });
    }

    original._retry = true;
    refreshing = true;

    try {
      const refreshToken = await getItem('refresh_token');
      if (!refreshToken) throw new Error('No refresh token');

      // Refresh bypasses apiClient (no auth header / no interceptor loop) but
      // must still travel over the pinned transport in production.
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken },
        pinnedAdapter ? { adapter: pinnedAdapter } : undefined);
      await setItem('access_token',  data.accessToken);
      await setItem('refresh_token', data.refreshToken);

      // Drain queue
      refreshQueue.forEach(cb => cb(data.accessToken));
      refreshQueue = [];

      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(original);

    } catch {
      // Refresh failed — clear tokens, force logout
      await deleteItem('access_token');
      await deleteItem('refresh_token');
      refreshQueue = [];
      return Promise.reject(error);
    } finally {
      refreshing = false;
    }
  }
);
