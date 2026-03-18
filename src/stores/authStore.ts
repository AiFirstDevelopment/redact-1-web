import { create } from 'zustand';
import { api } from '../services/api';
import type { User } from '../types';

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,
  error: null,

  login: async (email: string, password: string) => {
    set({ isLoading: true, error: null });
    try {
      const { user } = await api.login(email, password);
      set({ user, isAuthenticated: true, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Login failed', isLoading: false });
      throw e;
    }
  },

  logout: async () => {
    try {
      await api.logout();
    } finally {
      set({ user: null, isAuthenticated: false });
    }
  },

  checkAuth: async () => {
    const token = api.getToken();
    if (!token) {
      set({ isLoading: false, isAuthenticated: false });
      return;
    }

    try {
      const { user } = await api.me();
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      api.setToken(null);
      set({ user: null, isAuthenticated: false, isLoading: false });
    }
  },
}));
