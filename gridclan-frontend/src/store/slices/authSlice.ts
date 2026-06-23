import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import * as SecureStore from 'expo-secure-store';
import { authApi } from '@api/auth';
import type { AuthResponse, LoginRequest, RegisterRequest } from '@gridtypes/index';

interface AuthState {
  userId:       string | null;
  role:         string | null;
  accessToken:  string | null;
  isLoading:    boolean;
  error:        string | null;
}

const initialState: AuthState = {
  userId:      null,
  role:        null,
  accessToken: null,
  isLoading:   false,
  error:       null,
};

// ── Thunks ─────────────────────────────────────────────────────────────────

export const loginThunk = createAsyncThunk(
  'auth/login',
  async (data: LoginRequest, { rejectWithValue }) => {
    try {
      const res = await authApi.login(data);
      await saveTokens(res.data);
      return res.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message ?? 'Login failed');
    }
  }
);

export const registerThunk = createAsyncThunk(
  'auth/register',
  async (data: RegisterRequest, { rejectWithValue }) => {
    try {
      const res = await authApi.register(data);
      await saveTokens(res.data);
      return res.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message ?? 'Registration failed');
    }
  }
);

export const logoutThunk = createAsyncThunk('auth/logout', async () => {
  try { await authApi.logout(); } catch {}
  await SecureStore.deleteItemAsync('access_token');
  await SecureStore.deleteItemAsync('refresh_token');
});

export const hydrateAuth = createAsyncThunk('auth/hydrate', async () => {
  const token = await SecureStore.getItemAsync('access_token');
  if (!token) return null;
  // Decode payload without verifying sig (server does that)
  try {
    const [, payload] = token.split('.');
    const decoded = JSON.parse(atob(payload));
    if (decoded.exp * 1000 < Date.now()) return null;
    return { accessToken: token, userId: decoded.sub, role: decoded.role } as Partial<AuthResponse>;
  } catch {
    return null;
  }
});

// ── Slice ──────────────────────────────────────────────────────────────────

const authSlice = createSlice({
  name: 'auth',
  initialState,
  reducers: {
    clearError: (state) => { state.error = null; },
    setTokens: (state, action: PayloadAction<AuthResponse>) => {
      state.userId      = action.payload.userId;
      state.role        = action.payload.role;
      state.accessToken = action.payload.accessToken;
    },
  },
  extraReducers: builder => {
    // Login
    builder
      .addCase(loginThunk.pending,    state => { state.isLoading = true;  state.error = null; })
      .addCase(loginThunk.rejected,   (state, a) => { state.isLoading = false; state.error = a.payload as string; })
      .addCase(loginThunk.fulfilled,  (state, a) => {
        state.isLoading = false;
        state.userId = a.payload.userId; state.role = a.payload.role;
        state.accessToken = a.payload.accessToken;
      })
    // Register
      .addCase(registerThunk.pending,   state => { state.isLoading = true; state.error = null; })
      .addCase(registerThunk.rejected,  (state, a) => { state.isLoading = false; state.error = a.payload as string; })
      .addCase(registerThunk.fulfilled, (state, a) => {
        state.isLoading = false;
        state.userId = a.payload.userId; state.role = a.payload.role;
        state.accessToken = a.payload.accessToken;
      })
    // Logout
      .addCase(logoutThunk.fulfilled, () => initialState)
    // Hydrate on app launch
      .addCase(hydrateAuth.fulfilled, (state, a) => {
        if (a.payload) {
          state.userId = a.payload.userId ?? null;
          state.role   = a.payload.role   ?? null;
          state.accessToken = a.payload.accessToken ?? null;
        }
      });
  },
});

export const { clearError, setTokens } = authSlice.actions;
export default authSlice.reducer;

async function saveTokens(data: AuthResponse) {
  await SecureStore.setItemAsync('access_token',  data.accessToken);
  await SecureStore.setItemAsync('refresh_token', data.refreshToken);
}
