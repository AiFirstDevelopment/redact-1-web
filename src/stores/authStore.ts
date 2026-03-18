import { create } from 'zustand';
import { api } from '../services/api';
import type { User } from '../types';

interface Agency {
  id?: string;
  name: string;
  code: string;
}

interface AuthState {
  user: User | null;
  agency: Agency | null;
  isAuthenticated: boolean;
  isEnrolled: boolean;
  isLoading: boolean;
  error: string | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  checkAuth: () => Promise<void>;
  enroll: (departmentCode: string) => Promise<void>;
  clearError: () => void;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  agency: null,
  isAuthenticated: false,
  isEnrolled: !!localStorage.getItem('agency'),
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
    const agencyStr = localStorage.getItem('agency');
    const agency = agencyStr ? JSON.parse(agencyStr) : null;

    if (!agencyStr) {
      set({ isLoading: false, isAuthenticated: false, isEnrolled: false });
      return;
    }

    set({ agency, isEnrolled: true });

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

  enroll: async (departmentCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const agency = await api.getAgencyByCode(departmentCode);
      localStorage.setItem('agency', JSON.stringify(agency));
      set({ agency, isEnrolled: true, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Invalid department code', isLoading: false });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
