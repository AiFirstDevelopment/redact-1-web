import { ReactElement } from 'react';
import { render, RenderOptions } from '@testing-library/react';
import { BrowserRouter, MemoryRouter } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { useRequestStore } from '../stores/requestStore';
import { useDetectionStore } from '../stores/detectionStore';
import { mockUser, mockAgency } from './handlers';

interface CustomRenderOptions extends Omit<RenderOptions, 'wrapper'> {
  route?: string;
  initialEntries?: string[];
  authenticated?: boolean;
  enrolled?: boolean;
}

// Reset all Zustand stores
export function resetStores() {
  useAuthStore.setState({
    user: null,
    agency: null,
    isLoading: false,
    error: null,
    getToken: null,
  }, true); // Replace state entirely

  useRequestStore.setState({
    requests: [],
    currentRequest: null,
    files: [],
    isLoading: false,
    error: null,
  }, true);

  useDetectionStore.setState({
    detections: [],
    manualRedactions: [],
    selectedDetectionId: null,
    isLoading: false,
    error: null,
  }, true);
}

// Setup authenticated state
export function setupAuthenticatedState() {
  useAuthStore.setState({
    user: mockUser,
    agency: mockAgency,
    isLoading: false,
    error: null,
    getToken: async () => 'mock-token',
  }, true);
}

// Setup enrolled but not authenticated state
export function setupEnrolledState() {
  useAuthStore.setState({
    user: null,
    agency: mockAgency,
    isLoading: false,
    error: null,
    getToken: null,
  }, true);
}

// Custom render with router
export function renderWithRouter(
  ui: ReactElement,
  {
    route = '/',
    initialEntries = [route],
    authenticated = false,
    enrolled = false,
    ...renderOptions
  }: CustomRenderOptions = {}
) {
  resetStores();

  if (authenticated) {
    setupAuthenticatedState();
  } else if (enrolled) {
    setupEnrolledState();
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <MemoryRouter initialEntries={initialEntries}>{children}</MemoryRouter>;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}

// Render with BrowserRouter for full app testing
export function renderApp(
  ui: ReactElement,
  { authenticated = false, enrolled = false, ...renderOptions }: CustomRenderOptions = {}
) {
  resetStores();

  if (authenticated) {
    setupAuthenticatedState();
  } else if (enrolled) {
    setupEnrolledState();
  }

  function Wrapper({ children }: { children: React.ReactNode }) {
    return <BrowserRouter>{children}</BrowserRouter>;
  }

  return {
    ...render(ui, { wrapper: Wrapper, ...renderOptions }),
  };
}
