/**
 * Redux Store Configuration
 * Centralized state management for Digital Wall mobile app
 */
import { configureStore } from '@reduxjs/toolkit';
import { TypedUseSelectorHook, useDispatch, useSelector } from 'react-redux';
import shareReducer from './slices/shareSlice';
import wallsReducer from './slices/wallsSlice';
import authReducer from './slices/authSlice';
import syncReducer from './slices/syncSlice';

export const store = configureStore({
  reducer: {
    share: shareReducer,
    walls: wallsReducer,
    auth: authReducer,
    sync: syncReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['persist/PERSIST', 'persist/REHYDRATE'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Typed hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;