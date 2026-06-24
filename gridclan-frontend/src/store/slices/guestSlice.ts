import { createSlice } from '@reduxjs/toolkit';

// Tracks how many local "trial" solo games a guest (not-yet-registered user)
// has played. Persisted so the trial limit survives app restarts. Real,
// server-scored play is only available after registration.
export const SOLO_TRIAL_LIMIT = 3;

interface GuestState {
  soloPlays: number;
}

const initialState: GuestState = { soloPlays: 0 };

const guestSlice = createSlice({
  name: 'guest',
  initialState,
  reducers: {
    recordSoloPlay: (s) => { s.soloPlays += 1; },
    resetGuestTrial: () => initialState,
  },
});

export const { recordSoloPlay, resetGuestTrial } = guestSlice.actions;
export default guestSlice.reducer;
