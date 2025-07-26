/**
 * Share Slice - Redux state management for sharing functionality
 */
import { createSlice, createAsyncThunk, PayloadAction } from '@reduxjs/toolkit';
import { ShareContent } from '../../services/CrossPlatformShareService';

export interface ShareState {
  items: ShareContent[];
  isSharing: boolean;
  error: string | null;
  lastShareId: string | null;
}

const initialState: ShareState = {
  items: [],
  isSharing: false,
  error: null,
  lastShareId: null,
};

// Async thunks
export const shareContent = createAsyncThunk(
  'share/shareContent',
  async (content: Omit<ShareContent, 'id' | 'timestamp' | 'source'>) => {
    const CrossPlatformShareService = (await import('../../services/CrossPlatformShareService')).default;
    const shareService = CrossPlatformShareService.getInstance();
    return await shareService.shareContent(content);
  }
);

const shareSlice = createSlice({
  name: 'share',
  initialState,
  reducers: {
    addShareItem: (state, action: PayloadAction<ShareContent>) => {
      state.items.unshift(action.payload);
      state.lastShareId = action.payload.id;
    },
    updateShareItem: (state, action: PayloadAction<{ id: string; updates: Partial<ShareContent> }>) => {
      const index = state.items.findIndex(item => item.id === action.payload.id);
      if (index !== -1) {
        state.items[index] = { ...state.items[index], ...action.payload.updates };
      }
    },
    removeShareItem: (state, action: PayloadAction<string>) => {
      state.items = state.items.filter(item => item.id !== action.payload);
    },
    clearShareItems: (state) => {
      state.items = [];
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
  extraReducers: (builder) => {
    builder
      .addCase(shareContent.pending, (state) => {
        state.isSharing = true;
        state.error = null;
      })
      .addCase(shareContent.fulfilled, (state, action) => {
        state.isSharing = false;
        state.lastShareId = action.payload;
      })
      .addCase(shareContent.rejected, (state, action) => {
        state.isSharing = false;
        state.error = action.error.message || 'Failed to share content';
      });
  },
});

export const {
  addShareItem,
  updateShareItem,
  removeShareItem,
  clearShareItems,
  setError,
  clearError,
} = shareSlice.actions;

export default shareSlice.reducer;