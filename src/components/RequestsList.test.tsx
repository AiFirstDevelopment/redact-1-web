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
});
