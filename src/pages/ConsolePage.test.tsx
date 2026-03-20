import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { ConsolePage } from './ConsolePage';

// Mock the API
vi.mock('../services/api', () => ({
  api: {
    consoleGetSystemStatus: vi.fn(),
    consoleGetUsageSummary: vi.fn(),
    consoleGetAWSMetrics: vi.fn(),
    consoleGetDailyUsage: vi.fn(),
    consoleGetSystemPause: vi.fn(),
    consoleSetSystemPause: vi.fn(),
    consoleGetRecentAgencies: vi.fn(),
    consoleGetRecentUsers: vi.fn(),
    adminListAgencies: vi.fn(),
    adminCreateAgency: vi.fn(),
    adminCreateSupervisor: vi.fn(),
  },
}));

import { api } from '../services/api';

const mockSystemStatus = {
  timestamp: Date.now(),
  cloudflare: {
    worker: { status: 'running' },
    d1: { status: 'connected', counts: { agencies: 2, users: 5, requests: 10, files: 20, video_jobs: 1, detections: 0, video_detections: 0 } },
    r2: { status: 'connected', bucket: 'redact-1-files' },
  },
  aws: {
    lambda: {
      detection: { running: 0, invocationsLast5Min: 5 },
      redaction: { running: 1, invocationsLast5Min: 3 },
    },
    s3: { bucket: 'redact-1-videos', status: 'configured' },
    rekognition: { status: 'active' },
  },
  jobs: {
    last24h: { pending: 2, processing: 1, completed: 10, failed: 1, cancelled: 0 },
  },
};

const mockUsage = {
  usage: {
    period: 'Last 30 days',
    rekognition_images: 100,
    rekognition_video_minutes: 50,
    lambda_detection_seconds: 300,
    lambda_redaction_seconds: 200,
    s3_upload_gb: 1.5,
    s3_download_gb: 0.5,
    r2_upload_gb: 0.1,
    r2_download_gb: 0.05,
    estimated_cost_usd: 12.50,
  },
};

const mockAWSMetrics = {
  aws: {
    period: { start: '2024-01-01', end: '2024-01-31' },
    costs: [{ service: 'Lambda', cost: 5.00, unit: 'USD' }],
    totalCost: 5.00,
    lambda: {
      detectionInvocations: 100,
      detectionDurationMs: 5000,
      redactionInvocations: 50,
      redactionDurationMs: 10000,
    },
    rekognition: { faceDetectionMinutes: 30 },
    s3: { storageSizeBytes: 1024 * 1024 * 100, getRequests: 500, putRequests: 200 },
  },
};

const mockDailyUsage = { daily: [] };

const mockPauseState = {
  system: { paused: false, terminate: false },
};

const mockAdminAgencies = {
  agencies: [
    { id: 'agency-1', code: 'DEMO', name: 'Demo PD', default_deadline_days: 10, deadline_type: 'business_days', created_at: 1234567890, user_count: 5 },
    { id: 'agency-2', code: 'TEST', name: 'Test PD', default_deadline_days: 14, deadline_type: 'calendar_days', created_at: 1234567900, user_count: 3 },
  ],
};

describe('ConsolePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.consoleGetSystemStatus as any).mockResolvedValue(mockSystemStatus);
    (api.consoleGetUsageSummary as any).mockResolvedValue(mockUsage);
    (api.consoleGetAWSMetrics as any).mockResolvedValue(mockAWSMetrics);
    (api.consoleGetDailyUsage as any).mockResolvedValue(mockDailyUsage);
    (api.consoleGetSystemPause as any).mockResolvedValue(mockPauseState);
    (api.adminListAgencies as any).mockResolvedValue(mockAdminAgencies);
  });

  describe('Monitoring Tab', () => {
    it('should render the monitoring dashboard', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('System Console')).toBeInTheDocument();
      });

      expect(screen.getByText('System Controls')).toBeInTheDocument();
      expect(screen.getByText('ACTIVE')).toBeInTheDocument();
    });

    it('should show pause state when paused', async () => {
      (api.consoleGetSystemPause as any).mockResolvedValue({
        system: { paused: true, terminate: false, reason: 'Maintenance' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('PAUSED')).toBeInTheDocument();
      });
    });

    it('should have Monitoring tab selected by default', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      const monitoringButton = screen.getByRole('button', { name: 'Monitoring' });
      expect(monitoringButton).toHaveClass('bg-teal-600');
    });
  });

  describe('Admin Tab Navigation', () => {
    it('should switch to Admin tab when clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      const adminButton = screen.getByRole('button', { name: 'Admin' });
      fireEvent.click(adminButton);

      await waitFor(() => {
        expect(adminButton).toHaveClass('bg-teal-600');
      });

      expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      expect(screen.getByText('Create First Supervisor')).toBeInTheDocument();
    });

    it('should fetch agencies when Admin tab is opened', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      const adminButton = screen.getByRole('button', { name: 'Admin' });
      fireEvent.click(adminButton);

      await waitFor(() => {
        expect(api.adminListAgencies).toHaveBeenCalled();
      });
    });
  });

  describe('Admin Tab - Create Agency', () => {
    it('should render the create agency form', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Demo Police Department')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Agency' })).toBeInTheDocument();
    });

    it('should create agency when form is submitted', async () => {
      (api.adminCreateAgency as any).mockResolvedValue({
        agency: { id: 'new-agency', code: 'NEWPD', name: 'New Police Department', default_deadline_days: 10, deadline_type: 'business_days' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD');
      const nameInput = screen.getByPlaceholderText('e.g., Demo Police Department');
      const submitButton = screen.getByRole('button', { name: 'Create Agency' });

      fireEvent.change(codeInput, { target: { value: 'NEWPD' } });
      fireEvent.change(nameInput, { target: { value: 'New Police Department' } });
      fireEvent.click(submitButton);

      await waitFor(() => {
        expect(api.adminCreateAgency).toHaveBeenCalledWith({
          code: 'NEWPD',
          name: 'New Police Department',
          default_deadline_days: 10,
          deadline_type: 'business_days',
        });
      });
    });

    it('should show success message after creating agency', async () => {
      (api.adminCreateAgency as any).mockResolvedValue({
        agency: { id: 'new-agency', code: 'NEWPD', name: 'New Police Department' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD'), { target: { value: 'NEWPD' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., Demo Police Department'), { target: { value: 'New Police Department' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Agency' }));

      await waitFor(() => {
        expect(screen.getByText(/NEWPD.*created successfully/)).toBeInTheDocument();
      });
    });

    it('should show error message on agency creation failure', async () => {
      (api.adminCreateAgency as any).mockRejectedValue(new Error('Agency with this code already exists'));

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD'), { target: { value: 'DEMO' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., Demo Police Department'), { target: { value: 'Demo PD' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Agency' }));

      await waitFor(() => {
        expect(screen.getByText(/already exists/)).toBeInTheDocument();
      });
    });

    it('should convert agency code to uppercase', async () => {
      (api.adminCreateAgency as any).mockResolvedValue({
        agency: { id: 'new-agency', code: 'TESTPD', name: 'Test PD' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD') as HTMLInputElement;
      fireEvent.change(codeInput, { target: { value: 'testpd' } });

      // Input should display uppercase
      expect(codeInput.value).toBe('TESTPD');
    });
  });

  describe('Admin Tab - Create Supervisor', () => {
    it('should render the create supervisor form', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create First Supervisor')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('supervisor@agency.gov')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('John Smith')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Create Supervisor' })).toBeInTheDocument();
    });

    it('should populate agency dropdown with existing agencies', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create First Supervisor')).toBeInTheDocument();
      });

      // Get the agency select (second combobox - first is deadline type)
      const comboboxes = screen.getAllByRole('combobox');
      const agencySelect = comboboxes[1]; // Agency dropdown is second
      const options = agencySelect.querySelectorAll('option');

      expect(options.length).toBe(3); // "Select an agency..." + 2 agencies
      expect(options[1].textContent).toContain('DEMO');
      expect(options[2].textContent).toContain('TEST');
    });

    it('should create supervisor when form is submitted', async () => {
      (api.adminCreateSupervisor as any).mockResolvedValue({
        user: {
          id: 'new-user',
          email: 'supervisor@agency.gov',
          name: 'John Smith',
          role: 'supervisor',
          auth_status: 'invited',
          agency: { id: 'agency-1', code: 'DEMO', name: 'Demo PD' },
        },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create First Supervisor')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('supervisor@agency.gov'), { target: { value: 'supervisor@agency.gov' } });
      fireEvent.change(screen.getByPlaceholderText('John Smith'), { target: { value: 'John Smith' } });
      // Agency dropdown is second combobox (first is deadline type)
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'DEMO' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Supervisor' }));

      await waitFor(() => {
        expect(api.adminCreateSupervisor).toHaveBeenCalledWith({
          email: 'supervisor@agency.gov',
          name: 'John Smith',
          agency_code: 'DEMO',
        });
      });
    });

    it('should show success message after creating supervisor', async () => {
      (api.adminCreateSupervisor as any).mockResolvedValue({
        user: {
          id: 'new-user',
          email: 'supervisor@agency.gov',
          name: 'John Smith',
          role: 'supervisor',
          auth_status: 'invited',
          agency: { id: 'agency-1', code: 'DEMO', name: 'Demo PD' },
        },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create First Supervisor')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('supervisor@agency.gov'), { target: { value: 'supervisor@agency.gov' } });
      fireEvent.change(screen.getByPlaceholderText('John Smith'), { target: { value: 'John Smith' } });
      // Agency dropdown is second combobox (first is deadline type)
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'DEMO' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Supervisor' }));

      await waitFor(() => {
        expect(screen.getByText(/supervisor@agency.gov.*created/)).toBeInTheDocument();
      });
    });

    it('should show error message on supervisor creation failure', async () => {
      (api.adminCreateSupervisor as any).mockRejectedValue(new Error('User with this email already exists'));

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create First Supervisor')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('supervisor@agency.gov'), { target: { value: 'existing@agency.gov' } });
      fireEvent.change(screen.getByPlaceholderText('John Smith'), { target: { value: 'John Smith' } });
      // Agency dropdown is second combobox (first is deadline type)
      fireEvent.change(screen.getAllByRole('combobox')[1], { target: { value: 'DEMO' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Supervisor' }));

      await waitFor(() => {
        expect(screen.getByText(/already exists/)).toBeInTheDocument();
      });
    });
  });

  describe('Admin Tab - Existing Agencies List', () => {
    it('should display existing agencies table', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Existing Agencies')).toBeInTheDocument();
      });

      expect(screen.getByText('DEMO')).toBeInTheDocument();
      expect(screen.getByText('Demo PD')).toBeInTheDocument();
      expect(screen.getByText('TEST')).toBeInTheDocument();
      expect(screen.getByText('Test PD')).toBeInTheDocument();
    });

    it('should show user counts for each agency', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Existing Agencies')).toBeInTheDocument();
      });

      // Find cells containing user counts
      const cells = screen.getAllByRole('cell');
      const userCountCells = cells.filter(cell => cell.textContent === '5' || cell.textContent === '3');
      expect(userCountCells.length).toBeGreaterThan(0);
    });

    it('should show empty message when no agencies exist', async () => {
      (api.adminListAgencies as any).mockResolvedValue({ agencies: [] });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('No agencies yet. Create one above.')).toBeInTheDocument();
      });
    });
  });

  describe('Form Validation', () => {
    it('should disable Create Agency button when fields are empty', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: 'Create Agency' });
      expect(createButton).toBeDisabled();
    });

    it('should disable Create Supervisor button when fields are empty', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create First Supervisor')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: 'Create Supervisor' });
      expect(createButton).toBeDisabled();
    });

    it('should enable Create Agency button when required fields are filled', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD'), { target: { value: 'TEST' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., Demo Police Department'), { target: { value: 'Test PD' } });

      const createButton = screen.getByRole('button', { name: 'Create Agency' });
      expect(createButton).not.toBeDisabled();
    });
  });

  describe('Tab Switching', () => {
    it('should hide auto-refresh controls when on Admin tab', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      // Auto-refresh should be visible on Monitoring tab
      expect(screen.getByText('Auto-refresh (10s)')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      // Auto-refresh should not be visible on Admin tab
      expect(screen.queryByText('Auto-refresh (10s)')).not.toBeInTheDocument();
    });

    it('should switch back to Monitoring tab', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Monitoring' }));

      await waitFor(() => {
        expect(screen.getByText('System Controls')).toBeInTheDocument();
      });

      expect(screen.queryByText('Create New Agency')).not.toBeInTheDocument();
    });
  });
});
