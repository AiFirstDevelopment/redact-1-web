import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { RequestDetailPanel } from './RequestDetailPanel';

// Mock the stores and API
vi.mock('../stores/requestStore', () => ({
  useRequestStore: () => ({
    files: mockFiles,
    fetchFiles: vi.fn(),
    uploadFile: vi.fn(),
    deleteFile: vi.fn(),
  }),
}));

vi.mock('../services/api', () => ({
  api: {
    getToken: vi.fn().mockResolvedValue('mock-token'),
    listUsers: vi.fn().mockResolvedValue({ users: [] }),
    getRequestAuditLogs: vi.fn().mockResolvedValue({ audit_logs: [] }),
    getRequestTimeline: vi.fn().mockResolvedValue({ timeline: [] }),
    renameFile: vi.fn().mockResolvedValue({ file: { id: 'file-1', filename: 'renamed.mp4' } }),
  },
}));

import { api } from '../services/api';

const mockRequest = {
  id: 'req-1',
  request_number: 'RR-20260321-001',
  title: 'Test Request',
  status: 'new',
  requester_name: 'John Doe',
  requester_email: 'john@example.com',
  due_date: Date.now() / 1000 + 86400 * 14,
  received_date: Date.now() / 1000,
  created_at: Date.now() / 1000,
  updated_at: Date.now() / 1000,
  created_by: 'user-1',
  assigned_to: null,
};

let mockFiles = [
  {
    id: 'file-1',
    request_id: 'req-1',
    filename: 'test-video.mp4',
    file_type: 'video',
    mime_type: 'video/mp4',
    file_size: 8294400,
    status: 'detected',
    detection_count: 5,
    pending_count: 2,
    duration_seconds: 6.75,
    created_at: Date.now() / 1000,
    updated_at: Date.now() / 1000,
  },
  {
    id: 'file-2',
    request_id: 'req-1',
    filename: 'document.pdf',
    file_type: 'pdf',
    mime_type: 'application/pdf',
    file_size: 1024000,
    status: 'uploaded',
    detection_count: 0,
    pending_count: 0,
    duration_seconds: null,
    created_at: Date.now() / 1000,
    updated_at: Date.now() / 1000,
  },
];

const mockOnClose = vi.fn();
const mockOnRequestUpdated = vi.fn();

function renderPanel() {
  return render(
    <MemoryRouter>
      <RequestDetailPanel
        request={mockRequest as any}
        onClose={mockOnClose}
        onRequestUpdated={mockOnRequestUpdated}
      />
    </MemoryRouter>
  );
}

describe('RequestDetailPanel', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('File List Display', () => {
    it('should display video duration instead of file size for video files', async () => {
      renderPanel();

      await waitFor(() => {
        // Video file should show duration (0:06)
        expect(screen.getByText('0:06')).toBeInTheDocument();
      });
    });

    it('should display file size for non-video files', async () => {
      renderPanel();

      await waitFor(() => {
        // PDF file should show file size
        expect(screen.getByText(/KB|MB/)).toBeInTheDocument();
      });
    });

    it('should show pencil icon to open file', async () => {
      renderPanel();

      await waitFor(() => {
        const editButtons = screen.getAllByTitle('Edit file');
        expect(editButtons.length).toBeGreaterThan(0);
      });
    });

    it('should show trash icon for delete', async () => {
      renderPanel();

      await waitFor(() => {
        const deleteButtons = screen.getAllByTitle('Delete file');
        expect(deleteButtons.length).toBeGreaterThan(0);
      });
    });
  });

  describe('Inline Filename Editing', () => {
    it('should show filename as clickable text', async () => {
      renderPanel();

      await waitFor(() => {
        const filename = screen.getByText('test-video.mp4');
        expect(filename).toBeInTheDocument();
        expect(filename.title).toBe('Click to rename');
      });
    });

    it('should show input field when filename is clicked', async () => {
      renderPanel();

      await waitFor(() => {
        const filename = screen.getByText('test-video.mp4');
        fireEvent.click(filename);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('test-video.mp4');
        expect(input).toBeInTheDocument();
        expect(input.tagName).toBe('INPUT');
      });
    });

    it('should show save and cancel buttons when editing', async () => {
      renderPanel();

      await waitFor(() => {
        const filename = screen.getByText('test-video.mp4');
        fireEvent.click(filename);
      });

      await waitFor(() => {
        expect(screen.getByTitle('Save')).toBeInTheDocument();
        expect(screen.getByTitle('Cancel')).toBeInTheDocument();
      });
    });

    it('should call renameFile API when save is clicked', async () => {
      renderPanel();

      await waitFor(() => {
        const filename = screen.getByText('test-video.mp4');
        fireEvent.click(filename);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('test-video.mp4');
        fireEvent.change(input, { target: { value: 'renamed.mp4' } });
      });

      const saveButton = screen.getByTitle('Save');
      fireEvent.click(saveButton);

      await waitFor(() => {
        expect(api.renameFile).toHaveBeenCalledWith('file-1', 'renamed.mp4');
      });
    });

    it('should cancel editing when cancel is clicked', async () => {
      renderPanel();

      await waitFor(() => {
        const filename = screen.getByText('test-video.mp4');
        fireEvent.click(filename);
      });

      await waitFor(() => {
        expect(screen.getByDisplayValue('test-video.mp4')).toBeInTheDocument();
      });

      const cancelButton = screen.getByTitle('Cancel');
      fireEvent.click(cancelButton);

      await waitFor(() => {
        expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
        expect(screen.queryByTitle('Save')).not.toBeInTheDocument();
      });
    });

    it('should cancel editing when Escape is pressed', async () => {
      renderPanel();

      await waitFor(() => {
        const filename = screen.getByText('test-video.mp4');
        fireEvent.click(filename);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('test-video.mp4');
        fireEvent.keyDown(input, { key: 'Escape' });
      });

      await waitFor(() => {
        expect(screen.getByText('test-video.mp4')).toBeInTheDocument();
        expect(screen.queryByTitle('Save')).not.toBeInTheDocument();
      });
    });

    it('should save when Enter is pressed', async () => {
      renderPanel();

      await waitFor(() => {
        const filename = screen.getByText('test-video.mp4');
        fireEvent.click(filename);
      });

      await waitFor(() => {
        const input = screen.getByDisplayValue('test-video.mp4');
        fireEvent.change(input, { target: { value: 'new-name.mp4' } });
        fireEvent.keyDown(input, { key: 'Enter' });
      });

      await waitFor(() => {
        expect(api.renameFile).toHaveBeenCalledWith('file-1', 'new-name.mp4');
      });
    });
  });

  describe('Two-Click Delete Pattern', () => {
    it('should show confirm UI when delete is clicked', async () => {
      renderPanel();

      await waitFor(() => {
        const deleteButton = screen.getAllByTitle('Delete file')[0];
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        expect(screen.getByTitle('Confirm delete')).toBeInTheDocument();
        expect(screen.getByTitle('Cancel')).toBeInTheDocument();
      });
    });

    it('should cancel delete when cancel is clicked', async () => {
      renderPanel();

      await waitFor(() => {
        const deleteButton = screen.getAllByTitle('Delete file')[0];
        fireEvent.click(deleteButton);
      });

      await waitFor(() => {
        const cancelButton = screen.getByTitle('Cancel');
        fireEvent.click(cancelButton);
      });

      await waitFor(() => {
        expect(screen.queryByTitle('Confirm delete')).not.toBeInTheDocument();
        expect(screen.getAllByTitle('Delete file').length).toBeGreaterThan(0);
      });
    });
  });

  describe('Status Badges', () => {
    it('should show Draft badge when detections have pending items', async () => {
      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Draft')).toBeInTheDocument();
      });
    });

    it('should show New badge for files without detections', async () => {
      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('New')).toBeInTheDocument();
      });
    });
  });
});
