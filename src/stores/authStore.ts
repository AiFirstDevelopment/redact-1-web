import { create } from 'zustand';
import { api } from '../services/api';
import type { User, Agency } from '../types';

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
      const response = await api.login(email, password);
      let agency = response.agency as Agency | undefined;

      // If user has no agency in DB but has one in localStorage, sync it
      if (!agency) {
        const storedAgency = localStorage.getItem('agency');
        if (storedAgency) {
          try {
            const parsed = JSON.parse(storedAgency);
            // Call enroll API to sync localStorage agency to DB
            const enrollResponse = await api.enroll(parsed.code);
            agency = enrollResponse.agency;
          } catch {
            // If enroll fails, clear localStorage agency
            localStorage.removeItem('agency');
          }
        }
      }

      set({
        user: response.user,
        agency: agency || null,
        isAuthenticated: true,
        isEnrolled: !!agency,
        isLoading: false
      });
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
    const storedAgency = localStorage.getItem('agency');

    if (!token) {
      // Not logged in, but may have enrolled (agency in localStorage)
      if (storedAgency) {
        try {
          const agency = JSON.parse(storedAgency) as Agency;
          set({ agency, isEnrolled: true, isLoading: false, isAuthenticated: false });
        } catch {
          set({ isLoading: false, isAuthenticated: false, isEnrolled: false });
        }
      } else {
        set({ isLoading: false, isAuthenticated: false, isEnrolled: false });
      }
      return;
    }

    try {
      const { user, agency } = await api.me();
      set({
        user,
        agency: agency || null,
        isAuthenticated: true,
        isEnrolled: !!agency,
        isLoading: false
      });
    } catch {
      api.setToken(null);
      set({ user: null, agency: null, isAuthenticated: false, isEnrolled: false, isLoading: false });
    }
  },

  // Pre-login enrollment: verify department code and store in localStorage
  enroll: async (departmentCode: string) => {
    set({ isLoading: true, error: null });
    try {
      const agency = await api.getAgencyByCode(departmentCode);
      // Store in localStorage for syncing after login
      localStorage.setItem('agency', JSON.stringify(agency));
      set({ agency: agency as Agency, isEnrolled: true, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Invalid department code', isLoading: false });
      throw e;
    }
  },

  clearError: () => set({ error: null }),
}));
