import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { api } from './api';

// Mock fetch for each test
const mockFetch = vi.fn();

// Store original fetch
const originalFetch = global.fetch;

describe('ApiService', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    api.setToken(null);
    // Replace global fetch with mock
    global.fetch = mockFetch;
  });

  afterEach(() => {
    // Restore original fetch
    global.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  describe('Token Management', () => {
    it('should set and get token', () => {
      expect(api.getToken()).toBeNull();
      api.setToken('test-token');
      expect(api.getToken()).toBe('test-token');
    });

    it('should clear token when set to null', () => {
      api.setToken('test-token');
      api.setToken(null);
      expect(api.getToken()).toBeNull();
    });
  });

  describe('Console Methods (Public)', () => {
    describe('consoleGetSystemStatus', () => {
      it('should fetch system status without auth', async () => {
        const mockResponse = {
          timestamp: Date.now(),
          cloudflare: { worker: { status: 'running' }, d1: { status: 'connected', counts: {} }, r2: { status: 'connected', bucket: 'test' } },
          aws: { lambda: { detection: {}, redaction: {} }, s3: {}, rekognition: {} },
          jobs: { last24h: {} },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await api.consoleGetSystemStatus();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/status'),
          expect.objectContaining({
            headers: { 'Content-Type': 'application/json' },
          })
        );
        expect(result).toEqual(mockResponse);
      });

      it('should throw error on failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Service unavailable' }),
        });

        await expect(api.consoleGetSystemStatus()).rejects.toThrow('Service unavailable');
      });
    });

    describe('consoleGetUsageSummary', () => {
      it('should fetch usage summary with default days', async () => {
        const mockResponse = { usage: { period: 'Last 30 days' } };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await api.consoleGetUsageSummary();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/usage?days=30'),
          expect.any(Object)
        );
      });

      it('should fetch usage summary with custom days', async () => {
        const mockResponse = { usage: { period: 'Last 7 days' } };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await api.consoleGetUsageSummary(7);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/usage?days=7'),
          expect.any(Object)
        );
      });
    });

    describe('consoleGetDailyUsage', () => {
      it('should fetch daily usage', async () => {
        const mockResponse = { daily: [] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await api.consoleGetDailyUsage(14);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/daily?days=14'),
          expect.any(Object)
        );
      });
    });

    describe('consoleGetAWSMetrics', () => {
      it('should fetch AWS metrics', async () => {
        const mockResponse = { aws: { period: {}, costs: [], totalCost: 0, lambda: {}, rekognition: {}, s3: {} } };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await api.consoleGetAWSMetrics(30);

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/aws?days=30'),
          expect.any(Object)
        );
      });
    });

    describe('consoleGetSystemPause', () => {
      it('should fetch system pause state', async () => {
        const mockResponse = { system: { paused: false, terminate: false } };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await api.consoleGetSystemPause();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/pause'),
          expect.any(Object)
        );
        expect(result.system.paused).toBe(false);
      });
    });

    describe('consoleSetSystemPause', () => {
      it('should set pause state', async () => {
        const mockResponse = { system: { paused: true, terminate: false, reason: 'Test' } };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await api.consoleSetSystemPause(true, { reason: 'Test' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/pause'),
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ paused: true, reason: 'Test' }),
          })
        );
        expect(result.system.paused).toBe(true);
      });

      it('should set pause with terminate flag', async () => {
        const mockResponse = { system: { paused: true, terminate: true } };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await api.consoleSetSystemPause(true, { terminate: true });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({ paused: true, terminate: true }),
          })
        );
      });

      it('should throw error on failure', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Unauthorized' }),
        });

        await expect(api.consoleSetSystemPause(true)).rejects.toThrow('Unauthorized');
      });
    });

    describe('consoleGetRecentAgencies', () => {
      it('should fetch recent agencies', async () => {
        const mockResponse = { agencies: [{ id: '1', code: 'DEMO', name: 'Demo PD', created_at: 123 }] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await api.consoleGetRecentAgencies();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/agencies'),
          expect.any(Object)
        );
        expect(result.agencies).toHaveLength(1);
      });
    });

    describe('consoleGetRecentUsers', () => {
      it('should fetch recent users', async () => {
        const mockResponse = { users: [{ id: '1', email: 'test@test.com', name: 'Test', role: 'clerk', created_at: 123, agency_name: 'Demo' }] };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await api.consoleGetRecentUsers();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/console/users'),
          expect.any(Object)
        );
        expect(result.users).toHaveLength(1);
      });
    });
  });

  describe('Admin Console Methods', () => {
    describe('adminListAgencies', () => {
      it('should fetch all agencies with user counts', async () => {
        const mockResponse = {
          agencies: [
            { id: '1', code: 'DEMO', name: 'Demo PD', default_deadline_days: 10, deadline_type: 'business_days', created_at: 123, user_count: 5 },
          ],
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await api.adminListAgencies();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/agencies'),
          expect.objectContaining({
            headers: { 'Content-Type': 'application/json' },
          })
        );
        expect(result.agencies[0].user_count).toBe(5);
      });

      it('should handle empty agency list', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve({ agencies: [] }),
        });

        const result = await api.adminListAgencies();

        expect(result.agencies).toEqual([]);
      });
    });

    describe('adminCreateAgency', () => {
      it('should create agency with required fields', async () => {
        const mockResponse = {
          agency: { id: 'new-1', code: 'NEWPD', name: 'New Police Department', default_deadline_days: 10, deadline_type: 'business_days' },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await api.adminCreateAgency({ code: 'NEWPD', name: 'New Police Department' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/agencies'),
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ code: 'NEWPD', name: 'New Police Department' }),
          })
        );
        expect(result.agency.code).toBe('NEWPD');
      });

      it('should create agency with custom deadline settings', async () => {
        const mockResponse = {
          agency: { id: 'new-1', code: 'CUSTOM', name: 'Custom PD', default_deadline_days: 30, deadline_type: 'calendar_days' },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await api.adminCreateAgency({
          code: 'CUSTOM',
          name: 'Custom PD',
          default_deadline_days: 30,
          deadline_type: 'calendar_days',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.any(String),
          expect.objectContaining({
            body: JSON.stringify({
              code: 'CUSTOM',
              name: 'Custom PD',
              default_deadline_days: 30,
              deadline_type: 'calendar_days',
            }),
          })
        );
      });

      it('should throw error when agency code already exists', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Agency with this code already exists' }),
        });

        await expect(api.adminCreateAgency({ code: 'DEMO', name: 'Demo PD' })).rejects.toThrow('Agency with this code already exists');
      });

      it('should throw error when required fields are missing', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Code and name are required' }),
        });

        await expect(api.adminCreateAgency({ code: '', name: '' })).rejects.toThrow('Code and name are required');
      });

      it('should handle unknown error gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('Parse error')),
        });

        await expect(api.adminCreateAgency({ code: 'TEST', name: 'Test' })).rejects.toThrow('Unknown error');
      });
    });

    describe('adminCreateSupervisor', () => {
      it('should create supervisor with invited status', async () => {
        const mockResponse = {
          user: {
            id: 'user-1',
            email: 'supervisor@agency.gov',
            name: 'John Smith',
            role: 'supervisor',
            auth_status: 'invited',
            agency: { id: 'agency-1', code: 'DEMO', name: 'Demo PD' },
          },
        };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        const result = await api.adminCreateSupervisor({
          email: 'supervisor@agency.gov',
          name: 'John Smith',
          agency_code: 'DEMO',
        });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/admin/supervisors'),
          expect.objectContaining({
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              email: 'supervisor@agency.gov',
              name: 'John Smith',
              agency_code: 'DEMO',
            }),
          })
        );
        expect(result.user.role).toBe('supervisor');
        expect(result.user.auth_status).toBe('invited');
      });

      it('should throw error when agency not found', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Agency not found' }),
        });

        await expect(
          api.adminCreateSupervisor({ email: 'test@test.com', name: 'Test', agency_code: 'NONEXISTENT' })
        ).rejects.toThrow('Agency not found');
      });

      it('should throw error when email already exists', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'User with this email already exists' }),
        });

        await expect(
          api.adminCreateSupervisor({ email: 'existing@agency.gov', name: 'Test', agency_code: 'DEMO' })
        ).rejects.toThrow('User with this email already exists');
      });

      it('should throw error when required fields are missing', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          json: () => Promise.resolve({ error: 'Email, name, and agency_code are required' }),
        });

        await expect(
          api.adminCreateSupervisor({ email: '', name: '', agency_code: '' })
        ).rejects.toThrow('Email, name, and agency_code are required');
      });

      it('should handle unknown error gracefully', async () => {
        mockFetch.mockResolvedValueOnce({
          ok: false,
          status: 500,
          json: () => Promise.reject(new Error('Parse error')),
        });

        await expect(
          api.adminCreateSupervisor({ email: 'test@test.com', name: 'Test', agency_code: 'DEMO' })
        ).rejects.toThrow('Unknown error');
      });
    });
  });

  describe('Authenticated Methods', () => {
    beforeEach(() => {
      api.setToken('test-auth-token');
    });

    describe('getSystemPause', () => {
      it('should fetch system pause state with auth header', async () => {
        const mockResponse = { system: { paused: false, terminate: false } };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await api.getSystemPause();

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/system/pause'),
          expect.objectContaining({
            headers: expect.objectContaining({
              Authorization: 'Bearer test-auth-token',
            }),
          })
        );
      });
    });

    describe('setSystemPause', () => {
      it('should set system pause state with auth header', async () => {
        const mockResponse = { system: { paused: true, terminate: false, reason: 'Maintenance' } };

        mockFetch.mockResolvedValueOnce({
          ok: true,
          json: () => Promise.resolve(mockResponse),
        });

        await api.setSystemPause(true, { reason: 'Maintenance' });

        expect(mockFetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/system/pause'),
          expect.objectContaining({
            method: 'POST',
            headers: expect.objectContaining({
              Authorization: 'Bearer test-auth-token',
            }),
          })
        );
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(api.consoleGetSystemStatus()).rejects.toThrow('Network error');
    });

    it('should handle JSON parse errors in error response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: () => Promise.reject(new Error('Invalid JSON')),
      });

      await expect(api.adminCreateAgency({ code: 'TEST', name: 'Test' })).rejects.toThrow('Unknown error');
    });
  });
});
