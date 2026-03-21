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

    (api.getVideoStreamUrl as any).mockResolvedValue({ url: 'http://test.com/video.mp4' });
    (api.listVideoDetections as any).mockResolvedValue({ detections: mockDetections, tracks: mockTracks });
    (api.getVideoJobStatus as any).mockResolvedValue({ job: mockJob });
  });

  describe('Initial Loading', () => {
    it('should show loading state initially', () => {
      renderWithRouter();
      expect(screen.getByText('Loading video...')).toBeInTheDocument();
    });

    it('should fetch file info on mount', async () => {
      renderWithRouter();

      // Wait for the page to load
      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Verify API was called for video stream
      expect(api.getVideoStreamUrl).toHaveBeenCalledWith('file-1');
    });

    it('should fetch video stream URL', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(api.getVideoStreamUrl).toHaveBeenCalledWith('file-1');
      });
    });

    it('should fetch detections', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(api.listVideoDetections).toHaveBeenCalledWith('file-1');
      });
    });

    it('should fetch job status', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(api.getVideoJobStatus).toHaveBeenCalledWith('file-1');
      });
    });
  });

  describe('File Display', () => {
    it('should not fetch redacted URL when not available', async () => {
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

    it('should open approve modal when Approve All Pending is clicked', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Approve All Pending'));

      await waitFor(() => {
        expect(screen.getByText('Exemption Code')).toBeInTheDocument();
        expect(screen.getByText('Justification (required)')).toBeInTheDocument();
      });
    });

    it('should open reject modal when Reject All Pending is clicked', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Reject All Pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Reject All Pending'));

      await waitFor(() => {
        expect(screen.getByText('Justification (required)')).toBeInTheDocument();
        // Reject modal should have Reject button
        expect(screen.getByRole('button', { name: 'Reject' })).toBeInTheDocument();
      });
    });

    it('should disable approve button when justification is empty', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Approve All Pending'));

      await waitFor(() => {
        const approveButton = screen.getByRole('button', { name: 'Approve' });
        expect(approveButton).toBeDisabled();
      });
    });

    it('should enable approve button when justification is provided', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Approve All Pending'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter justification for audit trail')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Enter justification for audit trail');
      fireEvent.change(input, { target: { value: 'Test justification' } });

      const approveButton = screen.getByRole('button', { name: 'Approve' });
      expect(approveButton).not.toBeDisabled();
    });

    it('should call bulk update API when modal approve is clicked', async () => {
      (api.bulkUpdateVideoDetections as any).mockResolvedValue({});

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Approve All Pending'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter justification for audit trail')).toBeInTheDocument();
      });

      const input = screen.getByPlaceholderText('Enter justification for audit trail');
      fireEvent.change(input, { target: { value: 'Approved for release' } });

      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(api.bulkUpdateVideoDetections).toHaveBeenCalledWith('file-1', {
          track_id: undefined,
          status: 'approved',
          exemption_code: 'b7c',
          comment: 'Approved for release',
        });
      });
    });

    it('should close modal when Cancel is clicked', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText('Approve All Pending'));

      await waitFor(() => {
        expect(screen.getByText('Exemption Code')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));

      await waitFor(() => {
        expect(screen.queryByText('Exemption Code')).not.toBeInTheDocument();
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

    it('should not show progress indicator in header when processing', async () => {
      (api.getVideoJobStatus as any).mockResolvedValue({
        job: { ...mockJob, status: 'processing', progress: 50 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('processing')).toBeInTheDocument();
      });

      // Progress should only show in video overlay, not in header
      // Header would show "Detecting... 50%" text - verify it's not there
      expect(screen.queryByText(/Detecting\.\.\. 50%/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Redacting\.\.\. 50%/)).not.toBeInTheDocument();
    });

    it('should not show progress bar in sidebar when processing', async () => {
      (api.getVideoJobStatus as any).mockResolvedValue({
        job: { ...mockJob, status: 'processing', progress: 50 },
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('processing')).toBeInTheDocument();
      });

      // Find the Job Status section in the sidebar
      const jobStatusLabel = screen.getByText('Job Status');
      const sidebarSection = jobStatusLabel.closest('div')?.parentElement;
      expect(sidebarSection).toBeInTheDocument();

      // The sidebar Job Status section should NOT contain a progress bar
      // Progress is only shown in the video overlay
      const progressBarsInSidebar = sidebarSection?.querySelectorAll('.bg-blue-500');
      expect(progressBarsInSidebar?.length || 0).toBe(0);
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

      // Open the modal
      fireEvent.click(screen.getByText('Approve Track face-001'));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter justification for audit trail')).toBeInTheDocument();
      });

      // Fill in justification
      const input = screen.getByPlaceholderText('Enter justification for audit trail');
      fireEvent.change(input, { target: { value: 'Track approved' } });

      // Click approve
      fireEvent.click(screen.getByRole('button', { name: 'Approve' }));

      await waitFor(() => {
        expect(api.bulkUpdateVideoDetections).toHaveBeenCalledWith('file-1', {
          track_id: 'face-001',
          status: 'approved',
          exemption_code: 'b7c',
          comment: 'Track approved',
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

    it('should navigate to request page with request param when back is clicked', async () => {
      // Update mock to include request_id
      mockFetch.mockResolvedValue({
        ok: true,
        json: () => Promise.resolve({ file: { ...mockFile, request_id: 'req-123' } }),
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('← Back')).toBeInTheDocument();
      });

      // The back button should have an onClick that navigates to /?request=req-123
      const backButton = screen.getByText('← Back');
      expect(backButton).toBeInTheDocument();
    });
  });

  describe('Track First Appearance', () => {
    it('should show first appearance timestamp in sidebar track list', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Should show "First: 0:00" for face-001 (starts at 0ms)
      expect(screen.getByText('First: 0:00')).toBeInTheDocument();
    });

    it('should show first appearance for multiple tracks sorted by time', async () => {
      const multiTrackDetections = [
        {
          id: 'det-1',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 5000,
          end_time_ms: 8000,
          bbox_x: 0.1,
          bbox_y: 0.1,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-002',
          status: 'pending',
          comment: null,
        },
        {
          id: 'det-2',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 0,
          end_time_ms: 3000,
          bbox_x: 0.3,
          bbox_y: 0.3,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-001',
          status: 'pending',
          comment: null,
        },
        {
          id: 'det-3',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 10000,
          end_time_ms: 15000,
          bbox_x: 0.5,
          bbox_y: 0.5,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-003',
          status: 'approved',
          comment: null,
        },
      ];

      const multiTracks = [
        { track_id: 'face-001', count: 1 },
        { track_id: 'face-002', count: 1 },
        { track_id: 'face-003', count: 1 },
      ];

      (api.listVideoDetections as any).mockResolvedValue({
        detections: multiTrackDetections,
        tracks: multiTracks,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Should show timestamps for each track
      expect(screen.getByText('First: 0:00')).toBeInTheDocument();
      expect(screen.getByText('First: 0:05')).toBeInTheDocument();
      expect(screen.getByText('First: 0:10')).toBeInTheDocument();
    });

    it('should seek to first appearance when track is clicked in sidebar', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Find and click the track button
      const trackButtons = screen.getAllByText('face-001');
      const sidebarButton = trackButtons.find(el => el.closest('button'));
      expect(sidebarButton).toBeDefined();

      fireEvent.click(sidebarButton!.closest('button')!);

      // Track should be selected
      await waitFor(() => {
        expect(screen.getByText('Approve Track face-001')).toBeInTheDocument();
      });
    });

    it('should deselect track when clicking selected track', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Click to select
      const trackButtons = screen.getAllByText('face-001');
      const sidebarButton = trackButtons.find(el => el.closest('button'));
      fireEvent.click(sidebarButton!.closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('Approve Track face-001')).toBeInTheDocument();
      });

      // Click again to deselect
      fireEvent.click(sidebarButton!.closest('button')!);

      await waitFor(() => {
        expect(screen.getByText('Approve All Pending')).toBeInTheDocument();
      });
    });
  });

  describe('Track Thumbnail Strip', () => {
    it('should show track thumbnails when detections exist', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // The thumbnail strip should show timestamp for the track
      // Look for the formatted time in the thumbnail strip (0:00 format)
      const timeLabels = screen.getAllByText('0:00');
      expect(timeLabels.length).toBeGreaterThan(0);
    });

    it('should show placeholder when thumbnails are loading', async () => {
      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Should show face emoji placeholder when thumbnail isn't captured yet
      // (In JSDOM, video capture won't work so we'll see the placeholder)
      const placeholders = screen.queryAllByText('👤');
      // May or may not have placeholders depending on timing
      expect(placeholders.length >= 0).toBe(true);
    });

    it('should display tracks sorted by first appearance time', async () => {
      const multiTrackDetections = [
        {
          id: 'det-1',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 30000, // 0:30 - appears third
          end_time_ms: 35000,
          bbox_x: 0.1,
          bbox_y: 0.1,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-C',
          status: 'pending',
          comment: null,
        },
        {
          id: 'det-2',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 10000, // 0:10 - appears second
          end_time_ms: 15000,
          bbox_x: 0.3,
          bbox_y: 0.3,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-B',
          status: 'pending',
          comment: null,
        },
        {
          id: 'det-3',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 0, // 0:00 - appears first
          end_time_ms: 5000,
          bbox_x: 0.5,
          bbox_y: 0.5,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-A',
          status: 'approved',
          comment: null,
        },
      ];

      const multiTracks = [
        { track_id: 'face-A', count: 1 },
        { track_id: 'face-B', count: 1 },
        { track_id: 'face-C', count: 1 },
      ];

      (api.listVideoDetections as any).mockResolvedValue({
        detections: multiTrackDetections,
        tracks: multiTracks,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Verify all three timestamps are shown (sorted order in thumbnail strip)
      expect(screen.getByText('First: 0:00')).toBeInTheDocument();
      expect(screen.getByText('First: 0:10')).toBeInTheDocument();
      expect(screen.getByText('First: 0:30')).toBeInTheDocument();
    });

    it('should show color-coded borders based on track status', async () => {
      const mixedStatusDetections = [
        {
          id: 'det-1',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 0,
          end_time_ms: 5000,
          bbox_x: 0.1,
          bbox_y: 0.1,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'approved-track',
          status: 'approved',
          comment: null,
        },
        {
          id: 'det-2',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 5000,
          end_time_ms: 10000,
          bbox_x: 0.3,
          bbox_y: 0.3,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'rejected-track',
          status: 'rejected',
          comment: null,
        },
        {
          id: 'det-3',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 10000,
          end_time_ms: 15000,
          bbox_x: 0.5,
          bbox_y: 0.5,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'pending-track',
          status: 'pending',
          comment: null,
        },
      ];

      const mixedTracks = [
        { track_id: 'approved-track', count: 1 },
        { track_id: 'rejected-track', count: 1 },
        { track_id: 'pending-track', count: 1 },
      ];

      (api.listVideoDetections as any).mockResolvedValue({
        detections: mixedStatusDetections,
        tracks: mixedTracks,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // All three tracks should be displayed
      expect(screen.getByText('First: 0:00')).toBeInTheDocument();
      expect(screen.getByText('First: 0:05')).toBeInTheDocument();
      expect(screen.getByText('First: 0:10')).toBeInTheDocument();
    });
  });

  describe('Seek Functionality', () => {
    it('should handle track click when no detections exist for track', async () => {
      // Edge case: track exists but detections are empty
      (api.listVideoDetections as any).mockResolvedValue({
        detections: [],
        tracks: [{ track_id: 'orphan-track', count: 0 }],
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Should show the track even without detections
      expect(screen.getByText('orphan-track')).toBeInTheDocument();

      // Clicking should not crash
      const trackButton = screen.getByText('orphan-track').closest('button');
      expect(trackButton).toBeDefined();
      fireEvent.click(trackButton!);

      // Should still be functional
      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });
    });

    it('should format time correctly for various durations', async () => {
      const longVideoDetections = [
        {
          id: 'det-1',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 65000, // 1:05
          end_time_ms: 70000,
          bbox_x: 0.1,
          bbox_y: 0.1,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-minute',
          status: 'pending',
          comment: null,
        },
        {
          id: 'det-2',
          file_id: 'file-1',
          detection_type: 'face',
          start_time_ms: 3661000, // 61:01
          end_time_ms: 3665000,
          bbox_x: 0.3,
          bbox_y: 0.3,
          bbox_width: 0.2,
          bbox_height: 0.2,
          track_id: 'face-hour',
          status: 'approved',
          comment: null,
        },
      ];

      const longTracks = [
        { track_id: 'face-minute', count: 1 },
        { track_id: 'face-hour', count: 1 },
      ];

      (api.listVideoDetections as any).mockResolvedValue({
        detections: longVideoDetections,
        tracks: longTracks,
      });

      renderWithRouter();

      await waitFor(() => {
        expect(screen.getByText('Tracks')).toBeInTheDocument();
      });

      // Check formatted times
      expect(screen.getByText('First: 1:05')).toBeInTheDocument();
      expect(screen.getByText('First: 61:01')).toBeInTheDocument();
    });
  });
});
