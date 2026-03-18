import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { UsersPanel } from './UsersPanel';
import { useAuthStore } from '../stores/authStore';
import { mockUser, mockAgency } from '../test/handlers';

const renderUsersPanel = () => {
  return render(
    <BrowserRouter>
      <UsersPanel />
    </BrowserRouter>
  );
};

describe('UsersPanel', () => {
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem('agency', JSON.stringify(mockAgency));
    useAuthStore.setState({
      user: mockUser,
      agency: mockAgency,
      isAuthenticated: true,
      isEnrolled: true,
      isLoading: false,
      error: null,
    }, true);
  });

  it('renders header with title', async () => {
    renderUsersPanel();

    await waitFor(() => {
      expect(screen.getByText('Users')).toBeInTheDocument();
    });
  });

  it('renders Add User button', async () => {
    renderUsersPanel();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
    });
  });

  it('shows loading state initially', () => {
    renderUsersPanel();
    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('displays users from API', async () => {
    renderUsersPanel();

    await waitFor(() => {
      expect(screen.getByText('Test User')).toBeInTheDocument();
      expect(screen.getByText('test@test.com')).toBeInTheDocument();
    });
  });

  it('displays user role badge', async () => {
    renderUsersPanel();

    await waitFor(() => {
      expect(screen.getByText('supervisor')).toBeInTheDocument();
    });
  });

  it('displays table headers', async () => {
    renderUsersPanel();

    await waitFor(() => {
      expect(screen.getByText('Name')).toBeInTheDocument();
      expect(screen.getByText('Email')).toBeInTheDocument();
      expect(screen.getByText('Role')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();
    });
  });

  describe('Add User Form', () => {
    it('shows add form when Add User clicked', async () => {
      const user = userEvent.setup();
      renderUsersPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /add user/i })).toBeInTheDocument();
      });

      const addButton = screen.getByRole('button', { name: /add user/i });
      await user.click(addButton);

      await waitFor(() => {
        expect(screen.getByText('Add New User')).toBeInTheDocument();
      });
    });
  });

  describe('Edit/Delete', () => {
    it('shows Edit button for each user', async () => {
      renderUsersPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /edit/i })).toBeInTheDocument();
      });
    });

    it('shows Delete button for each user', async () => {
      renderUsersPanel();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /delete/i })).toBeInTheDocument();
      });
    });
  });
});
