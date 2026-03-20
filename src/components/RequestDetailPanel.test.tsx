import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { RequestDetailPanel } from './RequestDetailPanel';
import { useAuthStore } from '../stores/authStore';
import { mockRequest, mockUser, mockAgency } from '../test/handlers';

const renderPanel = (props = {}) => {
  const defaultProps = {
    request: mockRequest,
    onClose: vi.fn(),
    ...props,
  };

  return render(
    <BrowserRouter>
      <RequestDetailPanel {...defaultProps} />
    </BrowserRouter>
  );
};

describe('RequestDetailPanel', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem('agency', JSON.stringify(mockAgency));

    useAuthStore.setState({
      user: mockUser,
      agency: mockAgency,
      isAuthenticated: true,
      isEnrolled: true,
      isLoading: false,
      error: null,
    });
  });

  it('renders the panel header with request number', () => {
    renderPanel();
    expect(screen.getByText('RR-20260318-001')).toBeInTheDocument();
  });

  it('displays request title', () => {
    renderPanel();
    expect(screen.getByText('Test Request')).toBeInTheDocument();
  });

  it('displays request status', () => {
    renderPanel();
    expect(screen.getByText('new')).toBeInTheDocument();
  });

  it('displays request date', () => {
    renderPanel();
    expect(screen.getByText(/request date/i)).toBeInTheDocument();
  });

  it('renders Files section', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Files')).toBeInTheDocument();
    });
  });

  it('displays files from API', async () => {
    renderPanel();

    // Files are fetched via MSW
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
  });

  it('shows file size', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/1.*KB/i)).toBeInTheDocument();
    });
  });

  it('displays notes if present', () => {
    const requestWithNotes = { ...mockRequest, notes: 'Some important notes' };
    renderPanel({ request: requestWithNotes });
    expect(screen.getByText('Some important notes')).toBeInTheDocument();
  });

  // ============================================
  // Inline Title Editing Tests
  // ============================================

  describe('inline title editing', () => {
    it('shows edit controls when title is clicked', async () => {
      const user = userEvent.setup();
      renderPanel();

      const titleElement = screen.getByText('Test Request');
      await user.click(titleElement);

      expect(screen.getByPlaceholderText(/add title/i)).toBeInTheDocument();
      expect(screen.getByTitle(/save/i)).toBeInTheDocument();
      expect(screen.getByTitle(/cancel/i)).toBeInTheDocument();
    });

    it('shows "Add title..." placeholder for request without title', () => {
      const requestWithoutTitle = { ...mockRequest, title: '' };
      renderPanel({ request: requestWithoutTitle });

      expect(screen.getByText(/add title/i)).toBeInTheDocument();
    });

    it('cancels editing when cancel button is clicked', async () => {
      const user = userEvent.setup();
      renderPanel();

      const titleElement = screen.getByText('Test Request');
      await user.click(titleElement);

      const cancelBtn = screen.getByTitle(/cancel/i);
      await user.click(cancelBtn);

      expect(screen.queryByPlaceholderText(/add title/i)).not.toBeInTheDocument();
      expect(screen.getByText('Test Request')).toBeInTheDocument();
    });
  });

  // ============================================
  // File Status Badge Tests
  // ============================================

  describe('file status badges', () => {
    it('shows Draft badge when file has pending detections', async () => {
      const { server } = await import('../test/setup');
      const { http, HttpResponse } = await import('msw');

      server.use(
        http.get('https://redact-1-worker.joelstevick.workers.dev/api/requests/:requestId/files', () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              file_type: 'pdf',
              mime_type: 'application/pdf',
              file_size: 1024,
              status: 'detected',
              detection_count: 5,
              pending_count: 2,
            }],
          });
        })
      );

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Draft')).toBeInTheDocument();
      });
    });

    it('shows Completed badge when all detections reviewed', async () => {
      const { server } = await import('../test/setup');
      const { http, HttpResponse } = await import('msw');

      server.use(
        http.get('https://redact-1-worker.joelstevick.workers.dev/api/requests/:requestId/files', () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              file_type: 'pdf',
              mime_type: 'application/pdf',
              file_size: 1024,
              status: 'detected',
              detection_count: 5,
              pending_count: 0,
            }],
          });
        })
      );

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument();
      });
    });

    it('shows Completed badge for reviewed file with no detections', async () => {
      const { server } = await import('../test/setup');
      const { http, HttpResponse } = await import('msw');

      server.use(
        http.get('https://redact-1-worker.joelstevick.workers.dev/api/requests/:requestId/files', () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              file_type: 'pdf',
              mime_type: 'application/pdf',
              file_size: 1024,
              status: 'reviewed',
              detection_count: 0,
              pending_count: 0,
            }],
          });
        })
      );

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('Completed')).toBeInTheDocument();
      });
    });

    it('shows no badge for file without detections and not reviewed', async () => {
      const { server } = await import('../test/setup');
      const { http, HttpResponse } = await import('msw');

      server.use(
        http.get('https://redact-1-worker.joelstevick.workers.dev/api/requests/:requestId/files', () => {
          return HttpResponse.json({
            files: [{
              id: 'file-1',
              request_id: 'req-1',
              filename: 'test.pdf',
              file_type: 'pdf',
              mime_type: 'application/pdf',
              file_size: 1024,
              status: 'uploaded',
              detection_count: 0,
              pending_count: 0,
            }],
          });
        })
      );

      renderPanel();

      await waitFor(() => {
        expect(screen.getByText('test.pdf')).toBeInTheDocument();
      });

      expect(screen.queryByText('Draft')).not.toBeInTheDocument();
      expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    });
  });
});
