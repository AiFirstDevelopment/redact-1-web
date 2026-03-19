import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { SettingsPanel } from './SettingsPanel';
import { useAuthStore } from '../stores/authStore';
import { mockUser, mockAgency } from '../test/handlers';

const renderSettingsPanel = () => {
  return render(
    <BrowserRouter>
      <SettingsPanel />
    </BrowserRouter>
  );
};

describe('SettingsPanel', () => {
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

  it('renders Settings header', () => {
    renderSettingsPanel();
    expect(screen.getByText('Settings')).toBeInTheDocument();
  });

  describe('Profile Section', () => {
    it('renders Profile section header', () => {
      renderSettingsPanel();
      expect(screen.getByText('Profile')).toBeInTheDocument();
    });

    it('displays user name', () => {
      renderSettingsPanel();
      expect(screen.getByText('Test User')).toBeInTheDocument();
    });

    it('displays user email', () => {
      renderSettingsPanel();
      expect(screen.getByText('test@test.com')).toBeInTheDocument();
    });

    it('displays user role', () => {
      renderSettingsPanel();
      expect(screen.getByText('supervisor')).toBeInTheDocument();
    });
  });

  describe('Department Section', () => {
    it('renders Department section header', () => {
      renderSettingsPanel();
      expect(screen.getByText('Department')).toBeInTheDocument();
    });

    it('displays department name', () => {
      renderSettingsPanel();
      expect(screen.getByText('Springfield Police Department')).toBeInTheDocument();
    });

    it('displays department code', () => {
      renderSettingsPanel();
      expect(screen.getByText('SPRINGFIELD-PD')).toBeInTheDocument();
    });

    it('shows Change Department button', () => {
      renderSettingsPanel();
      expect(screen.getByRole('button', { name: /change department/i })).toBeInTheDocument();
    });
  });

  describe('Account Section', () => {
    it('renders Account section header', () => {
      renderSettingsPanel();
      expect(screen.getByText('Account')).toBeInTheDocument();
    });

    it('shows Sign Out button', () => {
      renderSettingsPanel();
      expect(screen.getByRole('button', { name: /sign out/i })).toBeInTheDocument();
    });
  });
});
