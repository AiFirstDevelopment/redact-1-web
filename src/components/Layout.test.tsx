import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { Layout } from './Layout';
import { useAuthStore } from '../stores/authStore';
import { mockUser, mockAgency } from '../test/handlers';

// Wrapper component
const renderLayout = (props = {}) => {
  const defaultProps = {
    children: <div>Main Content</div>,
    activeTab: 'requests' as const,
    onTabChange: vi.fn(),
    ...props,
  };

  return render(
    <BrowserRouter>
      <Layout {...defaultProps} />
    </BrowserRouter>
  );
};

describe('Layout', () => {
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

  describe('Header', () => {
    it('renders app name', () => {
      renderLayout();
      expect(screen.getByText('R-1')).toBeInTheDocument();
    });

    it('renders agency name when available', () => {
      renderLayout();
      expect(screen.getByText('Springfield Police Department')).toBeInTheDocument();
    });

    it('renders user name when available', () => {
      renderLayout();
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('renders sign out button', () => {
      renderLayout();
      expect(screen.getByText('Sign Out')).toBeInTheDocument();
    });
  });

  describe('Tabs', () => {
    it('renders Requests tab', () => {
      renderLayout();
      expect(screen.getByRole('button', { name: /requests/i })).toBeInTheDocument();
    });

    it('renders Archived tab', () => {
      renderLayout();
      expect(screen.getByRole('button', { name: /archived/i })).toBeInTheDocument();
    });

    it('renders Settings tab', () => {
      renderLayout();
      expect(screen.getByRole('button', { name: /settings/i })).toBeInTheDocument();
    });

    it('renders Users tab for supervisors', () => {
      renderLayout();
      expect(screen.getByRole('button', { name: /users/i })).toBeInTheDocument();
    });

    it('hides Users tab for non-supervisors', () => {
      useAuthStore.setState({
        user: { ...mockUser, role: 'clerk' },
        agency: mockAgency,
        isAuthenticated: true,
        isEnrolled: true,
        isLoading: false,
      }, true);

      renderLayout();
      expect(screen.queryByRole('button', { name: /^users$/i })).not.toBeInTheDocument();
    });

    it('calls onTabChange when tab clicked', async () => {
      const user = userEvent.setup();
      const onTabChange = vi.fn();
      renderLayout({ onTabChange });

      const archivedTab = screen.getByRole('button', { name: /archived/i });
      await user.click(archivedTab);

      expect(onTabChange).toHaveBeenCalledWith('archived');
    });
  });

  describe('Content', () => {
    it('renders children', () => {
      renderLayout();
      expect(screen.getByText('Main Content')).toBeInTheDocument();
    });

    it('renders right panel when provided', () => {
      renderLayout({ rightPanel: <div>Right Panel Content</div> });
      expect(screen.getByText('Right Panel Content')).toBeInTheDocument();
    });
  });
});
