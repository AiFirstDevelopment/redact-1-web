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
    cancelVideoJob: vi.fn(),
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
    comment: null,
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

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      expect(screen.queryByText('Timeline')).not.toBeInTheDocument();
    });

    it('should not show Detections header with count', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Should not have a standalone "Detections (2)" header
      expect(screen.queryByText(/^Detections \(\d+\)$/)).not.toBeInTheDocument();
    });
  });

  describe('Original/Redacted Tabs', () => {
    it('should not show video tabs when no redacted video exists', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: 'Original' })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: 'Redacted' })).not.toBeInTheDocument();
    });

    it('should not call getRedactedVideoStreamUrl when file has no redacted key', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // When redacted_s3_key is not set, getRedactedVideoStreamUrl should not be called
      // or it should fail (which is the default mock behavior)
      expect(api.getRedactedVideoStreamUrl).not.toHaveBeenCalled();
    });
  });

  describe('Bulk Actions', () => {
    it('should show bulk action buttons when pending detections exist', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });

      expect(screen.getByText('Reject All Pending')).toBeInTheDocument();
    });

    it('should show exemption code selector', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('(b)(7)(C) LE Privacy')).toBeInTheDocument();
      });
    });

    it('should show comment input for bulk actions', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Comment (optional)')).toBeInTheDocument();
      });
    });

    it('should call bulk update API when Approve All is clicked', async () => {
      (api.bulkUpdateVideoDetections as any).mockResolvedValue({});

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Approve All Pending'));

      await waitFor(() => {
        expect(api.bulkUpdateVideoDetections).toHaveBeenCalledWith('file-1', {
          track_id: undefined,
          status: 'approved',
          exemption_code: 'b7c',
          comment: undefined,
        });
      });
    });

    it('should include comment when provided', async () => {
      (api.bulkUpdateVideoDetections as any).mockResolvedValue({});

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Comment (optional)')).toBeInTheDocument();
      });

      const commentInput = screen.getByPlaceholderText('Comment (optional)');
      fireEvent.change(commentInput, { target: { value: 'Test comment' } });

      fireEvent.click(screen.getByText('Approve All Pending'));

      await waitFor(() => {
        expect(api.bulkUpdateVideoDetections).toHaveBeenCalledWith('file-1', {
          track_id: undefined,
          status: 'approved',
          exemption_code: 'b7c',
          comment: 'Test comment',
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

    it('should show track selection button', async () => {
      renderWithRouter();

      await waitFor(() => {
        // Track appears in both timeline and sidebar - look for the button in sidebar
        const trackButtons = screen.getAllByText('face-001');
        expect(trackButtons.length).toBeGreaterThan(0);
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

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      expect(screen.queryByText('Job Status')).not.toBeInTheDocument();
    });

    it('should show processing status with progress', async () => {
      (api.getVideoJobStatus as any).mockResolvedValue({
        job: { ...mockJob, status: 'processing', progress: 50 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('processing')).toBeInTheDocument();
      });
    });
  });

  describe('Track Selection', () => {
    it('should update button text when track is selected', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });

      // Click on the track button in sidebar (it's a button element)
      const trackButtons = screen.getAllByText('face-001');
      const sidebarButton = trackButtons.find(el => el.closest('button'));
      expect(sidebarButton).toBeDefined();
      fireEvent.click(sidebarButton!.closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('Approve Track face-001')).toBeInTheDocument();
      });
    });

    it('should pass track_id to bulk update when track is selected', async () => {
      (api.bulkUpdateVideoDetections as any).mockResolvedValue({});

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Click on the track button in sidebar
      const trackButtons = screen.getAllByText('face-001');
      const sidebarButton = trackButtons.find(el => el.closest('button'));
      fireEvent.click(sidebarButton!.closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('Approve Track face-001')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Approve Track face-001'));

      await waitFor(() => {
        expect(api.bulkUpdateVideoDetections).toHaveBeenCalledWith('file-1', {
          track_id: 'face-001',
          status: 'approved',
          exemption_code: 'b7c',
          comment: undefined,
        });
      });
    });
  });

  describe('Video Controls', () => {
    it('should load video stream URL', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(api.getVideoStreamUrl).toHaveBeenCalledWith('file-1');
      });
    });

    it('should show back button', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('← Back')).toBeInTheDocument();
      });
    });
  });
});
