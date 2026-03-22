/**
 * Utility functions for PDF generation with video redaction logs.
 */

export interface TrackAppearance {
  trackId: string;
  startTimeMs: number;
  endTimeMs: number;
  detection: {
    status: 'approved' | 'rejected' | 'pending';
    bbox_x?: number;
    bbox_y?: number;
    bbox_width?: number;
    bbox_height?: number;
    exemption_code?: string;
    comment?: string;
  };
}

/**
 * Groups tracks that start within a threshold of each other.
 * Tracks starting within 1 second of each other are grouped on the same page.
 *
 * @param tracks - Array of track appearances sorted by start time
 * @param thresholdMs - Time threshold in milliseconds (default: 1000ms)
 * @returns Array of track groups
 */
export function groupTracksByStartTime(
  tracks: TrackAppearance[],
  thresholdMs: number = 1000
): TrackAppearance[][] {
  if (tracks.length === 0) return [];

  const pageGroups: TrackAppearance[][] = [];
  let currentGroup: TrackAppearance[] = [];
  let groupStartTime = tracks[0]?.startTimeMs ?? 0;

  for (const track of tracks) {
    if (track.startTimeMs - groupStartTime <= thresholdMs) {
      currentGroup.push(track);
    } else {
      if (currentGroup.length > 0) pageGroups.push(currentGroup);
      currentGroup = [track];
      groupStartTime = track.startTimeMs;
    }
  }
  if (currentGroup.length > 0) pageGroups.push(currentGroup);

  return pageGroups;
}

/**
 * Calculates the optimal capture time for a frame.
 * Uses 500ms after start for longer tracks, or midpoint for short tracks.
 *
 * @param startTimeMs - Track start time in milliseconds
 * @param endTimeMs - Track end time in milliseconds
 * @returns Optimal capture time in milliseconds
 */
export function calculateCaptureTime(startTimeMs: number, endTimeMs: number): number {
  const trackDuration = endTimeMs - startTimeMs;
  return trackDuration > 1000
    ? startTimeMs + 500  // 500ms after start for longer tracks
    : startTimeMs + Math.floor(trackDuration / 2);  // midpoint for short tracks
}

/**
 * Calculates the position label for a bounding box.
 *
 * @param bboxX - X coordinate (0-1)
 * @param bboxY - Y coordinate (0-1)
 * @returns Position label (e.g., "upper-left", "center", "lower-right")
 */
export function calculatePositionLabel(bboxX: number, bboxY: number): string {
  const vPos = bboxY < 0.33 ? 'upper' : bboxY < 0.66 ? 'middle' : 'lower';
  const hPos = bboxX < 0.33 ? 'left' : bboxX < 0.66 ? 'center' : 'right';
  return vPos === 'middle' && hPos === 'center' ? 'center' : `${vPos}-${hPos}`;
}

/**
 * Formats milliseconds as MM:SS.ms
 *
 * @param ms - Time in milliseconds
 * @returns Formatted time string
 */
export function formatTime(ms: number): string {
  const totalSec = Math.floor(ms / 1000);
  const min = Math.floor(totalSec / 60);
  const sec = totalSec % 60;
  const msRemainder = Math.floor((ms % 1000) / 10);
  return `${min}:${sec.toString().padStart(2, '0')}.${msRemainder.toString().padStart(2, '0')}`;
}
