import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { VideoReviewPage } from './VideoReviewPage';

// Mock canvas context
HTMLCanvasElement.prototype.getContext = vi.fn().mockReturnValue({
  clearRect: vi.fn(),
  strokeRect: vi.fn(),
  fillRect: vi.fn(),
  fillText: vi.fn(),
  measureText: vi.fn().mockReturnValue({ width: 50 }),
});

// Mock the API
vi.mock('../services/api', () => ({
  api: {
    getToken: vi.fn().mockResolvedValue('mock-token'),
    getVideoStreamUrl: vi.fn(),
    getRedactedVideoStreamUrl: vi.fn(),
    listVideoDetections: vi.fn(),
    updateVideoDetection: vi.fn(),
    bulkUpdateVideoDetections: vi.fn(),
    startVideoDetection: vi.fn(),
    startVideoRedaction: vi.fn(),
    getVideoJobStatus: vi.fn(),
  },
}));

import { api } from '../services/api';

// Mock fetch for file info
const mockFetch = vi.fn();
global.fetch = mockFetch;

const mockFile = {
  id: 'file-1',
  filename: 'test-video.mp4',
  file_type: 'video',
  status: 'detected',
};

const mockDetections = [
  {
    id: 'det-1',
    file_id: 'file-1',
    detection_type: 'face',
    start_time_ms: 0,
    end_time_ms: 2000,
    bbox_x: 0.1,
    bbox_y: 0.1,
    bbox_width: 0.2,
    bbox_height: 0.2,
    track_id: 'face-001',
    status: 'pending',
    comment: null,
  },
  {
    id: 'det-2',
    file_id: 'file-1',
    detection_type: 'face',
    start_time_ms: 2000,
    end_time_ms: 4000,
    bbox_x: 0.3,
    bbox_y: 0.3,
    bbox_width: 0.2,
    bbox_height: 0.2,
    track_id: 'face-001',
    status: 'approved',
    comment: 'Officer face',
  },
];

const mockTracks = [{ track_id: 'face-001', count: 2 }];

const mockJob = {
  id: 'job-1',
  file_id: 'file-1',
  job_type: 'detection',
  status: 'completed',
  progress: 100,
};

function renderWithRouter(fileId = 'file-1') {
  return render(
    <MemoryRouter initialEntries={[`/video/${fileId}`]}>
      <Routes>
        <Route path="/video/:fileId" element={<VideoReviewPage />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('VideoReviewPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Setup default mocks
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ file: mockFile }),
    });

    (api.getVideoStreamUrl as any).mockResolvedValue({ url: 'https://example.com/video.mp4' });
    (api.getRedactedVideoStreamUrl as any).mockRejectedValue(new Error('Not found'));
    (api.listVideoDetections as any).mockResolvedValue({
      detections: mockDetections,
      tracks: mockTracks,
    });
    (api.getVideoJobStatus as any).mockResolvedValue({ job: mockJob });
  });

  describe('Tab Behavior', () => {
    it('should not show Timeline tab', async () => {
      renderWithRouter();

      // Wait for content to load by checking for something that should be there
      await waitFor(() => {
        expect(screen.getByText('All Detections')).toBeInTheDocument();
      });

      expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
    });

    it('should not show Detections header with count', async () => {
      renderWithRouter();

      // Wait for content to load
      await waitFor(() => {
        expect(screen.getByText('All Detections')).toBeInTheDocument();
      });

      // Should not have a standalone "Detections (2)" header
      expect(screen.queryByText(/^Detections \(\d+\)$/)).not.toBeInTheDocument();
    });
  });

  describe('Original/Redacted Tabs', () => {
    it('should not show video tabs when no redacted video exists', async () => {
      renderWithRouter();

      // Wait for content to load
      await waitFor(() => {
        expect(screen.getByText('All Detections')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Original' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Redacted' })).not.toBeInTheDocument();
    });
  });

  describe('Detection Notes', () => {
    it('should display existing comment on detection', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('"Officer face"')).toBeInTheDocument();
      });
    });

    it('should show note input when Approve is clicked on pending detection', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('All Detections')).toBeInTheDocument();
      });

      // Find and click the Approve button on the pending detection
      const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
      const enabledApproveButton = approveButtons.find(btn => !btn.hasAttribute('disabled'));
      expect(enabledApproveButton).toBeDefined();
      fireEvent.click(enabledApproveButton!);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Add note (optional)')).toBeInTheDocument();
      });

      expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
    });

    it('should cancel note input when Cancel is clicked', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('All Detections')).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
      const enabledApproveButton = approveButtons.find(btn => !btn.hasAttribute('disabled'));
      fireEvent.click(enabledApproveButton!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Cancel' })).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByPlaceholderText('Add note (optional)')).not.toBeInTheDocument();
      });
    });

    it('should call API with note when Confirm is clicked', async () => {
      (api.updateVideoDetection as any).mockResolvedValue({
        detection: { ...mockDetections[0], status: 'approved', comment: 'Test note' },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('All Detections')).toBeInTheDocument();
      });

      // Click Approve on pending detection
      const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
      const enabledApproveButton = approveButtons.find(btn => !btn.hasAttribute('disabled'));
      fireEvent.click(enabledApproveButton!);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Add note (optional)')).toBeInTheDocument();
      });

      // Type a note
      const noteInput = screen.getByPlaceholderText('Add note (optional)');
      fireEvent.change(noteInput, { target: { value: 'Test note' } });

      // Click Confirm
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(api.updateVideoDetection).toHaveBeenCalledWith('det-1', {
          status: 'approved',
          comment: 'Test note',
        });
      });
    });

    it('should call API without note when Confirm is clicked with empty note', async () => {
      (api.updateVideoDetection as any).mockResolvedValue({
        detection: { ...mockDetections[0], status: 'approved' },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('All Detections')).toBeInTheDocument();
      });

      const approveButtons = screen.getAllByRole('button', { name: 'Approve' });
      const enabledApproveButton = approveButtons.find(btn => !btn.hasAttribute('disabled'));
      fireEvent.click(enabledApproveButton!);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Confirm' })).toBeInTheDocument();
      });

      // Click Confirm without entering a note
      fireEvent.click(screen.getByRole('button', { name: 'Confirm' }));

      await waitFor(() => {
        expect(api.updateVideoDetection).toHaveBeenCalledWith('det-1', {
          status: 'approved',
          comment: undefined,
        });
      });
    });
  });

  describe('Detection List', () => {
    it('should show status summary counts', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument();
      });

      expect(screen.getByText('Approved')).toBeInTheDocument();
      expect(screen.getByText('Rejected')).toBeInTheDocument();
    });

    it('should show tracks section', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      expect(screen.getByText('2 segments')).toBeInTheDocument();
    });

    it('should show All Detections heading', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('All Detections')).toBeInTheDocument();
      });
    });
  });

  describe('Job Status', () => {
    it('should show job status when job exists', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Job Status')).toBeInTheDocument();
      });

      expect(screen.getByText('detection')).toBeInTheDocument();
      expect(screen.getByText('completed')).toBeInTheDocument();
    });

    it('should not show job status section when no job', async () => {
      (api.getVideoJobStatus as any).mockResolvedValue({ job: null });

      renderWithRouter();

      // Wait for the page to load by checking for the tracks section
      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      expect(screen.queryByText('Job Status')).not.toBeInTheDocument();
    });
  });
});
