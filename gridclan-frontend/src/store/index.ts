import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authReducer  from './slices/authSlice';
import gameReducer  from './slices/gameSlice';
import pointsReducer from './slices/pointsSlice';
import gemsReducer   from './slices/gemsSlice';
import guestReducer  from './slices/guestSlice';

const rootReducer = combineReducers({
  auth:   authReducer,
  game:   gameReducer,
  points: pointsReducer,
  gems:   gemsReducer,
  guest:  guestReducer,
});

const persistConfig = {
  key:       'gridclan-root',
  storage:   AsyncStorage,
  whitelist: ['auth', 'guest'],   // persist auth + guest trial count; game state is session-only
};

const persistedReducer = persistReducer(persistConfig, rootReducer);

export const store = configureStore({
  reducer: persistedReducer,
  middleware: getDefault =>
    getDefault({
      serializableCheck: {
        ignoredActions: [FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER],
      },
    }),
});

export const persistor = persistStore(store);

export type RootState   = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
