import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { gemsApi } from '@api/index';
import type { GemBalance, GemTransaction, GiftGemsRequest } from '@gridtypes/index';

interface GemsState {
  balance:   GemBalance | null;
  history:   GemTransaction[];
  isLoading: boolean;
  error:     string | null;
}

const initialState: GemsState = {
  balance:   null,
  history:   [],
  isLoading: false,
  error:     null,
};

export const fetchGemBalanceThunk = createAsyncThunk(
  'gems/fetchBalance',
  async (_, { rejectWithValue }) => {
    try { return (await gemsApi.getBalance()).data; }
    catch (e: any) { return rejectWithValue(e.response?.data?.message ?? 'Failed to fetch gems'); }
  },
);

export const fetchGemHistoryThunk = createAsyncThunk(
  'gems/fetchHistory',
  async (limit: number = 50, { rejectWithValue }) => {
    try { return (await gemsApi.getHistory(limit)).data; }
    catch (e: any) { return rejectWithValue(e.response?.data?.message ?? 'Failed to fetch history'); }
  },
);

export const giftGemsThunk = createAsyncThunk(
  'gems/gift',
  async (req: GiftGemsRequest, { dispatch, rejectWithValue }) => {
    try {
      const res = (await gemsApi.gift(req)).data;
      // Reconcile with the authoritative server balance.
      dispatch(fetchGemBalanceThunk());
      return res;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message ?? 'Could not send gift');
    }
  },
);

const gemsSlice = createSlice({
  name: 'gems',
  initialState,
  reducers: {
    // Optimistic local debit on spend (revive/hint/replay); server reconciles.
    spendGemsOptimistic: (state, action) => {
      if (state.balance) state.balance.balance = Math.max(0, state.balance.balance - action.payload);
    },
    creditGemsOptimistic: (state, action) => {
      if (state.balance) state.balance.balance += action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchGemBalanceThunk.pending,   state => { state.isLoading = true; })
      .addCase(fetchGemBalanceThunk.rejected,  (state, a) => { state.isLoading = false; state.error = a.payload as string; })
      .addCase(fetchGemBalanceThunk.fulfilled, (state, a) => { state.isLoading = false; state.balance = a.payload; })
      .addCase(fetchGemHistoryThunk.fulfilled, (state, a) => { state.history = a.payload; });
  },
});

export const { spendGemsOptimistic, creditGemsOptimistic } = gemsSlice.actions;
export default gemsSlice.reducer;
