import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { RequestsList } from './RequestsList';
import { mockRequest } from '../test/handlers';
import { server } from '../test/setup';

const API_BASE = 'https://redact-1-worker.joelstevick.workers.dev';

const renderRequestsList = (props = {}) => {
  const defaultProps = {
    requests: [mockRequest],
    isLoading: false,
    selectedId: null,
    onSelect: vi.fn(),
    onNewRequest: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
    ...props,
  };

  return render(
    <BrowserRouter>
      <RequestsList {...defaultProps} />
    </BrowserRouter>
  );
};

describe('RequestsList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the header and New Request button', () => {
    renderRequestsList();

    expect(screen.getByText('Records Requests')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new request/i })).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderRequestsList();

    expect(screen.getByPlaceholderText(/search requests/i)).toBeInTheDocument();
  });

  it('displays requests in the list', () => {
    renderRequestsList();

    expect(screen.getByText('RR-20260318-001')).toBeInTheDocument();
    expect(screen.getByText('Test Request')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderRequestsList({ isLoading: true, requests: [] });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows empty state when no requests', () => {
    renderRequestsList({ requests: [], isLoading: false });

    expect(screen.getByText(/no requests yet/i)).toBeInTheDocument();
  });

  it('calls onSelect when request is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderRequestsList({ onSelect });

    // Click on the request number (not the title, which triggers edit mode)
    const requestItem = screen.getByText('RR-20260318-001');
    await user.click(requestItem);

    expect(onSelect).toHaveBeenCalledWith(mockRequest);
  });

  it('calls onNewRequest when New Request button clicked', async () => {
    const user = userEvent.setup();
    const onNewRequest = vi.fn();
    renderRequestsList({ onNewRequest });

    const newRequestBtn = screen.getByRole('button', { name: /new request/i });
    await user.click(newRequestBtn);

    expect(onNewRequest).toHaveBeenCalled();
  });

  it('highlights selected request', () => {
    renderRequestsList({ selectedId: 'req-1' });

    const requestItem = screen.getByText('Test Request').closest('div[class*="border"]');
    expect(requestItem?.className).toContain('border-blue-500');
  });

  it('filters requests by search term', async () => {
    const user = userEvent.setup();
    const requests = [
      mockRequest,
      { ...mockRequest, id: 'req-2', request_number: 'RR-20260318-002', title: 'Another Request' },
    ];
    renderRequestsList({ requests });

    const searchInput = screen.getByPlaceholderText(/search requests/i);
    await user.type(searchInput, 'Another');

    expect(screen.queryByText('Test Request')).not.toBeInTheDocument();
    expect(screen.getByText('Another Request')).toBeInTheDocument();
  });

  it('shows archive button for each request', () => {
    renderRequestsList();

    const archiveButtons = screen.getAllByTitle(/archive/i);
    expect(archiveButtons.length).toBeGreaterThan(0);
  });

  it('shows delete button for each request', () => {
    renderRequestsList();

    const deleteButtons = screen.getAllByTitle(/delete/i);
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it('shows restore button in archived view', () => {
    const archivedRequest = { ...mockRequest, archived_at: Date.now() };
    renderRequestsList({
      requests: [archivedRequest],
      showArchived: true,
      onUnarchive: vi.fn(),
    });

    const restoreButtons = screen.getAllByTitle(/restore/i);
    expect(restoreButtons.length).toBeGreaterThan(0);
  });

  it('hides New Request button in archived view', () => {
    renderRequestsList({ showArchived: true });

    const newRequestBtn = screen.queryByRole('button', { name: /new request/i });
    expect(newRequestBtn).not.toBeInTheDocument();
  });

  it('displays request status badge', () => {
    renderRequestsList();

    expect(screen.getByText('new')).toBeInTheDocument();
  });

  // ============================================
  // Inline Title Editing Tests
  // ============================================

  describe('inline title editing', () => {
    it('shows edit controls when title is clicked', async () => {
      const user = userEvent.setup();
      renderRequestsList();

      const titleElement = screen.getByText('Test Request');
      await user.click(titleElement);

      expect(screen.getByPlaceholderText(/add title/i)).toBeInTheDocument();
      expect(screen.getByTitle(/save/i)).toBeInTheDocument();
      expect(screen.getByTitle(/cancel/i)).toBeInTheDocument();
    });

    it('shows "Add title..." placeholder for request without title', () => {
      const requestWithoutTitle = { ...mockRequest, title: '' };
      renderRequestsList({ requests: [requestWithoutTitle] });

      expect(screen.getByText(/add title/i)).toBeInTheDocument();
    });

    it('cancels editing when cancel button is clicked', async () => {
      const user = userEvent.setup();
      renderRequestsList();

      const titleElement = screen.getByText('Test Request');
      await user.click(titleElement);

      const cancelBtn = screen.getByTitle(/cancel/i);
      await user.click(cancelBtn);

      expect(screen.queryByPlaceholderText(/add title/i)).not.toBeInTheDocument();
      expect(screen.getByText('Test Request')).toBeInTheDocument();
    });

    it('cancels editing when Escape is pressed', async () => {
      const user = userEvent.setup();
      renderRequestsList();

      const titleElement = screen.getByText('Test Request');
      await user.click(titleElement);

      const input = screen.getByPlaceholderText(/add title/i);
      await user.type(input, '{Escape}');

      expect(screen.queryByPlaceholderText(/add title/i)).not.toBeInTheDocument();
    });
  });

  // ============================================
  // File Count Badge Tests
  // ============================================

  describe('file count badge', () => {
    it('shows file count badge when files exist', () => {
      const requestWithFiles = {
        ...mockRequest,
        file_count: 3,
        files_completed: 1,
      };
      renderRequestsList({ requests: [requestWithFiles] });

      expect(screen.getByText('1/3 files')).toBeInTheDocument();
    });

    it('does not show file count badge when no files', () => {
      const requestWithNoFiles = {
        ...mockRequest,
        file_count: 0,
        files_completed: 0,
      };
      renderRequestsList({ requests: [requestWithNoFiles] });

      expect(screen.queryByText(/files/)).not.toBeInTheDocument();
    });

    it('shows green badge when all files completed', () => {
      const requestAllCompleted = {
        ...mockRequest,
        file_count: 2,
        files_completed: 2,
      };
      renderRequestsList({ requests: [requestAllCompleted] });

      const badge = screen.getByText('2/2 files');
      expect(badge.className).toContain('bg-green');
    });

    it('shows gray badge when not all files completed', () => {
      const requestPartial = {
        ...mockRequest,
        file_count: 3,
        files_completed: 1,
      };
      renderRequestsList({ requests: [requestPartial] });

      const badge = screen.getByText('1/3 files');
      expect(badge.className).toContain('bg-gray');
    });

    it('file count badge has tooltip', () => {
      const requestWithFiles = {
        ...mockRequest,
        file_count: 3,
        files_completed: 1,
      };
      renderRequestsList({ requests: [requestWithFiles] });

      const badge = screen.getByTitle(/1 of 3 files reviewed/i);
      expect(badge).toBeInTheDocument();
    });
  });

  // ============================================
  // Date Formatting Tests
  // ============================================

  describe('date formatting', () => {
    it('formats timestamps in seconds correctly', () => {
      const requestWithSecondsTimestamp = {
        ...mockRequest,
        request_date: 1710720000, // Timestamp in seconds
      };
      renderRequestsList({ requests: [requestWithSecondsTimestamp] });

      // The date should be formatted correctly (not showing 1970)
      const dateElements = screen.getAllByText(/2024|2025|2026/);
      expect(dateElements.length).toBeGreaterThan(0);
    });

    it('formats timestamps in milliseconds correctly', () => {
      const requestWithMsTimestamp = {
        ...mockRequest,
        request_date: Date.now(),
      };
      renderRequestsList({ requests: [requestWithMsTimestamp] });

      // The date should be formatted correctly
      const dateElements = screen.getAllByText(/2024|2025|2026/);
      expect(dateElements.length).toBeGreaterThan(0);
    });

    it('date has tooltip explaining it is request received date', () => {
      renderRequestsList();

      const dateWithTooltip = screen.getByTitle(/date request was received/i);
      expect(dateWithTooltip).toBeInTheDocument();
    });
  });

  // ============================================
  // Download Button Tests
  // ============================================

  describe('download button state', () => {
    it('disables download when files have pending detections', async () => {
      // Mock files with pending detections
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              status: 'uploaded',
              detection_count: 2,
              pending_count: 1, // Has pending
            }],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/complete review to enable download/i);
        expect(downloadBtn).toBeDisabled();
      });
    });

    it('enables download when all files are completed', async () => {
      // Mock files with all detections completed
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              status: 'uploaded',
              detection_count: 2,
              pending_count: 0, // No pending
            }],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('enables download when file is marked as reviewed', async () => {
      // Mock file marked as reviewed (no detections needed)
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              status: 'reviewed',
              detection_count: 0,
              pending_count: 0,
            }],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('disables download when request has no files', async () => {
      // Mock empty files
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({ files: [] });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/complete review to enable download/i);
        expect(downloadBtn).toBeDisabled();
      });
    });

    it('disables download when file check fails', async () => {
      // Mock API error
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({ error: 'Server error' }, { status: 500 });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/complete review to enable download/i);
        expect(downloadBtn).toBeDisabled();
      });
    });
  });
});
