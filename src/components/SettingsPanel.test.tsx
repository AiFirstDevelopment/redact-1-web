import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SettingsPanel } from './SettingsPanel';

// Mock the API
vi.mock('../services/api', () => ({
  api: {
    updateAgency: vi.fn(),
  },
}));

import { api } from '../services/api';

// Mock the auth store
vi.mock('../stores/authStore', () => ({
  useAuthStore: vi.fn(),
}));

import { useAuthStore } from '../stores/authStore';

const mockAgency = {
  id: 'agency-1',
  name: 'Test Agency',
  code: 'TEST-AGENCY',
  default_deadline_days: 14,
  deadline_type: 'business_days' as const,
};

describe('SettingsPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (useAuthStore as any).mockReturnValue({ agency: mockAgency });
  });

  describe('Rendering', () => {
    it('should display Settings header', () => {
      render(<SettingsPanel />);
      expect(screen.getByText('Settings')).toBeInTheDocument();
    });

    it('should display Due Date Settings section', () => {
      render(<SettingsPanel />);
      expect(screen.getByText('Due Date Settings')).toBeInTheDocument();
      expect(screen.getByText('Configure the default response deadline for new records requests.')).toBeInTheDocument();
    });

    it('should display deadline days input with agency value', () => {
      render(<SettingsPanel />);
      const input = screen.getByDisplayValue('14');
      expect(input).toBeInTheDocument();
      expect(input).toHaveAttribute('type', 'number');
    });

    it('should display deadline type select with agency value', () => {
      render(<SettingsPanel />);
      const select = screen.getByDisplayValue('Business Days (excludes weekends)');
      expect(select).toBeInTheDocument();
    });

    it('should display Save Settings button', () => {
      render(<SettingsPanel />);
      expect(screen.getByText('Save Settings')).toBeInTheDocument();
    });
  });

  describe('Default Values', () => {
    it('should use default values when agency has no settings', () => {
      (useAuthStore as any).mockReturnValue({
        agency: { id: 'agency-1', name: 'Test', code: 'TEST' },
      });
      render(<SettingsPanel />);
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });

    it('should load calendar_days type correctly', () => {
      (useAuthStore as any).mockReturnValue({
        agency: { ...mockAgency, deadline_type: 'calendar_days' },
      });
      render(<SettingsPanel />);
      expect(screen.getByDisplayValue('Calendar Days')).toBeInTheDocument();
    });
  });

  describe('Save Button State', () => {
    it('should disable save button when no changes', () => {
      render(<SettingsPanel />);
      const button = screen.getByText('Save Settings');
      expect(button).toBeDisabled();
    });

    it('should enable save button when deadline days changes', () => {
      render(<SettingsPanel />);
      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: '20' } });
      const button = screen.getByText('Save Settings');
      expect(button).not.toBeDisabled();
    });

    it('should enable save button when deadline type changes', () => {
      render(<SettingsPanel />);
      const select = screen.getByDisplayValue('Business Days (excludes weekends)');
      fireEvent.change(select, { target: { value: 'calendar_days' } });
      const button = screen.getByText('Save Settings');
      expect(button).not.toBeDisabled();
    });
  });

  describe('Saving Settings', () => {
    it('should call updateAgency API when save is clicked', async () => {
      (api.updateAgency as any).mockResolvedValue({});
      render(<SettingsPanel />);

      // Make a change
      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: '21' } });

      // Click save
      const button = screen.getByText('Save Settings');
      fireEvent.click(button);

      await waitFor(() => {
        expect(api.updateAgency).toHaveBeenCalledWith('agency-1', {
          default_deadline_days: 21,
          deadline_type: 'business_days',
        });
      });
    });

    it('should show success message after save', async () => {
      (api.updateAgency as any).mockResolvedValue({});
      render(<SettingsPanel />);

      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: '21' } });

      const button = screen.getByText('Save Settings');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully')).toBeInTheDocument();
      });
    });

    it('should show error message when save fails', async () => {
      (api.updateAgency as any).mockRejectedValue(new Error('API error'));
      render(<SettingsPanel />);

      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: '21' } });

      const button = screen.getByText('Save Settings');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Failed to save settings')).toBeInTheDocument();
      });
    });

    it('should show Saving... text while saving', async () => {
      let resolvePromise: (value?: unknown) => void;
      (api.updateAgency as any).mockImplementation(
        () => new Promise((resolve) => { resolvePromise = resolve; })
      );
      render(<SettingsPanel />);

      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: '21' } });

      const button = screen.getByText('Save Settings');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Saving...')).toBeInTheDocument();
      });

      // Resolve the promise
      resolvePromise!();

      await waitFor(() => {
        expect(screen.getByText('Save Settings')).toBeInTheDocument();
      });
    });

    it('should disable save button after successful save', async () => {
      (api.updateAgency as any).mockResolvedValue({});
      render(<SettingsPanel />);

      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: '21' } });

      const button = screen.getByText('Save Settings');
      fireEvent.click(button);

      await waitFor(() => {
        expect(screen.getByText('Settings saved successfully')).toBeInTheDocument();
      });

      // Button should be disabled again since initialDays is updated
      expect(screen.getByText('Save Settings')).toBeDisabled();
    });

    it('should not call API when agency id is missing', async () => {
      (useAuthStore as any).mockReturnValue({
        agency: { name: 'Test', code: 'TEST', default_deadline_days: 14, deadline_type: 'business_days' },
      });
      render(<SettingsPanel />);

      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: '21' } });

      const button = screen.getByText('Save Settings');
      fireEvent.click(button);

      await waitFor(() => {
        expect(api.updateAgency).not.toHaveBeenCalled();
      });
    });
  });

  describe('Input Validation', () => {
    it('should handle invalid number input gracefully', () => {
      render(<SettingsPanel />);
      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: 'abc' } });
      // Should default to 10 when parseInt fails
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });

    it('should handle empty input gracefully', () => {
      render(<SettingsPanel />);
      const input = screen.getByDisplayValue('14');
      fireEvent.change(input, { target: { value: '' } });
      expect(screen.getByDisplayValue('10')).toBeInTheDocument();
    });
  });
});
