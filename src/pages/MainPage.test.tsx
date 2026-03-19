import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { MainPage } from './MainPage';
import { useAuthStore } from '../stores/authStore';
import { mockUser, mockAgency } from '../test/handlers';

const renderMainPage = () => {
  return render(
    <MemoryRouter>
      <MainPage />
    </MemoryRouter>
  );
};

describe('MainPage', () => {
  beforeEach(() => {
    // Only set up auth state (user must be logged in to see MainPage)
    // Request data comes from MSW handlers
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem('agency', JSON.stringify(mockAgency));

    useAuthStore.setState({
      user: mockUser,
      agency: mockAgency,
      isAuthenticated: true,
      isEnrolled: true,
      isLoading: false,
      error: null,
    });
  });

  describe('Layout', () => {
    it('renders header with app name and agency', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByText('Redact-1')).toBeInTheDocument();
        expect(screen.getByText('Springfield Police Department')).toBeInTheDocument();
      });
    });

    it('renders navigation tabs', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /requests/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /archived/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
      });
    });

    it('renders user info and sign out button', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByText('Test User')).toBeInTheDocument();
        expect(screen.getByText('Sign Out')).toBeInTheDocument();
      });
    });
  });

  describe('Requests Tab', () => {
    it('shows requests list by default', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByText('Records Requests')).toBeInTheDocument();
      });
    });

    it('displays requests from API', async () => {
      renderMainPage();

      // Wait for data to load from MSW
      await waitFor(() => {
        expect(screen.getByText('RR-20260318-001')).toBeInTheDocument();
        expect(screen.getByText('Test Request')).toBeInTheDocument();
      });
    });

    it('shows New Request button', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new request/i })).toBeInTheDocument();
      });
    });

    it('opens new request panel when New Request clicked', async () => {
      const user = userEvent.setup();
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /new request/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /new request/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/optional/i)).toBeInTheDocument();
      });
    });

    it('opens request detail panel when request clicked', async () => {
      const user = userEvent.setup();
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByText('RR-20260318-001')).toBeInTheDocument();
      });

      // Click on the request number (not the title which triggers inline edit)
      await user.click(screen.getByText('RR-20260318-001'));

      // Panel should show the request number (Request Details subtitle was removed)
      await waitFor(() => {
        // Check for a second instance of the request number (one in list, one in panel)
        expect(screen.getAllByText('RR-20260318-001').length).toBeGreaterThan(1);
      });
    });

    it('shows search input', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByPlaceholderText(/search requests/i)).toBeInTheDocument();
      });
    });
  });

  describe('Tab Navigation', () => {
    it('switches to archived tab', async () => {
      const user = userEvent.setup();
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /archived/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /archived/i }));

      await waitFor(() => {
        expect(screen.getByText('Archived Requests')).toBeInTheDocument();
      });
    });

    it('switches to users tab', async () => {
      const user = userEvent.setup();
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /users/i }));

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
      });
    });

    it('switches to settings tab', async () => {
      const user = userEvent.setup();
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /settings/i }));

      await waitFor(() => {
        expect(screen.getByText('Profile')).toBeInTheDocument();
      });
    });
  });

  describe('Request Actions', () => {
    it('shows archive button for requests', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByText('Test Request')).toBeInTheDocument();
      });

      expect(screen.queryAllByTitle(/archive/i).length).toBeGreaterThan(0);
    });

    it('shows delete button for requests', async () => {
      renderMainPage();

      await waitFor(() => {
        expect(screen.getByText('Test Request')).toBeInTheDocument();
      });

      expect(screen.queryAllByTitle(/delete/i).length).toBeGreaterThan(0);
    });
  });
});
