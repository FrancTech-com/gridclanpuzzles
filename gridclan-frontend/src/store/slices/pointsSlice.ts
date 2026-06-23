import { createAsyncThunk, createSlice } from '@reduxjs/toolkit';
import { pointsApi } from '@api/index';
import type { PointsBalance, LedgerEntry } from '@gridtypes/index';

interface PointsState {
  balance:   PointsBalance | null;
  history:   LedgerEntry[];
  isLoading: boolean;
  error:     string | null;
}

const initialState: PointsState = {
  balance:   null,
  history:   [],
  isLoading: false,
  error:     null,
};

export const fetchBalanceThunk = createAsyncThunk('points/fetchBalance', async (_, { rejectWithValue }) => {
  try { return (await pointsApi.getBalance()).data; }
  catch (e: any) { return rejectWithValue(e.response?.data?.message ?? 'Failed to fetch balance'); }
});

export const fetchHistoryThunk = createAsyncThunk('points/fetchHistory', async (limit: number = 50, { rejectWithValue }) => {
  try { return (await pointsApi.getHistory(limit)).data; }
  catch (e: any) { return rejectWithValue(e.response?.data?.message ?? 'Failed to fetch history'); }
});

const pointsSlice = createSlice({
  name: 'points',
  initialState,
  reducers: {
    incrementBalance: (state, action) => {
      if (state.balance) state.balance.balance += action.payload;
    },
  },
  extraReducers: builder => {
    builder
      .addCase(fetchBalanceThunk.pending,   state => { state.isLoading = true; })
      .addCase(fetchBalanceThunk.rejected,  (state, a) => { state.isLoading = false; state.error = a.payload as string; })
      .addCase(fetchBalanceThunk.fulfilled, (state, a) => { state.isLoading = false; state.balance = a.payload; })
      .addCase(fetchHistoryThunk.fulfilled, (state, a) => { state.history = a.payload; });
  },
});

export const { incrementBalance } = pointsSlice.actions;
export default pointsSlice.reducer;
