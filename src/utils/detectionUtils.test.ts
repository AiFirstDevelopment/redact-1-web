import { describe, it, expect } from 'vitest';
import {
  updateDetectionPosition,
  updateDetectionSize,
  approveDetection,
  rejectDetection,
  approveAllPendingOnPage,
  rejectAllPendingOnPage,
  filterRejectedLocalOnPage,
  getPendingOnPage,
  hasDetectionBeenModified,
  getModifiedDetections,
  calculateToolbarPosition,
  isValidPageChange,
} from './detectionUtils';
import type { Detection } from '../types';

describe('detectionUtils', () => {
  describe('updateDetectionPosition', () => {
    it('updates position for matching detection', () => {
      const detections = [
        { id: '1', bbox_x: 0.1, bbox_y: 0.1 },
        { id: '2', bbox_x: 0.5, bbox_y: 0.5 },
      ];

      const result = updateDetectionPosition(detections, '1', 0.3, 0.4);

      expect(result[0].bbox_x).toBe(0.3);
      expect(result[0].bbox_y).toBe(0.4);
      expect(result[1].bbox_x).toBe(0.5);
      expect(result[1].bbox_y).toBe(0.5);
    });

    it('does not modify non-matching detections', () => {
      const detections = [{ id: '1', bbox_x: 0.1, bbox_y: 0.1 }];

      const result = updateDetectionPosition(detections, '2', 0.3, 0.4);

      expect(result[0].bbox_x).toBe(0.1);
      expect(result[0].bbox_y).toBe(0.1);
    });

    it('returns new array without mutating original', () => {
      const detections = [{ id: '1', bbox_x: 0.1, bbox_y: 0.1 }];

      const result = updateDetectionPosition(detections, '1', 0.3, 0.4);

      expect(result).not.toBe(detections);
      expect(detections[0].bbox_x).toBe(0.1);
    });
  });

  describe('updateDetectionSize', () => {
    it('updates size and position for matching detection', () => {
      const detections = [
        { id: '1', bbox_x: 0.1, bbox_y: 0.1, bbox_width: 0.2, bbox_height: 0.2 },
      ];

      const result = updateDetectionSize(detections, '1', 0.15, 0.15, 0.3, 0.35);

      expect(result[0].bbox_x).toBe(0.15);
      expect(result[0].bbox_y).toBe(0.15);
      expect(result[0].bbox_width).toBe(0.3);
      expect(result[0].bbox_height).toBe(0.35);
    });

    it('does not modify non-matching detections', () => {
      const detections = [
        { id: '1', bbox_x: 0.1, bbox_y: 0.1, bbox_width: 0.2, bbox_height: 0.2 },
      ];

      const result = updateDetectionSize(detections, '2', 0.15, 0.15, 0.3, 0.35);

      expect(result[0].bbox_x).toBe(0.1);
      expect(result[0].bbox_width).toBe(0.2);
    });
  });

  describe('approveDetection', () => {
    it('approves detection with exemption code and comment', () => {
      const detections = [
        { id: '1', status: 'pending', exemption_code: null, comment: null },
      ];

      const result = approveDetection(detections, '1', 'b6', 'Test comment');

      expect(result[0].status).toBe('approved');
      expect(result[0].exemption_code).toBe('b6');
      expect(result[0].comment).toBe('Test comment');
    });

    it('handles null comment', () => {
      const detections = [
        { id: '1', status: 'pending', exemption_code: null, comment: null },
      ];

      const result = approveDetection(detections, '1', 'b7c', null);

      expect(result[0].status).toBe('approved');
      expect(result[0].comment).toBeNull();
    });

    it('does not modify non-matching detections', () => {
      const detections = [
        { id: '1', status: 'pending', exemption_code: null, comment: null },
      ];

      const result = approveDetection(detections, '2', 'b6', 'Test');

      expect(result[0].status).toBe('pending');
    });
  });

  describe('rejectDetection', () => {
    it('sets status to rejected', () => {
      const detections = [
        { id: '1', status: 'pending' },
        { id: '2', status: 'approved' },
      ];

      const result = rejectDetection(detections, '1');

      expect(result[0].status).toBe('rejected');
      expect(result[1].status).toBe('approved');
    });

    it('does not modify non-matching detections', () => {
      const detections = [{ id: '1', status: 'pending' }];

      const result = rejectDetection(detections, '2');

      expect(result[0].status).toBe('pending');
    });
  });

  describe('approveAllPendingOnPage', () => {
    it('approves all pending detections on current page', () => {
      const detections = [
        { id: '1', status: 'pending', page_number: 1, exemption_code: null },
        { id: '2', status: 'pending', page_number: 2, exemption_code: null },
        { id: '3', status: 'approved', page_number: 1, exemption_code: 'b6' },
      ];

      const result = approveAllPendingOnPage(detections, 1, 'b7c');

      expect(result[0].status).toBe('approved');
      expect(result[0].exemption_code).toBe('b7c');
      expect(result[1].status).toBe('pending');
      expect(result[2].status).toBe('approved');
      expect(result[2].exemption_code).toBe('b6');
    });

    it('handles detections with null page_number', () => {
      const detections = [
        { id: '1', status: 'pending', page_number: null, exemption_code: null },
      ];

      const result = approveAllPendingOnPage(detections, 1, 'b6');

      expect(result[0].status).toBe('approved');
    });

    it('does not modify already approved detections', () => {
      const detections = [
        { id: '1', status: 'approved', page_number: 1, exemption_code: 'b6' },
      ];

      const result = approveAllPendingOnPage(detections, 1, 'b7c');

      expect(result[0].exemption_code).toBe('b6');
    });
  });

  describe('rejectAllPendingOnPage', () => {
    it('rejects all pending detections on current page', () => {
      const detections = [
        { id: '1', status: 'pending', page_number: 1 },
        { id: '2', status: 'pending', page_number: 2 },
      ];

      const result = rejectAllPendingOnPage(detections, 1);

      expect(result[0].status).toBe('rejected');
      expect(result[1].status).toBe('pending');
    });

    it('handles detections with null page_number', () => {
      const detections = [
        { id: '1', status: 'pending', page_number: null },
      ];

      const result = rejectAllPendingOnPage(detections, 1);

      expect(result[0].status).toBe('rejected');
    });
  });

  describe('filterRejectedLocalOnPage', () => {
    it('removes pending detections on current page', () => {
      const detections = [
        { id: '1', status: 'pending', page_number: 1 },
        { id: '2', status: 'approved', page_number: 1 },
        { id: '3', status: 'pending', page_number: 2 },
      ];

      const result = filterRejectedLocalOnPage(detections, 1);

      expect(result).toHaveLength(2);
      expect(result.map(d => d.id)).toEqual(['2', '3']);
    });

    it('keeps approved detections on current page', () => {
      const detections = [
        { id: '1', status: 'approved', page_number: 1 },
      ];

      const result = filterRejectedLocalOnPage(detections, 1);

      expect(result).toHaveLength(1);
    });

    it('handles null page_number as matching current page', () => {
      const detections = [
        { id: '1', status: 'pending', page_number: null },
      ];

      const result = filterRejectedLocalOnPage(detections, 1);

      expect(result).toHaveLength(0);
    });
  });

  describe('getPendingOnPage', () => {
    it('returns only pending detections on current page', () => {
      const detections = [
        { id: '1', status: 'pending', page_number: 1 },
        { id: '2', status: 'approved', page_number: 1 },
        { id: '3', status: 'pending', page_number: 2 },
        { id: '4', status: 'pending', page_number: null },
      ];

      const result = getPendingOnPage(detections, 1);

      expect(result).toHaveLength(2);
      expect(result.map(d => d.id)).toEqual(['1', '4']);
    });

    it('returns empty array when no pending detections', () => {
      const detections = [
        { id: '1', status: 'approved', page_number: 1 },
      ];

      const result = getPendingOnPage(detections, 1);

      expect(result).toHaveLength(0);
    });
  });

  describe('hasDetectionBeenModified', () => {
    const baseDetection: Detection = {
      id: '1',
      file_id: 'file-1',
      detection_type: 'face',
      status: 'pending',
      bbox_x: 0.1,
      bbox_y: 0.1,
      bbox_width: 0.2,
      bbox_height: 0.2,
      exemption_code: null,
      comment: null,
      page_number: 1,
      text_start: null,
      text_end: null,
      text_content: null,
      confidence: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: 1704067200000,
    };

    it('returns true when status changed', () => {
      const modified: Detection = { ...baseDetection, status: 'approved' };
      expect(hasDetectionBeenModified(modified, baseDetection)).toBe(true);
    });

    it('returns true when bbox_x changed', () => {
      const modified = { ...baseDetection, bbox_x: 0.2 };
      expect(hasDetectionBeenModified(modified, baseDetection)).toBe(true);
    });

    it('returns true when bbox_y changed', () => {
      const modified = { ...baseDetection, bbox_y: 0.2 };
      expect(hasDetectionBeenModified(modified, baseDetection)).toBe(true);
    });

    it('returns true when bbox_width changed', () => {
      const modified = { ...baseDetection, bbox_width: 0.3 };
      expect(hasDetectionBeenModified(modified, baseDetection)).toBe(true);
    });

    it('returns true when bbox_height changed', () => {
      const modified = { ...baseDetection, bbox_height: 0.3 };
      expect(hasDetectionBeenModified(modified, baseDetection)).toBe(true);
    });

    it('returns true when exemption_code changed', () => {
      const modified = { ...baseDetection, exemption_code: 'b6' };
      expect(hasDetectionBeenModified(modified, baseDetection)).toBe(true);
    });

    it('returns true when comment changed', () => {
      const modified = { ...baseDetection, comment: 'New comment' };
      expect(hasDetectionBeenModified(modified, baseDetection)).toBe(true);
    });

    it('returns false when nothing changed', () => {
      expect(hasDetectionBeenModified(baseDetection, baseDetection)).toBe(false);
    });

    it('returns false for identical copies', () => {
      const copy = { ...baseDetection };
      expect(hasDetectionBeenModified(copy, baseDetection)).toBe(false);
    });
  });

  describe('getModifiedDetections', () => {
    const baseDetection: Detection = {
      id: '1',
      file_id: 'file-1',
      detection_type: 'face',
      status: 'pending',
      bbox_x: 0.1,
      bbox_y: 0.1,
      bbox_width: 0.2,
      bbox_height: 0.2,
      exemption_code: null,
      comment: null,
      page_number: 1,
      text_start: null,
      text_end: null,
      text_content: null,
      confidence: null,
      reviewed_by: null,
      reviewed_at: null,
      created_at: 1704067200000,
    };

    it('returns modified detections with their originals', () => {
      const original = [baseDetection];
      const modified: Detection[] = [{ ...baseDetection, status: 'approved' }];

      const result = getModifiedDetections(modified, original);

      expect(result).toHaveLength(1);
      expect(result[0].detection.status).toBe('approved');
      expect(result[0].original.status).toBe('pending');
    });

    it('returns empty array when nothing modified', () => {
      const original = [baseDetection];
      const modified = [{ ...baseDetection }];

      const result = getModifiedDetections(modified, original);

      expect(result).toHaveLength(0);
    });

    it('skips detections not in original list', () => {
      const original = [baseDetection];
      const modified: Detection[] = [{ ...baseDetection, id: '2', status: 'approved' }];

      const result = getModifiedDetections(modified, original);

      expect(result).toHaveLength(0);
    });

    it('handles multiple detections', () => {
      const det1 = baseDetection;
      const det2 = { ...baseDetection, id: '2' };
      const original = [det1, det2];
      const modified: Detection[] = [
        { ...det1, status: 'approved' },
        { ...det2 }, // unchanged
      ];

      const result = getModifiedDetections(modified, original);

      expect(result).toHaveLength(1);
      expect(result[0].detection.id).toBe('1');
    });
  });

  describe('calculateToolbarPosition', () => {
    it('calculates position below detection', () => {
      const result = calculateToolbarPosition(0.5, 0.3, 0.1, 1000, 800);

      expect(result.left).toBe(500);
      expect(result.top).toBe(328); // (0.3 + 0.1) * 800 + 8
    });

    it('clamps left position to minimum 8px', () => {
      const result = calculateToolbarPosition(0, 0.3, 0.1, 1000, 800);

      expect(result.left).toBe(8);
    });

    it('clamps left position to fit toolbar width', () => {
      const result = calculateToolbarPosition(0.9, 0.3, 0.1, 1000, 800);

      expect(result.left).toBe(680); // 1000 - 320
    });

    it('clamps top position to fit toolbar height', () => {
      const result = calculateToolbarPosition(0.5, 0.9, 0.1, 1000, 800);

      expect(result.top).toBe(740); // 800 - 60
    });
  });

  describe('isValidPageChange', () => {
    it('returns true for valid page within range', () => {
      expect(isValidPageChange(2, 5)).toBe(true);
    });

    it('returns true for first page', () => {
      expect(isValidPageChange(1, 5)).toBe(true);
    });

    it('returns true for last page', () => {
      expect(isValidPageChange(5, 5)).toBe(true);
    });

    it('returns false for page less than 1', () => {
      expect(isValidPageChange(0, 5)).toBe(false);
    });

    it('returns false for page greater than total', () => {
      expect(isValidPageChange(6, 5)).toBe(false);
    });

    it('returns false for negative page', () => {
      expect(isValidPageChange(-1, 5)).toBe(false);
    });
  });
});
