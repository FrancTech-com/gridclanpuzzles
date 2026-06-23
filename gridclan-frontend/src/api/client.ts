import axios, { AxiosError, InternalAxiosRequestConfig } from 'axios';
import * as SecureStore from 'expo-secure-store';
import Constants from 'expo-constants';
import { createPinnedAdapter } from './pinnedAdapter';

const BASE_URL = Constants.expoConfig?.extra?.API_BASE_URL ?? 'https://api.gridclan.gg';

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
  const token = await SecureStore.getItemAsync('access_token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ── Response interceptor — auto-refresh on 401 ────────────────────────────
let refreshing = false;
let refreshQueue: Array<(token: string) => void> = [];

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
      const refreshToken = await SecureStore.getItemAsync('refresh_token');
      if (!refreshToken) throw new Error('No refresh token');

      // Refresh bypasses apiClient (no auth header / no interceptor loop) but
      // must still travel over the pinned transport in production.
      const { data } = await axios.post(`${BASE_URL}/auth/refresh`, { refreshToken },
        pinnedAdapter ? { adapter: pinnedAdapter } : undefined);
      await SecureStore.setItemAsync('access_token',  data.accessToken);
      await SecureStore.setItemAsync('refresh_token', data.refreshToken);

      // Drain queue
      refreshQueue.forEach(cb => cb(data.accessToken));
      refreshQueue = [];

      original.headers.Authorization = `Bearer ${data.accessToken}`;
      return apiClient(original);

    } catch {
      // Refresh failed — clear tokens, force logout
      await SecureStore.deleteItemAsync('access_token');
      await SecureStore.deleteItemAsync('refresh_token');
      refreshQueue = [];
      return Promise.reject(error);
    } finally {
      refreshing = false;
    }
  }
);
