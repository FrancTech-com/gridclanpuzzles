import { createAsyncThunk, createSlice, PayloadAction } from '@reduxjs/toolkit';
import { gameApi } from '@api/index';
import type {
  SessionStartRequest, SessionStartResponse,
  MoveRequest, MoveResponse, HintResponse,
  BoardState, SessionStatus,
} from '@gridtypes/index';

interface GameState {
  session:      SessionStartResponse | null;
  boardState:   BoardState | null;
  score:        number;
  moveCount:    number;
  moveLimit:    number;     // 0 = no limit
  status:       SessionStatus | null;
  hintsAllowed: boolean;    // From server — never from client
  hintData:     object | null;
  isLoading:    boolean;
  isMoveLoading: boolean;
  error:        string | null;
}

const initialState: GameState = {
  session:       null,
  boardState:    null,
  score:         0,
  moveCount:     0,
  moveLimit:     0,
  status:        null,
  hintsAllowed:  false,
  hintData:      null,
  isLoading:     false,
  isMoveLoading: false,
  error:         null,
};

/** Rejected thunks carry a message + whether the failure was "not enough gems",
 *  so the UI can pop the buy-gems card instead of a red error. */
export interface GameReject { message: string; insufficient: boolean }
const toReject = (e: any, fallback: string): GameReject => ({
  message:      e?.response?.data?.message ?? fallback,
  insufficient: e?.response?.data?.error === 'INSUFFICIENT_GEMS',
});

// ── Thunks ─────────────────────────────────────────────────────────────────

export const startSessionThunk = createAsyncThunk(
  'game/startSession',
  async (req: SessionStartRequest, { rejectWithValue }) => {
    try {
      const res = await gameApi.startSession(req);
      return res.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message ?? 'Failed to start session');
    }
  }
);

export const submitMoveThunk = createAsyncThunk(
  'game/submitMove',
  async (req: MoveRequest, { rejectWithValue }) => {
    try {
      const res = await gameApi.submitMove(req);
      return res.data;
    } catch (e: any) {
      return rejectWithValue(e.response?.data?.message ?? 'Move rejected');
    }
  }
);

export const requestHintThunk = createAsyncThunk(
  'game/requestHint',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      const res = await gameApi.requestHint(sessionId);
      return res.data;
    } catch (e: any) {
      return rejectWithValue(toReject(e, 'Hint unavailable'));
    }
  }
);

/** Spend gems to revive a failed solo/casual session and keep playing. */
export const reviveThunk = createAsyncThunk(
  'game/revive',
  async (sessionId: string, { rejectWithValue }) => {
    try {
      const res = await gameApi.revive(sessionId);
      return res.data;
    } catch (e: any) {
      return rejectWithValue(toReject(e, 'Revive unavailable'));
    }
  }
);

// ── Slice ──────────────────────────────────────────────────────────────────

const gameSlice = createSlice({
  name: 'game',
  initialState,
  reducers: {
    clearGame: () => initialState,
    clearError: state => { state.error = null; },
  },
  extraReducers: builder => {
    builder
      // Start session
      .addCase(startSessionThunk.pending,   state => { state.isLoading = true; state.error = null; })
      .addCase(startSessionThunk.rejected,  (state, a) => { state.isLoading = false; state.error = a.payload as string; })
      .addCase(startSessionThunk.fulfilled, (state, a) => {
        state.isLoading   = false;
        state.session     = a.payload;
        state.boardState  = a.payload.initialBoard;
        state.score       = 0;
        state.moveCount   = 0;
        state.moveLimit   = a.payload.moveLimit ?? 0;
        state.status      = 'ACTIVE';
        // SERVER sets this — never read from client request
        state.hintsAllowed = a.payload.hintsAllowed;
        state.hintData    = null;
      })
      // Submit move
      .addCase(submitMoveThunk.pending,   state => { state.isMoveLoading = true; state.error = null; })
      .addCase(submitMoveThunk.rejected,  (state, a) => { state.isMoveLoading = false; state.error = a.payload as string; })
      .addCase(submitMoveThunk.fulfilled, (state, a) => {
        state.isMoveLoading = false;
        // Replace board state entirely with server response
        state.boardState = a.payload.boardState;
        state.score      = a.payload.score;
        state.moveCount  = a.payload.moveCount;
        state.moveLimit  = a.payload.moveLimit ?? state.moveLimit;
        state.status     = a.payload.status;
      })
      // Request hint
      .addCase(requestHintThunk.pending,   state => { state.isLoading = true; state.error = null; })
      .addCase(requestHintThunk.rejected,  (state, a) => { state.isLoading = false; state.error = (a.payload as GameReject)?.message ?? 'Hint unavailable'; })
      .addCase(requestHintThunk.fulfilled, (state, a) => {
        state.isLoading  = false;
        state.boardState = a.payload.boardState;
        state.score      = a.payload.score;
        state.hintData   = a.payload.hintData;
      })
      // Revive (gems spent server-side)
      .addCase(reviveThunk.pending,   state => { state.isMoveLoading = true; state.error = null; })
      .addCase(reviveThunk.rejected,  (state, a) => { state.isMoveLoading = false; state.error = (a.payload as GameReject)?.message ?? 'Revive unavailable'; })
      .addCase(reviveThunk.fulfilled, (state, a) => {
        state.isMoveLoading = false;
        state.boardState = a.payload.boardState;
        state.score      = a.payload.score;
        state.moveCount  = a.payload.moveCount;
        state.moveLimit  = a.payload.moveLimit ?? state.moveLimit;
        state.status     = a.payload.status;
      });
  },
});

export const { clearGame, clearError } = gameSlice.actions;
export default gameSlice.reducer;
