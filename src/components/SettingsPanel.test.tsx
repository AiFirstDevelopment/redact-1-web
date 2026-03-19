import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { SettingsPanel } from './SettingsPanel';
import { useAuthStore } from '../stores/authStore';
import { mockUser, mockAgency } from '../test/handlers';

const mockClerk = {
  ...mockUser,
  role: 'clerk' as const,
};

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

  describe('Due Date Settings Section', () => {
    describe('for supervisors', () => {
      it('renders Due Date Settings section', () => {
        renderSettingsPanel();
        expect(screen.getByText('Due Date Settings')).toBeInTheDocument();
      });

      it('displays description text', () => {
        renderSettingsPanel();
        expect(screen.getByText(/configure the default response deadline/i)).toBeInTheDocument();
      });

      it('shows deadline days input with agency default value', () => {
        renderSettingsPanel();
        const input = screen.getByRole('spinbutton');
        expect(input).toHaveValue(10);
      });

      it('shows deadline type dropdown', () => {
        renderSettingsPanel();
        const select = screen.getByRole('combobox');
        expect(select).toHaveValue('business_days');
      });

      it('has Save Settings button', () => {
        renderSettingsPanel();
        expect(screen.getByRole('button', { name: /save settings/i })).toBeInTheDocument();
      });

      it('disables Save Settings button when no changes made', () => {
        renderSettingsPanel();
        const saveButton = screen.getByRole('button', { name: /save settings/i });
        expect(saveButton).toBeDisabled();
      });

      it('enables Save Settings button when deadline days changed', async () => {
        const user = userEvent.setup();
        renderSettingsPanel();

        const input = screen.getByRole('spinbutton');
        await user.clear(input);
        await user.type(input, '15');

        const saveButton = screen.getByRole('button', { name: /save settings/i });
        expect(saveButton).toBeEnabled();
      });

      it('enables Save Settings button when deadline type changed', async () => {
        const user = userEvent.setup();
        renderSettingsPanel();

        const select = screen.getByRole('combobox');
        await user.selectOptions(select, 'calendar_days');

        const saveButton = screen.getByRole('button', { name: /save settings/i });
        expect(saveButton).toBeEnabled();
      });

      it('disables Save Settings button when values returned to original', async () => {
        const user = userEvent.setup();
        renderSettingsPanel();

        const input = screen.getByRole('spinbutton') as HTMLInputElement;

        // Change value using tripleClick to select all, then type
        await user.tripleClick(input);
        await user.keyboard('15');

        // Button should be enabled
        let saveButton = screen.getByRole('button', { name: /save settings/i });
        expect(saveButton).toBeEnabled();

        // Return to original value
        await user.tripleClick(input);
        await user.keyboard('10');

        saveButton = screen.getByRole('button', { name: /save settings/i });
        expect(saveButton).toBeDisabled();
      });

      it('button is disabled during save operation', async () => {
        const user = userEvent.setup();
        renderSettingsPanel();

        // Change a value
        const input = screen.getByRole('spinbutton');
        await user.tripleClick(input);
        await user.keyboard('15');

        // Click save - button should be enabled before click
        const saveButton = screen.getByRole('button', { name: /save settings/i });
        expect(saveButton).toBeEnabled();

        await user.click(saveButton);

        // After save completes, button should be disabled (no changes)
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
        });
      });

      it('shows success message after saving', async () => {
        const user = userEvent.setup();
        renderSettingsPanel();

        // Change a value
        const input = screen.getByRole('spinbutton');
        await user.clear(input);
        await user.type(input, '15');

        // Click save
        const saveButton = screen.getByRole('button', { name: /save settings/i });
        await user.click(saveButton);

        // Wait for success message
        await waitFor(() => {
          expect(screen.getByText('Settings saved successfully')).toBeInTheDocument();
        });
      });

      it('disables button again after successful save', async () => {
        const user = userEvent.setup();
        renderSettingsPanel();

        // Change a value
        const input = screen.getByRole('spinbutton');
        await user.clear(input);
        await user.type(input, '15');

        // Click save
        const saveButton = screen.getByRole('button', { name: /save settings/i });
        await user.click(saveButton);

        // Wait for save to complete and button to be disabled
        await waitFor(() => {
          expect(screen.getByRole('button', { name: /save settings/i })).toBeDisabled();
        });
      });
    });

    describe('for clerks', () => {
      beforeEach(() => {
        useAuthStore.setState({
          user: mockClerk,
          agency: mockAgency,
          isAuthenticated: true,
          isEnrolled: true,
          isLoading: false,
          error: null,
        }, true);
      });

      it('does not render Due Date Settings section', () => {
        renderSettingsPanel();
        expect(screen.queryByText('Due Date Settings')).not.toBeInTheDocument();
      });

      it('does not show deadline days input', () => {
        renderSettingsPanel();
        expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
      });

      it('does not show Save Settings button', () => {
        renderSettingsPanel();
        expect(screen.queryByRole('button', { name: /save settings/i })).not.toBeInTheDocument();
      });
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
