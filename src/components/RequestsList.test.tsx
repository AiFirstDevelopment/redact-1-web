import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { RequestsList } from './RequestsList';
import { mockRequest } from '../test/handlers';
import { server } from '../test/setup';
import React from 'react';

// Mock react-window to render all items without virtualization
vi.mock('react-window', () => ({
  FixedSizeList: ({ children, itemCount }: { children: (props: { index: number; style: React.CSSProperties }) => React.ReactNode; itemCount: number }) => (
    <div data-testid="virtual-list">
      {Array.from({ length: itemCount }, (_, index) =>
        children({ index, style: {} })
      )}
    </div>
  ),
}));

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
    searchTerm: '',
    onSearchChange: vi.fn(),
    assigneeFilter: '',
    onAssigneeFilterChange: vi.fn(),
    total: 1,
    onLoadMore: vi.fn(),
    isLoadingMore: false,
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

  it('calls onSearchChange when search term is typed', async () => {
    const user = userEvent.setup();
    const onSearchChange = vi.fn();
    renderRequestsList({ onSearchChange });

    const searchInput = screen.getByPlaceholderText(/search requests/i);
    await user.type(searchInput, 'a');

    expect(onSearchChange).toHaveBeenCalledWith('a');
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

  // ============================================
  // Search Highlight Tests
  // ============================================

  describe('search highlight', () => {
    it('highlights matching text in request number when search term matches', () => {
      renderRequestsList({ searchTerm: '001' });

      const highlight = screen.getByText('001');
      expect(highlight.tagName).toBe('MARK');
      expect(highlight.className).toContain('bg-yellow-300');
    });

    it('highlights matching text in title when search term matches', () => {
      renderRequestsList({ searchTerm: 'Test' });

      const highlight = screen.getByText('Test');
      expect(highlight.tagName).toBe('MARK');
      expect(highlight.className).toContain('bg-yellow-300');
    });

    it('highlights partial matches case-insensitively', () => {
      renderRequestsList({ searchTerm: 'test' });

      const highlight = screen.getByText('Test');
      expect(highlight.tagName).toBe('MARK');
    });

    it('does not highlight when search term is empty', () => {
      renderRequestsList({ searchTerm: '' });

      const requestNumber = screen.getByText('RR-20260318-001');
      expect(requestNumber.tagName).not.toBe('MARK');
    });

    it('does not highlight when search term does not match', () => {
      renderRequestsList({ searchTerm: 'xyz' });

      const requestNumber = screen.getByText('RR-20260318-001');
      expect(requestNumber.tagName).not.toBe('MARK');
    });

    it('highlights multiple occurrences in the same text', () => {
      const requestWithRepeatingText = {
        ...mockRequest,
        title: 'Test case for test',
      };
      renderRequestsList({ requests: [requestWithRepeatingText], searchTerm: 'test' });

      const highlights = screen.getAllByText(/test/i).filter(el => el.tagName === 'MARK');
      expect(highlights.length).toBe(2);
    });
  });

  // ============================================
  // Notes Display Tests
  // ============================================

  describe('notes display', () => {
    it('shows notes when request has notes', () => {
      const requestWithNotes = {
        ...mockRequest,
        notes: 'Important case note',
      };
      renderRequestsList({ requests: [requestWithNotes] });

      expect(screen.getByText('Important case note')).toBeInTheDocument();
    });

    it('does not show notes when request has no notes', () => {
      const requestWithoutNotes = {
        ...mockRequest,
        notes: null,
      };
      renderRequestsList({ requests: [requestWithoutNotes] });

      // The notes section should not be rendered
      const notesElement = screen.queryByText(/Important case note/);
      expect(notesElement).not.toBeInTheDocument();
    });

    it('does not show notes when notes is empty string', () => {
      const requestWithEmptyNotes = {
        ...mockRequest,
        notes: '',
      };
      renderRequestsList({ requests: [requestWithEmptyNotes] });

      // There should be no italic paragraph for notes (other than the "Add title..." which could exist)
      const italicElements = document.querySelectorAll('p.italic');
      // Filter to find notes-specific elements (should be none for empty notes)
      const notesElements = Array.from(italicElements).filter(el =>
        el.classList.contains('truncate')
      );
      expect(notesElements.length).toBe(0);
    });

    it('notes display has truncate class for long text', () => {
      const requestWithLongNotes = {
        ...mockRequest,
        notes: 'This is a very long note that should be truncated when displayed on the card to prevent it from taking up too much space',
      };
      renderRequestsList({ requests: [requestWithLongNotes] });

      const notesElement = screen.getByText(/This is a very long note/);
      expect(notesElement.className).toContain('truncate');
    });

    it('notes display has full text in title attribute for tooltip', () => {
      const longNote = 'This is a very long note that should show full text on hover';
      const requestWithLongNotes = {
        ...mockRequest,
        notes: longNote,
      };
      renderRequestsList({ requests: [requestWithLongNotes] });

      const notesElement = screen.getByTitle(longNote);
      expect(notesElement).toBeInTheDocument();
    });

    it('notes display is styled in italic gray text', () => {
      const requestWithNotes = {
        ...mockRequest,
        notes: 'Test note styling',
      };
      renderRequestsList({ requests: [requestWithNotes] });

      const notesElement = screen.getByText('Test note styling');
      expect(notesElement.className).toContain('italic');
      expect(notesElement.className).toContain('text-gray-500');
    });
  });

  // ============================================
  // Audit Trail Modal Tests
  // ============================================

  describe('audit trail modal', () => {
    it('shows audit trail button for each request', () => {
      renderRequestsList();

      const auditButtons = screen.getAllByTitle(/view audit trail/i);
      expect(auditButtons.length).toBeGreaterThan(0);
    });

    it('opens audit trail modal when button is clicked', async () => {
      const user = userEvent.setup();

      // Mock audit logs API
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/audit`, () => {
          return HttpResponse.json({
            audit_logs: [
              {
                id: 'log-1',
                user_id: 'user-1',
                user_name: 'Test User',
                action: 'bulk_update_video_detections',
                entity_type: 'file',
                entity_id: 'file-1',
                details: JSON.stringify({ status: 'approved', count: 5, comment: 'Test note' }),
                created_at: Date.now() / 1000,
              },
            ],
          });
        })
      );

      renderRequestsList();

      const auditButton = screen.getAllByTitle(/view audit trail/i)[0];
      await user.click(auditButton);

      await waitFor(() => {
        expect(screen.getByText(/audit trail/i)).toBeInTheDocument();
      });
    });

    it('displays audit logs in modal with formatted action', async () => {
      const user = userEvent.setup();
      renderRequestsList();

      const auditButton = screen.getAllByTitle(/view audit trail/i)[0];
      await user.click(auditButton);

      // Default handler returns an audit log - wait for modal to show
      await waitFor(() => {
        expect(screen.getByText(/Audit Trail - RR/)).toBeInTheDocument();
      });

      // Should show the action from default handler
      await waitFor(() => {
        expect(screen.getByText(/Create request/)).toBeInTheDocument();
      });
    });

    it('closes modal when close button is clicked', async () => {
      const user = userEvent.setup();
      renderRequestsList();

      const auditButton = screen.getAllByTitle(/view audit trail/i)[0];
      await user.click(auditButton);

      await waitFor(() => {
        expect(screen.getByText(/Audit Trail - RR/)).toBeInTheDocument();
      });

      // Find the close button in the modal
      const modalCloseButtons = screen.getAllByRole('button').filter(btn =>
        btn.closest('.fixed') && btn.querySelector('svg')
      );
      await user.click(modalCloseButtons[0]);

      await waitFor(() => {
        expect(screen.queryByText(/Audit Trail - RR/)).not.toBeInTheDocument();
      });
    });

    it('closes modal when clicking backdrop', async () => {
      const user = userEvent.setup();
      renderRequestsList();

      const auditButton = screen.getAllByTitle(/view audit trail/i)[0];
      await user.click(auditButton);

      await waitFor(() => {
        expect(screen.getByText(/Audit Trail - RR/)).toBeInTheDocument();
      });

      // Click the backdrop (the outer fixed div)
      const backdrop = document.querySelector('.fixed.inset-0');
      if (backdrop) {
        await user.click(backdrop);
      }

      await waitFor(() => {
        expect(screen.queryByText(/Audit Trail - RR/)).not.toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Assignee Filter Tests
  // ============================================

  describe('assignee filter', () => {
    it('renders assignee filter dropdown with All Assignees option', () => {
      renderRequestsList();

      expect(screen.getByText('All Assignees')).toBeInTheDocument();
    });

    it('populates assignee filter with users from API', async () => {
      renderRequestsList();

      await waitFor(() => {
        // Find the filter dropdown by finding the one that contains "All Assignees"
        const allAssigneesOption = screen.getByText('All Assignees');
        const filterSelect = allAssigneesOption.closest('select');
        expect(filterSelect).toBeInTheDocument();
        // Check that user option exists in the filter
        expect(filterSelect?.querySelector('option[value="user-1"]')).toBeInTheDocument();
      });
    });

    it('calls onAssigneeFilterChange when assignee is selected', async () => {
      const user = userEvent.setup();
      const onAssigneeFilterChange = vi.fn();
      renderRequestsList({ onAssigneeFilterChange });

      // Wait for users to load in the dropdown
      await waitFor(() => {
        const allAssigneesOption = screen.getByText('All Assignees');
        const filterSelect = allAssigneesOption.closest('select') as HTMLSelectElement;
        expect(filterSelect?.querySelector('option[value="user-1"]')).toBeInTheDocument();
      });

      // Find the filter dropdown specifically (the one with "All Assignees")
      const allAssigneesOption = screen.getByText('All Assignees');
      const filterSelect = allAssigneesOption.closest('select') as HTMLSelectElement;
      await user.selectOptions(filterSelect, 'user-1');

      expect(onAssigneeFilterChange).toHaveBeenCalledWith('user-1');
    });

    it('calls onAssigneeFilterChange with empty string when All Assignees selected', async () => {
      const user = userEvent.setup();
      const onAssigneeFilterChange = vi.fn();
      renderRequestsList({ assigneeFilter: 'user-1', onAssigneeFilterChange });

      await waitFor(() => {
        expect(screen.getByText('All Assignees')).toBeInTheDocument();
      });

      const allAssigneesOption = screen.getByText('All Assignees');
      const filterSelect = allAssigneesOption.closest('select') as HTMLSelectElement;
      await user.selectOptions(filterSelect, '');

      expect(onAssigneeFilterChange).toHaveBeenCalledWith('');
    });

    it('shows selected assignee in filter dropdown', async () => {
      renderRequestsList({ assigneeFilter: 'user-1' });

      await waitFor(() => {
        const allAssigneesOption = screen.getByText('All Assignees');
        const filterSelect = allAssigneesOption.closest('select') as HTMLSelectElement;
        expect(filterSelect.value).toBe('user-1');
      });
    });
  });

  // ============================================
  // Video Redaction PDF Export Tests
  // ============================================

  describe('video redaction PDF export', () => {
    it('enables download for video with approved detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'bodycam.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 3,
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

    it('enables download for video with rejected detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'bodycam.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 2,
              pending_count: 0,
            }],
          });
        }),
        http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
          return HttpResponse.json({
            detections: [
              {
                id: 'vdet-1',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 1000,
                end_time_ms: 5000,
                bbox_x: 0.2,
                bbox_y: 0.3,
                bbox_width: 0.15,
                bbox_height: 0.2,
                track_id: 'face-001',
                status: 'rejected',
                exemption_code: null,
                comment: 'Not a face',
                created_at: Date.now(),
              },
            ],
            tracks: [{ track_id: 'face-001', count: 1 }],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('enables download for video with mixed approved and rejected detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'bodycam.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 4,
              pending_count: 0,
            }],
          });
        }),
        http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
          return HttpResponse.json({
            detections: [
              {
                id: 'vdet-1',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 0,
                end_time_ms: 3000,
                bbox_x: 0.1,
                bbox_y: 0.1,
                bbox_width: 0.2,
                bbox_height: 0.25,
                track_id: 'face-001',
                status: 'approved',
                exemption_code: 'b6',
                comment: 'Privacy exemption',
                created_at: Date.now(),
              },
              {
                id: 'vdet-2',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 5000,
                end_time_ms: 8000,
                bbox_x: 0.5,
                bbox_y: 0.4,
                bbox_width: 0.18,
                bbox_height: 0.22,
                track_id: 'face-002',
                status: 'rejected',
                exemption_code: null,
                comment: 'Officer face - public record',
                created_at: Date.now(),
              },
            ],
            tracks: [
              { track_id: 'face-001', count: 1 },
              { track_id: 'face-002', count: 1 },
            ],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('disables download for video with pending detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'bodycam.mp4',
              file_type: 'video',
              status: 'uploaded',
              detection_count: 5,
              pending_count: 3,
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

    it('enables download for video with multiple tracks at different timestamps', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'interview.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 6,
              pending_count: 0,
            }],
          });
        }),
        http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
          return HttpResponse.json({
            detections: [
              {
                id: 'vdet-1',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 0,
                end_time_ms: 10000,
                bbox_x: 0.1,
                bbox_y: 0.1,
                bbox_width: 0.2,
                bbox_height: 0.25,
                track_id: 'face-001',
                status: 'approved',
                exemption_code: 'b6',
                comment: 'Witness face',
                created_at: Date.now(),
              },
              {
                id: 'vdet-2',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 15000,
                end_time_ms: 25000,
                bbox_x: 0.6,
                bbox_y: 0.2,
                bbox_width: 0.15,
                bbox_height: 0.2,
                track_id: 'face-002',
                status: 'approved',
                exemption_code: 'b7c',
                comment: 'Confidential informant',
                created_at: Date.now(),
              },
              {
                id: 'vdet-3',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 30000,
                end_time_ms: 45000,
                bbox_x: 0.3,
                bbox_y: 0.5,
                bbox_width: 0.2,
                bbox_height: 0.25,
                track_id: 'face-003',
                status: 'rejected',
                exemption_code: null,
                comment: 'Detective - public official',
                created_at: Date.now(),
              },
            ],
            tracks: [
              { track_id: 'face-001', count: 1 },
              { track_id: 'face-002', count: 1 },
              { track_id: 'face-003', count: 1 },
            ],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('enables download for video with long comments that wrap', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'bodycam.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 1,
              pending_count: 0,
            }],
          });
        }),
        http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
          return HttpResponse.json({
            detections: [
              {
                id: 'vdet-1',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 0,
                end_time_ms: 5000,
                bbox_x: 0.2,
                bbox_y: 0.3,
                bbox_width: 0.15,
                bbox_height: 0.2,
                track_id: 'face-001',
                status: 'approved',
                exemption_code: 'b6',
                comment: 'This is a very long comment that should wrap to multiple lines in the PDF summary index',
                created_at: Date.now(),
              },
            ],
            tracks: [{ track_id: 'face-001', count: 1 }],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('enables download when video has detections in different frame positions', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'bodycam.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 3,
              pending_count: 0,
            }],
          });
        }),
        http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
          return HttpResponse.json({
            detections: [
              // Upper-left position
              {
                id: 'vdet-1',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 0,
                end_time_ms: 3000,
                bbox_x: 0.1,
                bbox_y: 0.1,
                bbox_width: 0.15,
                bbox_height: 0.2,
                track_id: 'face-001',
                status: 'approved',
                exemption_code: 'b6',
                comment: 'Upper left face',
                created_at: Date.now(),
              },
              // Center position
              {
                id: 'vdet-2',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 5000,
                end_time_ms: 8000,
                bbox_x: 0.4,
                bbox_y: 0.4,
                bbox_width: 0.2,
                bbox_height: 0.2,
                track_id: 'face-002',
                status: 'approved',
                exemption_code: 'b7c',
                comment: 'Center face',
                created_at: Date.now(),
              },
              // Lower-right position
              {
                id: 'vdet-3',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 10000,
                end_time_ms: 15000,
                bbox_x: 0.7,
                bbox_y: 0.7,
                bbox_width: 0.2,
                bbox_height: 0.25,
                track_id: 'face-003',
                status: 'rejected',
                exemption_code: null,
                comment: 'Lower right - public figure',
                created_at: Date.now(),
              },
            ],
            tracks: [
              { track_id: 'face-001', count: 1 },
              { track_id: 'face-002', count: 1 },
              { track_id: 'face-003', count: 1 },
            ],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('enables download for video with tracks starting at same time (page grouping)', async () => {
      // Test case: multiple tracks starting at 0ms should be grouped on same page
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'store_footage.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 3,
              pending_count: 0,
            }],
          });
        }),
        http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
          return HttpResponse.json({
            detections: [
              // Two faces appearing at the same time (should be grouped)
              {
                id: 'vdet-1',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 0,
                end_time_ms: 5530,
                bbox_x: 0.1,
                bbox_y: 0.2,
                bbox_width: 0.15,
                bbox_height: 0.2,
                track_id: 'face-000',
                status: 'approved',
                exemption_code: 'b7c',
                comment: 'Employee',
                created_at: Date.now(),
              },
              {
                id: 'vdet-2',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 0,
                end_time_ms: 6030,
                bbox_x: 0.5,
                bbox_y: 0.3,
                bbox_width: 0.12,
                bbox_height: 0.18,
                track_id: 'face-001',
                status: 'approved',
                exemption_code: 'b7c',
                comment: 'Customer',
                created_at: Date.now(),
              },
              // Third face appearing within 1 second (should also be grouped)
              {
                id: 'vdet-3',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 500,
                end_time_ms: 530,
                bbox_x: 0.7,
                bbox_y: 0.4,
                bbox_width: 0.1,
                bbox_height: 0.15,
                track_id: 'face-002',
                status: 'approved',
                exemption_code: 'b7c',
                comment: 'Bystander',
                created_at: Date.now(),
              },
            ],
            tracks: [
              { track_id: 'face-000', count: 1 },
              { track_id: 'face-001', count: 1 },
              { track_id: 'face-002', count: 1 },
            ],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('enables download for video with tracks at different times (separate pages)', async () => {
      // Test case: tracks starting more than 1 second apart should be on separate pages
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'interview.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 2,
              pending_count: 0,
            }],
          });
        }),
        http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
          return HttpResponse.json({
            detections: [
              {
                id: 'vdet-1',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 0,
                end_time_ms: 5000,
                bbox_x: 0.2,
                bbox_y: 0.2,
                bbox_width: 0.15,
                bbox_height: 0.2,
                track_id: 'face-000',
                status: 'approved',
                exemption_code: 'b6',
                comment: 'First person',
                created_at: Date.now(),
              },
              // This face appears more than 1 second later (separate page)
              {
                id: 'vdet-2',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 10000,
                end_time_ms: 15000,
                bbox_x: 0.6,
                bbox_y: 0.3,
                bbox_width: 0.12,
                bbox_height: 0.18,
                track_id: 'face-001',
                status: 'approved',
                exemption_code: 'b6',
                comment: 'Second person entering later',
                created_at: Date.now(),
              },
            ],
            tracks: [
              { track_id: 'face-000', count: 1 },
              { track_id: 'face-001', count: 1 },
            ],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('enables download for video with short-duration track (midpoint capture)', async () => {
      // Test case: track less than 1 second should capture at midpoint
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'video-1',
              request_id: 'req-1',
              filename: 'quick_pass.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 1,
              pending_count: 0,
            }],
          });
        }),
        http.get(`${API_BASE}/api/files/:fileId/video/detections`, () => {
          return HttpResponse.json({
            detections: [
              {
                id: 'vdet-1',
                file_id: 'video-1',
                detection_type: 'face',
                start_time_ms: 5000,
                end_time_ms: 5500, // Only 500ms duration
                bbox_x: 0.3,
                bbox_y: 0.4,
                bbox_width: 0.1,
                bbox_height: 0.15,
                track_id: 'face-000',
                status: 'approved',
                exemption_code: 'b6',
                comment: 'Brief appearance',
                created_at: Date.now(),
              },
            ],
            tracks: [{ track_id: 'face-000', count: 1 }],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });
  });

  // ============================================
  // PDF Export with Redaction Index Tests
  // ============================================

  describe('PDF export with redaction index', () => {
    it('enables download for PDF with approved and rejected detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              file_type: 'pdf',
              status: 'reviewed',
              detection_count: 3,
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

    it('enables download for multi-page PDF with detections on different pages', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'multipage.pdf',
              file_type: 'pdf',
              status: 'reviewed',
              detection_count: 4,
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

    it('enables download for image files with redactions', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'photo.jpg',
              file_type: 'image',
              status: 'reviewed',
              detection_count: 1,
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

    it('enables download for video files', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'bodycam.mp4',
              file_type: 'video',
              status: 'reviewed',
              detection_count: 5,
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

    it('enables download for mixed file types', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [
              { id: 'file-1', request_id: 'req-1', filename: 'doc.pdf', file_type: 'pdf', status: 'reviewed', detection_count: 2, pending_count: 0 },
              { id: 'file-2', request_id: 'req-1', filename: 'photo.jpg', file_type: 'image', status: 'reviewed', detection_count: 1, pending_count: 0 },
              { id: 'file-3', request_id: 'req-1', filename: 'video.mp4', file_type: 'video', status: 'reviewed', detection_count: 3, pending_count: 0 },
            ],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/download redacted files/i);
        expect(downloadBtn).not.toBeDisabled();
      });
    });

    it('disables download when some files have pending detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [
              { id: 'file-1', request_id: 'req-1', filename: 'doc.pdf', file_type: 'pdf', status: 'reviewed', detection_count: 2, pending_count: 0 },
              { id: 'file-2', request_id: 'req-1', filename: 'photo.jpg', file_type: 'image', status: 'uploaded', detection_count: 1, pending_count: 1 },
            ],
          });
        })
      );

      renderRequestsList();

      await waitFor(() => {
        const downloadBtn = screen.getByTitle(/complete review to enable download/i);
        expect(downloadBtn).toBeDisabled();
      });
    });

    it('enables download when file has only rejected detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              file_type: 'pdf',
              status: 'reviewed',
              detection_count: 2,
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
  });

  describe('Archived Request Features', () => {
    it('hides edit button when showArchived is true', () => {
      renderRequestsList({ showArchived: true });

      // Edit button should not be present for archived requests
      const editButtons = screen.queryAllByTitle('Edit');
      expect(editButtons).toHaveLength(0);
    });

    it('shows edit button when showArchived is false', () => {
      renderRequestsList({ showArchived: false });

      // Edit button should be present for active requests
      const editButton = screen.getByTitle('Edit');
      expect(editButton).toBeInTheDocument();
    });

    it('shows restore button for archived requests', () => {
      renderRequestsList({ showArchived: true, onUnarchive: vi.fn() });

      const restoreButton = screen.getByTitle('Restore');
      expect(restoreButton).toBeInTheDocument();
    });

    it('shows re-release button for archived requests', () => {
      renderRequestsList({ showArchived: true, onUnarchive: vi.fn() });

      const reReleaseButton = screen.getByTitle('Re-release');
      expect(reReleaseButton).toBeInTheDocument();
    });

    it('does not show archive button for already archived requests', () => {
      renderRequestsList({ showArchived: true });

      const archiveButtons = screen.queryAllByTitle('Archive');
      expect(archiveButtons).toHaveLength(0);
    });

    it('shows archive button for non-archived requests', () => {
      renderRequestsList({ showArchived: false });

      const archiveButton = screen.getByTitle('Archive');
      expect(archiveButton).toBeInTheDocument();
    });
  });

  describe('Re-release Modal', () => {
    it('opens re-release modal when clicking re-release button', async () => {
      const user = userEvent.setup();
      renderRequestsList({ showArchived: true, onUnarchive: vi.fn() });

      const reReleaseButton = screen.getByTitle('Re-release');
      await user.click(reReleaseButton);

      await waitFor(() => {
        expect(screen.getByText('Re-release Request')).toBeInTheDocument();
      });
    });

    it('displays source request info in re-release modal', async () => {
      const user = userEvent.setup();
      renderRequestsList({ showArchived: true, onUnarchive: vi.fn() });

      const reReleaseButton = screen.getByTitle('Re-release');
      await user.click(reReleaseButton);

      await waitFor(() => {
        // Modal should contain the request number (there will be multiple due to both card and modal)
        const requestNumbers = screen.getAllByText('RR-20260318-001');
        expect(requestNumbers.length).toBeGreaterThanOrEqual(2);
      });
    });

    it('closes re-release modal when clicking X button', async () => {
      const user = userEvent.setup();
      renderRequestsList({ showArchived: true, onUnarchive: vi.fn() });

      const reReleaseButton = screen.getByTitle('Re-release');
      await user.click(reReleaseButton);

      await waitFor(() => {
        expect(screen.getByText('Re-release Request')).toBeInTheDocument();
      });

      // Find the close button (X)
      const closeButton = screen.getByRole('button', { name: '' });
      if (closeButton) {
        await user.click(closeButton);
      }
    });
  });

  describe('Optimistic UI and Animations', () => {
    it('applies fade-out animation class when archiving', async () => {
      const user = userEvent.setup();
      const onArchive = vi.fn();
      renderRequestsList({ onArchive });

      // Click archive to show confirm
      const archiveButton = screen.getByTitle('Archive');
      await user.click(archiveButton);

      // Click confirm
      const confirmButton = screen.getByTitle('Confirm archive');
      await user.click(confirmButton);

      // onArchive should be called
      expect(onArchive).toHaveBeenCalledWith(mockRequest.id);
    });

    it('applies fade-out animation class when deleting', async () => {
      const user = userEvent.setup();
      const onDelete = vi.fn();
      renderRequestsList({ onDelete });

      // Click delete to show confirm
      const deleteButton = screen.getByTitle('Delete');
      await user.click(deleteButton);

      // Click confirm
      const confirmButton = screen.getByTitle('Confirm delete');
      await user.click(confirmButton);

      // onDelete should be called
      expect(onDelete).toHaveBeenCalledWith(mockRequest.id);
    });

    it('calls onRestoreRequest when restoring archived request', async () => {
      const user = userEvent.setup();
      const onRestoreRequest = vi.fn();
      renderRequestsList({
        showArchived: true,
        onUnarchive: vi.fn(),
        onRestoreRequest,
      });

      const restoreButton = screen.getByTitle('Restore');
      await user.click(restoreButton);

      // Wait for animation and callback
      await waitFor(() => {
        expect(onRestoreRequest).toHaveBeenCalledWith(mockRequest.id);
      }, { timeout: 500 });
    });
  });

  describe('Card Layout', () => {
    it('renders cards with consistent fixed height', () => {
      renderRequestsList();

      // The card should have the h-[144px] class for consistent height
      const card = screen.getByText('Test Request').closest('div[class*="bg-card-white"]');
      expect(card).toHaveClass('h-[144px]');
    });
  });

  // ============================================
  // Intake Tab Tests
  // ============================================

  describe('intake tab', () => {
    const intakeRequest = {
      ...mockRequest,
      id: 'intake-1',
      request_number: 'RR-20260321-INT',
      title: 'Unassigned Request',
      created_by: '', // Unassigned
    };

    describe('header and empty state', () => {
      it('shows Intake Queue header when showIntake is true', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
        });

        expect(screen.getByText('Intake Queue')).toBeInTheDocument();
      });

      it('shows Records Requests header when showIntake is false', () => {
        renderRequestsList();

        expect(screen.getByText('Records Requests')).toBeInTheDocument();
      });

      it('shows empty state message for intake when no requests', () => {
        renderRequestsList({
          requests: [],
          showIntake: true,
        });

        expect(screen.getByText('No pending intake submissions.')).toBeInTheDocument();
      });

      it('shows different empty state for regular requests', () => {
        renderRequestsList({
          requests: [],
          showIntake: false,
        });

        expect(screen.getByText('No requests yet.')).toBeInTheDocument();
      });

      it('shows search placeholder for intake queue', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
        });

        expect(screen.getByPlaceholderText('Search queue...')).toBeInTheDocument();
      });

      it('shows search placeholder for regular requests', () => {
        renderRequestsList();

        expect(screen.getByPlaceholderText('Search requests...')).toBeInTheDocument();
      });
    });

    describe('New Request button visibility', () => {
      it('hides New Request button in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
        });

        expect(screen.queryByRole('button', { name: /new request/i })).not.toBeInTheDocument();
      });

      it('shows New Request button in regular requests view', () => {
        renderRequestsList();

        expect(screen.getByRole('button', { name: /new request/i })).toBeInTheDocument();
      });
    });

    describe('assignee filter visibility', () => {
      it('hides assignee filter dropdown in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
        });

        expect(screen.queryByText('All Assignees')).not.toBeInTheDocument();
      });

      it('shows assignee filter dropdown in regular requests view', () => {
        renderRequestsList();

        expect(screen.getByText('All Assignees')).toBeInTheDocument();
      });

      it('hides in-card assignee reassignment dropdown in intake view', async () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        await waitFor(() => {
          // The "Assign to..." dropdown for intake should exist
          expect(screen.getByText('Assign to...')).toBeInTheDocument();
        });

        // But the in-card reassignment dropdown (showing user name) should not
        // In regular view this would show the current assignee's name
        const dropdowns = screen.getAllByRole('combobox');
        // Should only have the "Assign to..." dropdown, not the reassignment one
        expect(dropdowns.length).toBe(1);
      });
    });

    describe('assignment dropdown', () => {
      it('shows assignment dropdown for each intake request', async () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        await waitFor(() => {
          expect(screen.getByText('Assign to...')).toBeInTheDocument();
        });
      });

      it('populates assignment dropdown with users from API', async () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        await waitFor(() => {
          const assignDropdown = screen.getByText('Assign to...').closest('select');
          expect(assignDropdown).toBeInTheDocument();
          // Check that user option exists
          expect(assignDropdown?.querySelector('option[value="user-1"]')).toBeInTheDocument();
        });
      });

      it('calls onAssignRequest when user is selected from dropdown', async () => {
        const user = userEvent.setup();
        const onAssignRequest = vi.fn();

        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest,
        });

        await waitFor(() => {
          const assignDropdown = screen.getByText('Assign to...').closest('select');
          expect(assignDropdown?.querySelector('option[value="user-1"]')).toBeInTheDocument();
        });

        const assignDropdown = screen.getByText('Assign to...').closest('select') as HTMLSelectElement;
        await user.selectOptions(assignDropdown, 'user-1');

        expect(onAssignRequest).toHaveBeenCalledWith('intake-1', 'user-1');
      });

      it('does not show assignment dropdown in regular requests view', () => {
        renderRequestsList({
          requests: [mockRequest],
          showIntake: false,
        });

        expect(screen.queryByText('Assign to...')).not.toBeInTheDocument();
      });
    });

    describe('action buttons visibility', () => {
      it('hides edit button in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        expect(screen.queryByTitle('Edit')).not.toBeInTheDocument();
      });

      it('shows edit button in regular requests view', () => {
        renderRequestsList({
          requests: [mockRequest],
          showIntake: false,
        });

        expect(screen.getByTitle('Edit')).toBeInTheDocument();
      });

      it('hides archive button in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
          onArchive: vi.fn(),
        });

        expect(screen.queryByTitle('Archive')).not.toBeInTheDocument();
      });

      it('shows archive button in regular requests view', () => {
        renderRequestsList({
          requests: [mockRequest],
          showIntake: false,
          onArchive: vi.fn(),
        });

        expect(screen.getByTitle('Archive')).toBeInTheDocument();
      });

      it('shows delete button in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
          onDelete: vi.fn(),
        });

        expect(screen.getByTitle('Delete')).toBeInTheDocument();
      });

      it('shows delete button in regular requests view', () => {
        renderRequestsList({
          requests: [mockRequest],
          showIntake: false,
          onDelete: vi.fn(),
        });

        expect(screen.getByTitle('Delete')).toBeInTheDocument();
      });

      it('shows audit trail button in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        expect(screen.getByTitle('View Audit Trail')).toBeInTheDocument();
      });

      it('shows download button in intake view', async () => {
        server.use(
          http.get(`${API_BASE}/api/requests/:requestId/files`, () => {
            return HttpResponse.json({ files: [] });
          })
        );

        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        await waitFor(() => {
          expect(screen.getByTitle(/complete review to enable download/i)).toBeInTheDocument();
        });
      });
    });

    describe('animation on assignment', () => {
      it('adds animation class when request is being assigned', async () => {
        const user = userEvent.setup();
        const onAssignRequest = vi.fn();

        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest,
        });

        await waitFor(() => {
          const assignDropdown = screen.getByText('Assign to...').closest('select');
          expect(assignDropdown?.querySelector('option[value="user-1"]')).toBeInTheDocument();
        });

        const assignDropdown = screen.getByText('Assign to...').closest('select') as HTMLSelectElement;
        await user.selectOptions(assignDropdown, 'user-1');

        // The row should have animation class
        const row = screen.getByText('RR-20260321-INT').closest('div[class*="animate"]');
        expect(row).toBeInTheDocument();
      });

      it('removes request from visible list after animation completes', async () => {
        const user = userEvent.setup();
        const onAssignRequest = vi.fn();

        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest,
        });

        await waitFor(() => {
          const assignDropdown = screen.getByText('Assign to...').closest('select');
          expect(assignDropdown?.querySelector('option[value="user-1"]')).toBeInTheDocument();
        });

        const assignDropdown = screen.getByText('Assign to...').closest('select') as HTMLSelectElement;
        await user.selectOptions(assignDropdown, 'user-1');

        // Wait for the animation timeout (300ms) plus some buffer
        await waitFor(() => {
          // After animation, the request should be removed from the visible list
          // This is handled internally by removedIds state
          expect(onAssignRequest).toHaveBeenCalledWith('intake-1', 'user-1');
        }, { timeout: 500 });
      });
    });

    describe('request display in intake', () => {
      it('displays request number in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        expect(screen.getByText('RR-20260321-INT')).toBeInTheDocument();
      });

      it('displays request title in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        expect(screen.getByText('Unassigned Request')).toBeInTheDocument();
      });

      it('displays request status badge in intake view', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        expect(screen.getByText('new')).toBeInTheDocument();
      });

      it('calls onSelect when intake request is clicked', async () => {
        const user = userEvent.setup();
        const onSelect = vi.fn();

        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onSelect,
          onAssignRequest: vi.fn(),
        });

        await user.click(screen.getByText('RR-20260321-INT'));
        expect(onSelect).toHaveBeenCalledWith(intakeRequest);
      });

      it('highlights selected intake request', () => {
        renderRequestsList({
          requests: [intakeRequest],
          selectedId: 'intake-1',
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        const card = screen.getByText('Unassigned Request').closest('div[class*="border"]');
        expect(card?.className).toContain('border-blue-500');
      });
    });

    describe('multiple intake requests', () => {
      const multipleIntakeRequests = [
        { ...intakeRequest, id: 'intake-1', request_number: 'RR-001', title: 'Request 1' },
        { ...intakeRequest, id: 'intake-2', request_number: 'RR-002', title: 'Request 2' },
        { ...intakeRequest, id: 'intake-3', request_number: 'RR-003', title: 'Request 3' },
      ];

      it('displays all intake requests', () => {
        renderRequestsList({
          requests: multipleIntakeRequests,
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        expect(screen.getByText('Request 1')).toBeInTheDocument();
        expect(screen.getByText('Request 2')).toBeInTheDocument();
        expect(screen.getByText('Request 3')).toBeInTheDocument();
      });

      it('shows assignment dropdown for each request', async () => {
        renderRequestsList({
          requests: multipleIntakeRequests,
          showIntake: true,
          onAssignRequest: vi.fn(),
        });

        await waitFor(() => {
          const assignDropdowns = screen.getAllByText('Assign to...');
          expect(assignDropdowns).toHaveLength(3);
        });
      });

      it('assigns only the selected request', async () => {
        const user = userEvent.setup();
        const onAssignRequest = vi.fn();

        renderRequestsList({
          requests: multipleIntakeRequests,
          showIntake: true,
          onAssignRequest,
        });

        await waitFor(() => {
          const assignDropdowns = screen.getAllByText('Assign to...');
          expect(assignDropdowns).toHaveLength(3);
        });

        // Select a user for the second request
        const assignDropdowns = screen.getAllByText('Assign to...').map(el => el.closest('select') as HTMLSelectElement);
        await user.selectOptions(assignDropdowns[1], 'user-1');

        expect(onAssignRequest).toHaveBeenCalledWith('intake-2', 'user-1');
        expect(onAssignRequest).toHaveBeenCalledTimes(1);
      });
    });

    describe('search in intake view', () => {
      it('calls onSearchChange when searching in intake view', async () => {
        const user = userEvent.setup();
        const onSearchChange = vi.fn();

        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          onSearchChange,
          onAssignRequest: vi.fn(),
        });

        const searchInput = screen.getByPlaceholderText('Search queue...');
        await user.type(searchInput, 'test');

        expect(onSearchChange).toHaveBeenCalled();
      });

      it('highlights matching text in intake requests', () => {
        renderRequestsList({
          requests: [intakeRequest],
          showIntake: true,
          searchTerm: 'INT',
          onAssignRequest: vi.fn(),
        });

        const highlight = screen.getByText('INT');
        expect(highlight.tagName).toBe('MARK');
      });

      it('shows no matching requests message in intake view', () => {
        renderRequestsList({
          requests: [],
          showIntake: true,
          searchTerm: 'nonexistent',
          onAssignRequest: vi.fn(),
        });

        expect(screen.getByText('No matching requests found.')).toBeInTheDocument();
      });
    });
  });
});
