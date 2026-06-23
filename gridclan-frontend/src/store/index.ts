import { combineReducers, configureStore } from '@reduxjs/toolkit';
import { persistStore, persistReducer, FLUSH, REHYDRATE, PAUSE, PERSIST, PURGE, REGISTER } from 'redux-persist';
import AsyncStorage from '@react-native-async-storage/async-storage';
import authReducer  from './slices/authSlice';
import gameReducer  from './slices/gameSlice';
import pointsReducer from './slices/pointsSlice';
import gemsReducer   from './slices/gemsSlice';

const rootReducer = combineReducers({
  auth:   authReducer,
  game:   gameReducer,
  points: pointsReducer,
  gems:   gemsReducer,
});

const persistConfig = {
  key:       'gridclan-root',
  storage:   AsyncStorage,
  whitelist: ['auth'],   // Only persist auth — game state is session-only
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
