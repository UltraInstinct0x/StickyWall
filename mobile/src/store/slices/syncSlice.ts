/**
 * Sync Slice - Redux state management for synchronization status
 */
import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SyncState {
  isOnline: boolean;
  syncing: boolean;
  queueLength: number;
  lastSyncTime: number | null;
  syncStats: {
    total: number;
    pending: number;
    completed: number;
    failed: number;
    syncing: number;
  };
  error: string | null;
}

const initialState: SyncState = {
  isOnline: true,
  syncing: false,
  queueLength: 0,
  lastSyncTime: null,
  syncStats: {
    total: 0,
    pending: 0,
    completed: 0,
    failed: 0,
    syncing: 0,
  },
  error: null,
};

const syncSlice = createSlice({
  name: 'sync',
  initialState,
  reducers: {
    updateNetworkStatus: (state, action: PayloadAction<boolean>) => {
      state.isOnline = action.payload;
    },
    updateSyncStatus: (state, action: PayloadAction<{ syncing: boolean; queueLength: number }>) => {
      state.syncing = action.payload.syncing;
      state.queueLength = action.payload.queueLength;
      if (!action.payload.syncing) {
        state.lastSyncTime = Date.now();
      }
    },
    updateSyncStats: (state, action: PayloadAction<SyncState['syncStats']>) => {
      state.syncStats = action.payload;
    },
    setSyncError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearSyncError: (state) => {
      state.error = null;
    },
  },
});

export const {
  updateNetworkStatus,
  updateSyncStatus,
  updateSyncStats,
  setSyncError,
  clearSyncError,
} = syncSlice.actions;

export default syncSlice.reducer;