import { create } from 'zustand';
import { api } from '../services/api';
import type { User, Agency } from '../types';

interface AuthState {
  user: User | null;
  agency: Agency | null;
  isLoading: boolean;
  error: string | null;
  getToken: (() => Promise<string | null>) | null;
  syncWithClerk: (getToken: () => Promise<string | null>) => Promise<void>;
  enroll: (departmentCode: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set, get) => ({
  user: null,
  agency: null,
  isLoading: true,
  error: null,
  getToken: null,

  syncWithClerk: async (getToken: () => Promise<string | null>) => {
    set({ isLoading: true, error: null, getToken });

    try {
      // Get token from Clerk
      const token = await getToken();
      if (!token) {
        set({ isLoading: false, user: null, agency: null });
        return;
      }

      // Set token for API calls
      api.setToken(token);

      // Sync user with backend
      const { user, agency } = await api.syncUser();

      set({
        user,
        agency: agency || null,
        isLoading: false,
      });
    } catch (e) {
      console.error('Sync with Clerk failed:', e);
      set({
        error: e instanceof Error ? e.message : 'Failed to sync user',
        isLoading: false,
        user: null,
        agency: null,
      });
    }
  },

  enroll: async (departmentCode: string) => {
    set({ isLoading: true, error: null });
    try {
      // Refresh token before enrolling
      const { getToken } = get();
      if (getToken) {
        const token = await getToken();
        if (token) {
          api.setToken(token);
        }
      }

      const { agency } = await api.enroll(departmentCode);
      set({ agency, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Invalid department code', isLoading: false });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
