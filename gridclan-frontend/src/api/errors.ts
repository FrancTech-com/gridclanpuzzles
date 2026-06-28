import { AxiosError } from 'axios';

// Map an axios/network failure to a user-facing message. The important case:
// when the request never reached the server (timeout, DNS, server down) there
// is no `response`, so falling back to a generic "X failed" hides the real
// problem. Distinguish that from an actual server-returned error.
export function apiErrorMessage(e: unknown, fallback: string): string {
  const err = e as AxiosError<{ message?: string; error?: string }>;

  // Request was made but no response — connectivity/timeout/server down.
  if (err?.isAxiosError && !err.response) {
    if (err.code === 'ECONNABORTED') {
      return 'The server took too long to respond. Please try again.';
    }
    return "Can't reach the server. Check your connection and try again.";
  }

  // Server responded: prefer its message; soften opaque 5xx errors.
  // Controllers return the human-readable text under either `message` or
  // `error` (e.g. 409 conflicts use `{"error": "Email already registered."}`),
  // so check both before falling back.
  const status = err?.response?.status;
  const serverMessage = err?.response?.data?.message ?? err?.response?.data?.error;
  if (serverMessage) return serverMessage;
  if (status && status >= 500) {
    return 'The server is having problems. Please try again in a moment.';
  }
  return fallback;
}
