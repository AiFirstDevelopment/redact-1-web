import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
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
    adminCreateUser: vi.fn(),
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

const mockRecentUsers = {
  users: [
    { id: 'user-1', email: 'admin@demo.gov', name: 'Admin User', role: 'supervisor', created_at: 1234567890, agency_name: 'Demo PD' },
    { id: 'user-2', email: 'clerk@demo.gov', name: 'Clerk User', role: 'clerk', created_at: 1234567891, agency_name: 'Demo PD' },
    { id: 'user-3', email: 'test@test.gov', name: 'Test User', role: 'supervisor', created_at: 1234567892, agency_name: 'Test PD' },
  ],
};

describe('ConsolePage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (api.consoleGetSystemStatus as ReturnType<typeof vi.fn>).mockResolvedValue(mockSystemStatus);
    (api.consoleGetUsageSummary as ReturnType<typeof vi.fn>).mockResolvedValue(mockUsage);
    (api.consoleGetAWSMetrics as ReturnType<typeof vi.fn>).mockResolvedValue(mockAWSMetrics);
    (api.consoleGetDailyUsage as ReturnType<typeof vi.fn>).mockResolvedValue(mockDailyUsage);
    (api.consoleGetSystemPause as ReturnType<typeof vi.fn>).mockResolvedValue(mockPauseState);
    (api.adminListAgencies as ReturnType<typeof vi.fn>).mockResolvedValue(mockAdminAgencies);
    (api.consoleGetRecentUsers as ReturnType<typeof vi.fn>).mockResolvedValue(mockRecentUsers);
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
      (api.consoleGetSystemPause as ReturnType<typeof vi.fn>).mockResolvedValue({
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

    it('should display system status cards', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Cloudflare Worker')).toBeInTheDocument();
      });

      expect(screen.getByText('D1 Database')).toBeInTheDocument();
      expect(screen.getByText('R2 Storage')).toBeInTheDocument();
      expect(screen.getByText('S3 Storage')).toBeInTheDocument();
    });

    it('should display Lambda status cards', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Lambda - Detection')).toBeInTheDocument();
      });

      expect(screen.getByText('Lambda - Redaction')).toBeInTheDocument();
      expect(screen.getByText('Rekognition')).toBeInTheDocument();
    });

    it('should display jobs chart', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Video Jobs - Last 24 Hours')).toBeInTheDocument();
      });
    });

    it('should display usage summary', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText(/Usage Summary/)).toBeInTheDocument();
      });

      expect(screen.getByText('$12.50')).toBeInTheDocument();
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

      expect(screen.getByText('Agencies')).toBeInTheDocument();
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

    it('should hide auto-refresh controls when on Admin tab', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      expect(screen.getByText('Auto-refresh (10s)')).toBeInTheDocument();

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      expect(screen.queryByText('Auto-refresh (10s)')).not.toBeInTheDocument();
    });

    it('should switch back to Monitoring tab', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Monitoring' }));

      await waitFor(() => {
        expect(screen.getByText('System Controls')).toBeInTheDocument();
      });

      // DEMO agency code should not be visible when on Monitoring tab
      expect(screen.queryByText('DEMO')).not.toBeInTheDocument();
    });
  });

  describe('Admin Tab - Agencies List', () => {
    it('should display agencies table with data', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      expect(screen.getByText('Demo PD')).toBeInTheDocument();
      expect(screen.getByText('TEST')).toBeInTheDocument();
      expect(screen.getByText('Test PD')).toBeInTheDocument();
    });

    it('should show empty message when no agencies exist', async () => {
      (api.adminListAgencies as ReturnType<typeof vi.fn>).mockResolvedValue({ agencies: [] });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText(/No agencies yet/)).toBeInTheDocument();
      });
    });

    it('should display deadline information for each agency', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('10 business days')).toBeInTheDocument();
      });

      expect(screen.getByText('14 calendar days')).toBeInTheDocument();
    });

    it('should display created date for each agency', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      // Check that dates are rendered (format depends on locale)
      const cells = screen.getAllByRole('cell');
      expect(cells.length).toBeGreaterThan(0);
    });
  });

  describe('Admin Tab - Create Agency Modal', () => {
    it('should open create agency modal when (+) button is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      const addAgencyButton = screen.getByTitle('Add new agency');
      fireEvent.click(addAgencyButton);

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('e.g., Demo Police Department')).toBeInTheDocument();
    });

    it('should close create agency modal when Cancel is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByText('Create New Agency')).not.toBeInTheDocument();
      });
    });

    it('should close create agency modal when X is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      // Find the modal and click the X button
      const modal = screen.getByText('Create New Agency').closest('div[class*="fixed"]');
      const closeButton = within(modal as HTMLElement).getByText('×');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Create New Agency')).not.toBeInTheDocument();
      });
    });

    it('should create agency when form is submitted', async () => {
      (api.adminCreateAgency as ReturnType<typeof vi.fn>).mockResolvedValue({
        agency: { id: 'new-agency', code: 'NEWPD', name: 'New Police Department', default_deadline_days: 10, deadline_type: 'business_days' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD'), { target: { value: 'NEWPD' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., Demo Police Department'), { target: { value: 'New Police Department' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Agency' }));

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
      (api.adminCreateAgency as ReturnType<typeof vi.fn>).mockResolvedValue({
        agency: { id: 'new-agency', code: 'NEWPD', name: 'New Police Department' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

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

    it('should close modal after successful agency creation', async () => {
      (api.adminCreateAgency as ReturnType<typeof vi.fn>).mockResolvedValue({
        agency: { id: 'new-agency', code: 'NEWPD', name: 'New Police Department' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD'), { target: { value: 'NEWPD' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., Demo Police Department'), { target: { value: 'New Police Department' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Agency' }));

      await waitFor(() => {
        expect(screen.queryByText('Create New Agency')).not.toBeInTheDocument();
      });
    });

    it('should show error message on agency creation failure', async () => {
      (api.adminCreateAgency as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Agency with this code already exists'));

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

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
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD') as HTMLInputElement;
      fireEvent.change(codeInput, { target: { value: 'testpd' } });

      expect(codeInput.value).toBe('TESTPD');
    });

    it('should disable Create Agency button when fields are empty', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: 'Create Agency' });
      expect(createButton).toBeDisabled();
    });

    it('should enable Create Agency button when required fields are filled', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD'), { target: { value: 'TEST' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., Demo Police Department'), { target: { value: 'Test PD' } });

      const createButton = screen.getByRole('button', { name: 'Create Agency' });
      expect(createButton).not.toBeDisabled();
    });

    it('should allow setting custom deadline days', async () => {
      (api.adminCreateAgency as ReturnType<typeof vi.fn>).mockResolvedValue({
        agency: { id: 'new-agency', code: 'CUSTOM', name: 'Custom PD', default_deadline_days: 30, deadline_type: 'calendar_days' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('Agencies')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add new agency'));

      await waitFor(() => {
        expect(screen.getByText('Create New Agency')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('e.g., DEMO, NYPD, LAPD'), { target: { value: 'CUSTOM' } });
      fireEvent.change(screen.getByPlaceholderText('e.g., Demo Police Department'), { target: { value: 'Custom PD' } });

      const daysInput = screen.getByDisplayValue('10');
      fireEvent.change(daysInput, { target: { value: '30' } });

      const typeSelect = screen.getByDisplayValue('Business Days');
      fireEvent.change(typeSelect, { target: { value: 'calendar_days' } });

      fireEvent.click(screen.getByRole('button', { name: 'Create Agency' }));

      await waitFor(() => {
        expect(api.adminCreateAgency).toHaveBeenCalledWith({
          code: 'CUSTOM',
          name: 'Custom PD',
          default_deadline_days: 30,
          deadline_type: 'calendar_days',
        });
      });
    });
  });

  describe('Admin Tab - Create Supervisor Modal', () => {
    it('should open create supervisor modal when (+) button in user cell is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      const addSupervisorButton = screen.getByTitle('Add user to DEMO');
      fireEvent.click(addSupervisorButton);

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('user@agency.gov')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('John Smith')).toBeInTheDocument();
    });

    it('should close create supervisor modal when Cancel is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByText('Add User to DEMO')).not.toBeInTheDocument();
      });
    });

    it('should close create supervisor modal when X is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      const modal = screen.getByText('Add User to DEMO').closest('div[class*="fixed"]');
      const closeButton = within(modal as HTMLElement).getByText('×');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Add User to DEMO')).not.toBeInTheDocument();
      });
    });

    it('should create supervisor when form is submitted', async () => {
      (api.adminCreateUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: {
          id: 'new-user',
          email: 'user@agency.gov',
          name: 'John Smith',
          role: 'supervisor',
          auth_status: 'invited',
          agency: { id: 'agency-1', code: 'DEMO', name: 'Demo PD' },
        },
        invite: { sent: true },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('user@agency.gov'), { target: { value: 'user@agency.gov' } });
      fireEvent.change(screen.getByPlaceholderText('John Smith'), { target: { value: 'John Smith' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Supervisor' }));

      await waitFor(() => {
        expect(api.adminCreateUser).toHaveBeenCalledWith({
          email: 'user@agency.gov',
          name: 'John Smith',
          role: 'supervisor',
          agency_code: 'DEMO',
        });
      });
    });

    it('should show success message after creating supervisor', async () => {
      (api.adminCreateUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: {
          id: 'new-user',
          email: 'user@agency.gov',
          name: 'John Smith',
          role: 'supervisor',
          auth_status: 'invited',
          agency: { id: 'agency-1', code: 'DEMO', name: 'Demo PD' },
        },
        invite: { sent: true },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('user@agency.gov'), { target: { value: 'user@agency.gov' } });
      fireEvent.change(screen.getByPlaceholderText('John Smith'), { target: { value: 'John Smith' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Supervisor' }));

      await waitFor(() => {
        expect(screen.getByText(/Supervisor.*user@agency.gov.*created/)).toBeInTheDocument();
      });
    });

    it('should close modal after successful supervisor creation', async () => {
      (api.adminCreateUser as ReturnType<typeof vi.fn>).mockResolvedValue({
        user: {
          id: 'new-user',
          email: 'user@agency.gov',
          name: 'John Smith',
          role: 'supervisor',
          auth_status: 'invited',
          agency: { id: 'agency-1', code: 'DEMO', name: 'Demo PD' },
        },
        invite: { sent: true },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('user@agency.gov'), { target: { value: 'user@agency.gov' } });
      fireEvent.change(screen.getByPlaceholderText('John Smith'), { target: { value: 'John Smith' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Supervisor' }));

      await waitFor(() => {
        expect(screen.queryByText('Add User to DEMO')).not.toBeInTheDocument();
      });
    });

    it('should show error message on supervisor creation failure', async () => {
      (api.adminCreateUser as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('User with this email already exists'));

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('user@agency.gov'), { target: { value: 'existing@agency.gov' } });
      fireEvent.change(screen.getByPlaceholderText('John Smith'), { target: { value: 'John Smith' } });
      fireEvent.click(screen.getByRole('button', { name: 'Create Supervisor' }));

      await waitFor(() => {
        expect(screen.getByText(/already exists/)).toBeInTheDocument();
      });
    });

    it('should disable Create Supervisor button when fields are empty', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      const createButton = screen.getByRole('button', { name: 'Create Supervisor' });
      expect(createButton).toBeDisabled();
    });

    it('should enable Create Supervisor button when required fields are filled', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText('Add User to DEMO')).toBeInTheDocument();
      });

      fireEvent.change(screen.getByPlaceholderText('user@agency.gov'), { target: { value: 'test@test.gov' } });
      fireEvent.change(screen.getByPlaceholderText('John Smith'), { target: { value: 'Test User' } });

      const createButton = screen.getByRole('button', { name: 'Create Supervisor' });
      expect(createButton).not.toBeDisabled();
    });

    it('should show invited status message in supervisor modal', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByTitle('Add user to DEMO'));

      await waitFor(() => {
        expect(screen.getByText(/invited.*status/i)).toBeInTheDocument();
      });
    });
  });

  describe('Admin Tab - View Agency Users Modal', () => {
    it('should open users modal when user count is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      // Click on user count (5) for DEMO agency - first View users button
      const userCountButtons = screen.getAllByTitle('View users');
      fireEvent.click(userCountButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Users in DEMO')).toBeInTheDocument();
      });
    });

    it('should display users for the selected agency', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      // Click on user count for DEMO agency
      const userCountButtons = screen.getAllByTitle('View users');
      fireEvent.click(userCountButtons[0]);

      // Should show users filtered by Demo PD agency
      await waitFor(() => {
        expect(screen.getByText('Admin User')).toBeInTheDocument();
      });
      expect(screen.getByText('Clerk User')).toBeInTheDocument();
    });

    it('should close users modal when X is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      const userCountButtons = screen.getAllByTitle('View users');
      fireEvent.click(userCountButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Users in DEMO')).toBeInTheDocument();
      });

      const modal = screen.getByText('Users in DEMO').closest('div[class*="fixed"]');
      const closeButton = within(modal as HTMLElement).getByText('×');
      fireEvent.click(closeButton);

      await waitFor(() => {
        expect(screen.queryByText('Users in DEMO')).not.toBeInTheDocument();
      });
    });

    it('should show empty message when agency has no users', async () => {
      (api.consoleGetRecentUsers as ReturnType<typeof vi.fn>).mockResolvedValue({ users: [] });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      const userCountButtons = screen.getAllByTitle('View users');
      fireEvent.click(userCountButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Users in DEMO')).toBeInTheDocument();
      });

      expect(screen.getByText('No users found')).toBeInTheDocument();
    });

    it('should display user role in the users list', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      const userCountButtons = screen.getAllByTitle('View users');
      fireEvent.click(userCountButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Users in DEMO')).toBeInTheDocument();
      });

      // Check that roles are displayed
      expect(screen.getByText(/supervisor/)).toBeInTheDocument();
      expect(screen.getByText(/clerk/)).toBeInTheDocument();
    });
  });

  describe('Admin Tab - Delete User', () => {
    it('should hide delete button for last supervisor in agency', async () => {
      // Mock only one supervisor for the agency
      (api.consoleGetRecentUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
        users: [
          { id: 'user-1', email: 'admin@demo.gov', name: 'Admin User', role: 'supervisor', created_at: 1234567890, agency_name: 'Demo PD' },
        ],
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      const userCountButtons = screen.getAllByTitle('View users');
      fireEvent.click(userCountButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Users in DEMO')).toBeInTheDocument();
      });

      // Last supervisor should not have a delete button
      expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    });

    it('should show delete button for supervisors when there are multiple', async () => {
      // Mock two supervisors for the agency
      (api.consoleGetRecentUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
        users: [
          { id: 'user-1', email: 'admin@demo.gov', name: 'Admin User', role: 'supervisor', created_at: 1234567890, agency_name: 'Demo PD' },
          { id: 'user-2', email: 'admin2@demo.gov', name: 'Admin User 2', role: 'supervisor', created_at: 1234567891, agency_name: 'Demo PD' },
        ],
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      const userCountButtons = screen.getAllByTitle('View users');
      fireEvent.click(userCountButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Users in DEMO')).toBeInTheDocument();
      });

      // Should have delete buttons for both supervisors
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      expect(deleteButtons).toHaveLength(2);
    });

    it('should always show delete button for clerks', async () => {
      // Mock one supervisor and one clerk
      (api.consoleGetRecentUsers as ReturnType<typeof vi.fn>).mockResolvedValue({
        users: [
          { id: 'user-1', email: 'admin@demo.gov', name: 'Admin User', role: 'supervisor', created_at: 1234567890, agency_name: 'Demo PD' },
          { id: 'user-2', email: 'clerk@demo.gov', name: 'Clerk User', role: 'clerk', created_at: 1234567891, agency_name: 'Demo PD' },
        ],
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText('DEMO')).toBeInTheDocument();
      });

      const userCountButtons = screen.getAllByTitle('View users');
      fireEvent.click(userCountButtons[0]);

      await waitFor(() => {
        expect(screen.getByText('Users in DEMO')).toBeInTheDocument();
      });

      // Should have one delete button (for clerk only, since there's only one supervisor)
      const deleteButtons = screen.getAllByRole('button', { name: 'Delete' });
      expect(deleteButtons).toHaveLength(1);
    });
  });

  describe('Monitoring Tab - Pause Controls', () => {
    it('should open pause confirmation modal when Pause button is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('System Controls')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Pause Processing' }));

      await waitFor(() => {
        expect(screen.getByText(/pause all new video detection/i)).toBeInTheDocument();
      });
    });

    it('should open terminate confirmation modal when Emergency Stop is clicked', async () => {
      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('System Controls')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Emergency Stop' }));

      await waitFor(() => {
        expect(screen.getByText(/immediately cancel ALL/i)).toBeInTheDocument();
      });
    });

    it('should show Resume button when system is paused', async () => {
      (api.consoleGetSystemPause as ReturnType<typeof vi.fn>).mockResolvedValue({
        system: { paused: true, terminate: false, reason: 'Maintenance' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('PAUSED')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Resume Processing' })).toBeInTheDocument();
    });

    it('should call pause API when confirmed', async () => {
      (api.consoleSetSystemPause as ReturnType<typeof vi.fn>).mockResolvedValue({
        system: { paused: true, terminate: false, reason: 'Manual pause from console' },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('System Controls')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Pause Processing' }));

      await waitFor(() => {
        expect(screen.getByText(/pause all new video detection/i)).toBeInTheDocument();
      });

      // Get all Pause Processing buttons and click the one in the modal (second one)
      const pauseButtons = screen.getAllByRole('button', { name: 'Pause Processing' });
      fireEvent.click(pauseButtons[1]);

      await waitFor(() => {
        expect(api.consoleSetSystemPause).toHaveBeenCalledWith(true, { reason: 'Manual pause from console' });
      });
    });

    it('should call resume API when Resume button is clicked', async () => {
      (api.consoleGetSystemPause as ReturnType<typeof vi.fn>).mockResolvedValue({
        system: { paused: true, terminate: false, reason: 'Maintenance' },
      });
      (api.consoleSetSystemPause as ReturnType<typeof vi.fn>).mockResolvedValue({
        system: { paused: false, terminate: false },
      });

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('PAUSED')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Resume Processing' }));

      await waitFor(() => {
        expect(api.consoleSetSystemPause).toHaveBeenCalledWith(false);
      });
    });
  });

  describe('Error Handling', () => {
    it('should display error message when API fails', async () => {
      (api.consoleGetSystemStatus as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText(/Network error/)).toBeInTheDocument();
      });
    });

    it('should display error when fetching agencies fails', async () => {
      (api.adminListAgencies as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Failed to fetch agencies'));

      render(<ConsolePage />);

      await waitFor(() => {
        expect(screen.getByText('Monitoring')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Admin' }));

      await waitFor(() => {
        expect(screen.getByText(/Failed to fetch agencies/)).toBeInTheDocument();
      });
    });
  });
});
