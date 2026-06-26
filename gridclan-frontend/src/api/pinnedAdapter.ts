import {
  AxiosAdapter,
  AxiosError,
  AxiosResponse,
  InternalAxiosRequestConfig,
} from 'axios';
import { NativeModules } from 'react-native';
import Constants from 'expo-constants';

/**
 * Certificate pinning (blueprint § SECURITY — FRONTEND).
 *
 * Production builds route all API traffic through react-native-ssl-pinning,
 * which rejects any TLS chain whose leaf doesn't match a bundled certificate
 * — defeating MITM proxies even when a rogue CA is installed on the device.
 *
 * Bundled certs (no extension here; .cer files added during `expo prebuild`):
 *   Android: android/app/src/main/assets/gridclan-api.cer
 *   iOS:     ios/<target>/gridclan-api.cer (added to the bundle)
 * Rotation: bundle BOTH the current and next cert before the current one
 * expires, ship the update, then drop the old one.
 *
 * Dev builds and Expo Go (no native module) fall back to the default axios
 * transport — pinning is a production control, per spec.
 */
const PINNED_CERTS = ['gridclan-api'];

type PinnedFetchResponse = {
  status: number;
  bodyString?: string;
  headers?: Record<string, string>;
};

export function createPinnedAdapter(): AxiosAdapter | undefined {
  if (__DEV__) return undefined;
  // OFF by default: pinning requires a matching cert bundled at build time
  // (android/app/src/main/assets/gridclan-api.cer). Without it, every request
  // would fail. Enable only after bundling current+next certs and a rotation
  // plan — flip extra.sslPinningEnabled to true. Until then we use standard
  // TLS (still HTTPS/WSS), so the app connects normally.
  if (!Constants.expoConfig?.extra?.sslPinningEnabled) return undefined;
  if (!NativeModules.RNSslPinning) return undefined; // Expo Go / not prebuilt

  // Required lazily so importing this file never crashes in Expo Go.
  const { fetch: pinnedFetch } = require('react-native-ssl-pinning');

  return async (config: InternalAxiosRequestConfig): Promise<AxiosResponse> => {
    const url = buildUrl(config);
    const method = (config.method ?? 'get').toUpperCase();

    const headers: Record<string, string> = {};
    config.headers?.forEach?.((value: string, key: string) => {
      headers[key] = value;
    });

    const body =
      config.data == null
        ? undefined
        : typeof config.data === 'string'
          ? config.data
          : JSON.stringify(config.data);

    try {
      const res: PinnedFetchResponse = await pinnedFetch(url, {
        method,
        headers,
        body,
        timeoutInterval: config.timeout || 10_000,
        sslPinning: { certs: PINNED_CERTS },
      });
      return toAxiosResponse(res, config);
    } catch (err) {
      const failure = err as PinnedFetchResponse & { message?: string };
      if (typeof failure?.status === 'number') {
        // HTTP error — surface as a normal axios error WITH response, so the
        // 401 auto-refresh interceptor keeps working under pinning.
        throw new AxiosError(
          `Request failed with status code ${failure.status}`,
          String(failure.status),
          config,
          undefined,
          toAxiosResponse(failure, config),
        );
      }
      // Network failure or pin mismatch — no response object.
      throw new AxiosError(
        failure?.message ?? 'Network or certificate validation failure',
        AxiosError.ERR_NETWORK,
        config,
      );
    }
  };
}

function buildUrl(config: InternalAxiosRequestConfig): string {
  const base = config.baseURL ?? '';
  const path = config.url ?? '';
  const joined =
    path.startsWith('http')
      ? path
      : `${base.replace(/\/$/, '')}/${path.replace(/^\//, '')}`;

  if (!config.params) return joined;
  const query = new URLSearchParams(
    Object.entries(config.params).map(([k, v]) => [k, String(v)]),
  ).toString();
  return query ? `${joined}${joined.includes('?') ? '&' : '?'}${query}` : joined;
}

function toAxiosResponse(
  res: PinnedFetchResponse,
  config: InternalAxiosRequestConfig,
): AxiosResponse {
  let data: unknown = res.bodyString;
  try {
    data = res.bodyString ? JSON.parse(res.bodyString) : undefined;
  } catch {
    // Non-JSON body — return as text
  }
  return {
    data,
    status: res.status,
    statusText: String(res.status),
    headers: res.headers ?? {},
    config,
  };
}
