import { describe, it, expect, beforeEach } from 'vitest';
import { useAuthStore } from './authStore';
import { api } from '../services/api';
import { mockUser, mockAgency } from '../test/handlers';

describe('authStore', () => {
  beforeEach(() => {
    // Reset store state
    useAuthStore.setState({
      user: null,
      agency: null,
      isAuthenticated: false,
      isEnrolled: false,
      isLoading: false,
      error: null,
    });
    localStorage.clear();
    // Clear the API service token cache
    api.setToken(null);
  });

  describe('initial state', () => {
    it('starts with null user', () => {
      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
    });

    it('starts not authenticated', () => {
      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
    });

    it('starts not enrolled when no agency in localStorage', () => {
      const state = useAuthStore.getState();
      expect(state.isEnrolled).toBe(false);
    });

    it('starts not loading', () => {
      const state = useAuthStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('starts with no error', () => {
      const state = useAuthStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('login', () => {
    it('sets loading state during login', async () => {
      const { login } = useAuthStore.getState();

      const loginPromise = login('test@test.com', 'password');

      // Check loading state
      expect(useAuthStore.getState().isLoading).toBe(true);

      await loginPromise;
    });

    it('sets user and authenticated on successful login', async () => {
      const { login } = useAuthStore.getState();

      await login('test@test.com', 'password');

      const state = useAuthStore.getState();
      expect(state.user).toEqual(mockUser);
      expect(state.isAuthenticated).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('sets agency and enrolled when login returns agency', async () => {
      const { login } = useAuthStore.getState();

      await login('test@test.com', 'password');

      const state = useAuthStore.getState();
      expect(state.agency).toEqual(mockAgency);
      expect(state.isEnrolled).toBe(true);
    });

    it('syncs localStorage agency to DB when login returns no agency', async () => {
      // Pre-enroll via localStorage
      localStorage.setItem('agency', JSON.stringify(mockAgency));

      const { login } = useAuthStore.getState();

      // Login with user that has no agency
      await login('noenroll@test.com', 'password');

      const state = useAuthStore.getState();
      // Should have synced the agency
      expect(state.agency).toEqual(mockAgency);
      expect(state.isEnrolled).toBe(true);
    });

    it('stores token in localStorage on successful login', async () => {
      const { login } = useAuthStore.getState();

      await login('test@test.com', 'password');

      expect(localStorage.getItem('token')).toBe('mock-token');
    });

    it('sets error on failed login', async () => {
      const { login } = useAuthStore.getState();

      await expect(login('wrong@test.com', 'wrong')).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.error).toBe('Invalid credentials');
      expect(state.isAuthenticated).toBe(false);
      expect(state.isLoading).toBe(false);
    });
  });

  describe('logout', () => {
    it('clears user and authentication state', async () => {
      // First login
      const { login, logout } = useAuthStore.getState();
      await login('test@test.com', 'password');

      // Then logout
      await logout();

      const state = useAuthStore.getState();
      expect(state.user).toBeNull();
      expect(state.isAuthenticated).toBe(false);
    });

    it('clears token from localStorage', async () => {
      const { login, logout } = useAuthStore.getState();
      await login('test@test.com', 'password');

      await logout();

      expect(localStorage.getItem('token')).toBeNull();
    });
  });

  describe('enroll (pre-login)', () => {
    it('sets loading state during enrollment', async () => {
      const { enroll } = useAuthStore.getState();

      const enrollPromise = enroll('SPRINGFIELD-PD');

      expect(useAuthStore.getState().isLoading).toBe(true);

      await enrollPromise;
    });

    it('sets agency and enrolled on successful enrollment', async () => {
      const { enroll } = useAuthStore.getState();

      await enroll('SPRINGFIELD-PD');

      const state = useAuthStore.getState();
      expect(state.agency).toEqual(mockAgency);
      expect(state.isEnrolled).toBe(true);
      expect(state.isLoading).toBe(false);
    });

    it('stores agency in localStorage for syncing after login', async () => {
      const { enroll } = useAuthStore.getState();

      await enroll('SPRINGFIELD-PD');

      const stored = localStorage.getItem('agency');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!)).toEqual(mockAgency);
    });

    it('sets error on invalid department code', async () => {
      const { enroll } = useAuthStore.getState();

      await expect(enroll('INVALID-CODE')).rejects.toThrow();

      const state = useAuthStore.getState();
      expect(state.error).toBeTruthy();
      expect(state.isEnrolled).toBe(false);
    });
  });

  describe('checkAuth', () => {
    it('sets not authenticated and not enrolled if no token and no agency', async () => {
      const { checkAuth } = useAuthStore.getState();

      await checkAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isEnrolled).toBe(false);
      expect(state.isLoading).toBe(false);
    });

    it('sets enrolled from localStorage if no token but agency exists', async () => {
      localStorage.setItem('agency', JSON.stringify(mockAgency));

      const { checkAuth } = useAuthStore.getState();

      await checkAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isEnrolled).toBe(true);
      expect(state.agency).toEqual(mockAgency);
    });

    it('sets authenticated and enrolled from API if valid token', async () => {
      localStorage.setItem('token', 'mock-token');
      api.setToken('mock-token');

      const { checkAuth } = useAuthStore.getState();

      await checkAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.agency).toEqual(mockAgency);
      expect(state.isEnrolled).toBe(true);
    });

    it('sets authenticated but not enrolled if valid token without agency', async () => {
      localStorage.setItem('token', 'no-agency-token');
      api.setToken('no-agency-token');

      const { checkAuth } = useAuthStore.getState();

      await checkAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(true);
      expect(state.user).toEqual(mockUser);
      expect(state.agency).toBeNull();
      expect(state.isEnrolled).toBe(false);
    });

    it('clears token and sets not authenticated if API returns unauthorized', async () => {
      localStorage.setItem('token', 'invalid-token');
      api.setToken('invalid-token');

      const { checkAuth } = useAuthStore.getState();

      await checkAuth();

      const state = useAuthStore.getState();
      expect(state.isAuthenticated).toBe(false);
      expect(state.isEnrolled).toBe(false);
    });
  });

  describe('clearError', () => {
    it('clears error state', async () => {
      // Set an error
      useAuthStore.setState({ error: 'Some error' });

      const { clearError } = useAuthStore.getState();
      clearError();

      expect(useAuthStore.getState().error).toBeNull();
    });
  });
});
