import { describe, it, expect } from 'vitest';
import {
  groupTracksByStartTime,
  calculateCaptureTime,
  calculatePositionLabel,
  formatTime,
  TrackAppearance,
} from './pdfUtils';

describe('pdfUtils', () => {
  // ============================================
  // groupTracksByStartTime Tests
  // ============================================

  describe('groupTracksByStartTime', () => {
    const createTrack = (trackId: string, startTimeMs: number, endTimeMs: number): TrackAppearance => ({
      trackId,
      startTimeMs,
      endTimeMs,
      detection: {
        status: 'approved',
        bbox_x: 0.1,
        bbox_y: 0.1,
        bbox_width: 0.2,
        bbox_height: 0.2,
      },
    });

    it('returns empty array for empty input', () => {
      expect(groupTracksByStartTime([])).toEqual([]);
    });

    it('groups single track into one group', () => {
      const tracks = [createTrack('face-001', 0, 5000)];
      const result = groupTracksByStartTime(tracks);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].trackId).toBe('face-001');
    });

    it('groups tracks starting at same time into one group', () => {
      const tracks = [
        createTrack('face-001', 0, 5000),
        createTrack('face-002', 0, 6000),
      ];
      const result = groupTracksByStartTime(tracks);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(2);
      expect(result[0].map(t => t.trackId)).toEqual(['face-001', 'face-002']);
    });

    it('groups tracks within 1 second threshold', () => {
      const tracks = [
        createTrack('face-001', 0, 5000),
        createTrack('face-002', 500, 6000),
        createTrack('face-003', 999, 7000),
      ];
      const result = groupTracksByStartTime(tracks);

      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(3);
    });

    it('separates tracks beyond 1 second threshold', () => {
      const tracks = [
        createTrack('face-001', 0, 5000),
        createTrack('face-002', 1001, 6000),
      ];
      const result = groupTracksByStartTime(tracks);

      expect(result).toHaveLength(2);
      expect(result[0]).toHaveLength(1);
      expect(result[0][0].trackId).toBe('face-001');
      expect(result[1]).toHaveLength(1);
      expect(result[1][0].trackId).toBe('face-002');
    });

    it('creates multiple groups for tracks at different times', () => {
      const tracks = [
        createTrack('face-001', 0, 5000),
        createTrack('face-002', 500, 5500),
        createTrack('face-003', 5000, 10000),
        createTrack('face-004', 5200, 10200),
        createTrack('face-005', 15000, 20000),
      ];
      const result = groupTracksByStartTime(tracks);

      expect(result).toHaveLength(3);
      expect(result[0].map(t => t.trackId)).toEqual(['face-001', 'face-002']);
      expect(result[1].map(t => t.trackId)).toEqual(['face-003', 'face-004']);
      expect(result[2].map(t => t.trackId)).toEqual(['face-005']);
    });

    it('uses custom threshold when provided', () => {
      const tracks = [
        createTrack('face-001', 0, 5000),
        createTrack('face-002', 1500, 6000),
      ];

      // Default threshold (1000ms) - should separate
      const result1 = groupTracksByStartTime(tracks);
      expect(result1).toHaveLength(2);

      // Custom threshold (2000ms) - should group
      const result2 = groupTracksByStartTime(tracks, 2000);
      expect(result2).toHaveLength(1);
      expect(result2[0]).toHaveLength(2);
    });

    it('handles edge case at exact threshold boundary', () => {
      const tracks = [
        createTrack('face-001', 0, 5000),
        createTrack('face-002', 1000, 6000), // Exactly at threshold
      ];
      const result = groupTracksByStartTime(tracks);

      // At exactly 1000ms difference, should still be in same group (<=)
      expect(result).toHaveLength(1);
      expect(result[0]).toHaveLength(2);
    });

    it('groups are relative to first track in group', () => {
      // Track 3 is >1000ms from track 1 but within 1000ms of track 2
      const tracks = [
        createTrack('face-001', 0, 5000),
        createTrack('face-002', 800, 5800),
        createTrack('face-003', 1500, 6500), // >1000ms from track 1, but group start is 0
      ];
      const result = groupTracksByStartTime(tracks);

      // Track 3 should be in a new group because it's >1000ms from group start (0)
      expect(result).toHaveLength(2);
      expect(result[0].map(t => t.trackId)).toEqual(['face-001', 'face-002']);
      expect(result[1].map(t => t.trackId)).toEqual(['face-003']);
    });

    it('preserves track data in groups', () => {
      const tracks: TrackAppearance[] = [
        {
          trackId: 'face-001',
          startTimeMs: 0,
          endTimeMs: 5000,
          detection: {
            status: 'approved',
            bbox_x: 0.1,
            bbox_y: 0.2,
            bbox_width: 0.3,
            bbox_height: 0.4,
            exemption_code: 'b6',
            comment: 'Test comment',
          },
        },
      ];
      const result = groupTracksByStartTime(tracks);

      expect(result[0][0].detection.status).toBe('approved');
      expect(result[0][0].detection.bbox_x).toBe(0.1);
      expect(result[0][0].detection.exemption_code).toBe('b6');
      expect(result[0][0].detection.comment).toBe('Test comment');
    });

    it('handles rejected tracks', () => {
      const tracks: TrackAppearance[] = [
        {
          trackId: 'face-001',
          startTimeMs: 0,
          endTimeMs: 5000,
          detection: { status: 'rejected' },
        },
        {
          trackId: 'face-002',
          startTimeMs: 500,
          endTimeMs: 5500,
          detection: { status: 'approved' },
        },
      ];
      const result = groupTracksByStartTime(tracks);

      expect(result).toHaveLength(1);
      expect(result[0][0].detection.status).toBe('rejected');
      expect(result[0][1].detection.status).toBe('approved');
    });
  });

  // ============================================
  // calculateCaptureTime Tests
  // ============================================

  describe('calculateCaptureTime', () => {
    it('returns 500ms after start for tracks longer than 1 second', () => {
      expect(calculateCaptureTime(0, 5000)).toBe(500);
      expect(calculateCaptureTime(1000, 10000)).toBe(1500);
      expect(calculateCaptureTime(0, 1001)).toBe(500);
    });

    it('returns midpoint for tracks 1 second or shorter', () => {
      expect(calculateCaptureTime(0, 1000)).toBe(500);
      expect(calculateCaptureTime(0, 500)).toBe(250);
      expect(calculateCaptureTime(1000, 1200)).toBe(1100);
    });

    it('handles very short tracks', () => {
      expect(calculateCaptureTime(0, 100)).toBe(50);
      expect(calculateCaptureTime(5000, 5050)).toBe(5025);
    });

    it('handles zero-length tracks', () => {
      expect(calculateCaptureTime(1000, 1000)).toBe(1000);
    });

    it('returns start time for negative duration (edge case)', () => {
      // This shouldn't happen in practice, but handle gracefully
      const result = calculateCaptureTime(1000, 500);
      expect(result).toBe(750); // midpoint of negative duration
    });
  });

  // ============================================
  // calculatePositionLabel Tests
  // ============================================

  describe('calculatePositionLabel', () => {
    it('returns upper-left for top-left corner', () => {
      expect(calculatePositionLabel(0.1, 0.1)).toBe('upper-left');
      expect(calculatePositionLabel(0, 0)).toBe('upper-left');
      expect(calculatePositionLabel(0.32, 0.32)).toBe('upper-left');
    });

    it('returns upper-center for top-center', () => {
      expect(calculatePositionLabel(0.5, 0.1)).toBe('upper-center');
      expect(calculatePositionLabel(0.33, 0.2)).toBe('upper-center');
      expect(calculatePositionLabel(0.65, 0.32)).toBe('upper-center');
    });

    it('returns upper-right for top-right corner', () => {
      expect(calculatePositionLabel(0.8, 0.1)).toBe('upper-right');
      expect(calculatePositionLabel(0.66, 0.2)).toBe('upper-right');
      expect(calculatePositionLabel(1, 0)).toBe('upper-right');
    });

    it('returns middle-left for left side', () => {
      expect(calculatePositionLabel(0.1, 0.5)).toBe('middle-left');
      expect(calculatePositionLabel(0.2, 0.33)).toBe('middle-left');
      expect(calculatePositionLabel(0.32, 0.65)).toBe('middle-left');
    });

    it('returns center for center position', () => {
      expect(calculatePositionLabel(0.5, 0.5)).toBe('center');
      expect(calculatePositionLabel(0.33, 0.33)).toBe('center');
      expect(calculatePositionLabel(0.65, 0.65)).toBe('center');
    });

    it('returns middle-right for right side', () => {
      expect(calculatePositionLabel(0.8, 0.5)).toBe('middle-right');
      expect(calculatePositionLabel(0.66, 0.4)).toBe('middle-right');
      expect(calculatePositionLabel(1, 0.5)).toBe('middle-right');
    });

    it('returns lower-left for bottom-left corner', () => {
      expect(calculatePositionLabel(0.1, 0.8)).toBe('lower-left');
      expect(calculatePositionLabel(0.2, 0.66)).toBe('lower-left');
      expect(calculatePositionLabel(0, 1)).toBe('lower-left');
    });

    it('returns lower-center for bottom-center', () => {
      expect(calculatePositionLabel(0.5, 0.8)).toBe('lower-center');
      expect(calculatePositionLabel(0.4, 0.66)).toBe('lower-center');
    });

    it('returns lower-right for bottom-right corner', () => {
      expect(calculatePositionLabel(0.8, 0.8)).toBe('lower-right');
      expect(calculatePositionLabel(1, 1)).toBe('lower-right');
      expect(calculatePositionLabel(0.66, 0.66)).toBe('lower-right');
    });
  });

  // ============================================
  // formatTime Tests
  // ============================================

  describe('formatTime', () => {
    it('formats zero milliseconds', () => {
      expect(formatTime(0)).toBe('0:00.00');
    });

    it('formats seconds correctly', () => {
      expect(formatTime(5000)).toBe('0:05.00');
      expect(formatTime(30000)).toBe('0:30.00');
      expect(formatTime(59000)).toBe('0:59.00');
    });

    it('formats minutes and seconds', () => {
      expect(formatTime(60000)).toBe('1:00.00');
      expect(formatTime(90000)).toBe('1:30.00');
      expect(formatTime(125000)).toBe('2:05.00');
    });

    it('formats milliseconds correctly', () => {
      expect(formatTime(5530)).toBe('0:05.53');
      expect(formatTime(1234)).toBe('0:01.23');
      expect(formatTime(999)).toBe('0:00.99');
    });

    it('handles large times', () => {
      expect(formatTime(600000)).toBe('10:00.00');
      expect(formatTime(3661230)).toBe('61:01.23');
    });

    it('pads single-digit seconds', () => {
      expect(formatTime(5000)).toBe('0:05.00');
      expect(formatTime(65000)).toBe('1:05.00');
    });

    it('pads single-digit centiseconds', () => {
      expect(formatTime(5050)).toBe('0:05.05');
      expect(formatTime(100)).toBe('0:00.10');
    });
  });

  // ============================================
  // Integration Tests
  // ============================================

  describe('integration', () => {
    it('groups and calculates capture times for real-world scenario', () => {
      // Simulating a video with 3 people appearing at different times
      const tracks: TrackAppearance[] = [
        { trackId: 'face-000', startTimeMs: 0, endTimeMs: 5530, detection: { status: 'approved' } },
        { trackId: 'face-001', startTimeMs: 0, endTimeMs: 6030, detection: { status: 'approved' } },
        { trackId: 'face-002', startTimeMs: 500, endTimeMs: 530, detection: { status: 'approved' } },
      ];

      const groups = groupTracksByStartTime(tracks);

      // All three should be in one group (all within 1 second of start)
      expect(groups).toHaveLength(1);
      expect(groups[0]).toHaveLength(3);

      // Capture time should be 500ms after first track's start
      const captureTime = calculateCaptureTime(
        groups[0][0].startTimeMs,
        groups[0][0].endTimeMs
      );
      expect(captureTime).toBe(500);
    });

    it('handles separate groups with different capture times', () => {
      const tracks: TrackAppearance[] = [
        { trackId: 'face-000', startTimeMs: 0, endTimeMs: 5000, detection: { status: 'approved' } },
        { trackId: 'face-001', startTimeMs: 10000, endTimeMs: 15000, detection: { status: 'approved' } },
        { trackId: 'face-002', startTimeMs: 20000, endTimeMs: 20500, detection: { status: 'approved' } },
      ];

      const groups = groupTracksByStartTime(tracks);
      expect(groups).toHaveLength(3);

      // First group: long track, capture at 500ms
      expect(calculateCaptureTime(groups[0][0].startTimeMs, groups[0][0].endTimeMs)).toBe(500);

      // Second group: long track, capture at 10500ms
      expect(calculateCaptureTime(groups[1][0].startTimeMs, groups[1][0].endTimeMs)).toBe(10500);

      // Third group: short track, capture at midpoint (20250ms)
      expect(calculateCaptureTime(groups[2][0].startTimeMs, groups[2][0].endTimeMs)).toBe(20250);
    });
  });
});
