import type { Detection } from '../types';

export interface LocalDetection {
  id: string;
  bbox_x: number;
  bbox_y: number;
  bbox_width: number;
  bbox_height: number;
  page_number: number | null;
  status: string;
  detection_type: string;
  exemption_code: string | null;
  comment: string | null;
}

// Update detection position (for drag)
export function updateDetectionPosition<T extends { id: string; bbox_x?: number | null; bbox_y?: number | null }>(
  detections: T[],
  detectionId: string,
  newX: number,
  newY: number
): T[] {
  return detections.map(d =>
    d.id === detectionId
      ? { ...d, bbox_x: newX, bbox_y: newY }
      : d
  );
}

// Update detection size (for resize/transform)
export function updateDetectionSize<T extends { id: string; bbox_x?: number | null; bbox_y?: number | null; bbox_width?: number | null; bbox_height?: number | null }>(
  detections: T[],
  detectionId: string,
  newX: number,
  newY: number,
  newWidth: number,
  newHeight: number
): T[] {
  return detections.map(d =>
    d.id === detectionId
      ? { ...d, bbox_x: newX, bbox_y: newY, bbox_width: newWidth, bbox_height: newHeight }
      : d
  );
}

// Approve a single detection
export function approveDetection<T extends { id: string; status?: string | null; exemption_code?: string | null; comment?: string | null }>(
  detections: T[],
  detectionId: string,
  exemptionCode: string,
  comment: string | null
): T[] {
  return detections.map(d =>
    d.id === detectionId
      ? { ...d, status: 'approved', exemption_code: exemptionCode, comment }
      : d
  );
}

// Reject a single detection
export function rejectDetection<T extends { id: string; status?: string | null }>(
  detections: T[],
  detectionId: string
): T[] {
  return detections.map(d =>
    d.id === detectionId
      ? { ...d, status: 'rejected' }
      : d
  );
}

// Approve all pending detections on a page
export function approveAllPendingOnPage<T extends { id: string; status?: string | null; page_number?: number | null; exemption_code?: string | null; comment?: string | null }>(
  detections: T[],
  currentPage: number,
  exemptionCode: string,
  comment?: string | null
): T[] {
  return detections.map(d => {
    if (d.status === 'pending' && (d.page_number == null || d.page_number === currentPage)) {
      return { ...d, status: 'approved', exemption_code: exemptionCode, comment: comment ?? null };
    }
    return d;
  });
}

// Reject all pending detections on a page
export function rejectAllPendingOnPage<T extends { id: string; status?: string | null; page_number?: number | null; comment?: string | null }>(
  detections: T[],
  currentPage: number,
  comment?: string | null
): T[] {
  return detections.map(d => {
    if (d.status === 'pending' && (d.page_number == null || d.page_number === currentPage)) {
      return { ...d, status: 'rejected', comment: comment ?? null };
    }
    return d;
  });
}

// Filter out rejected local detections on a page
export function filterRejectedLocalOnPage<T extends { id: string; status?: string | null; page_number?: number | null }>(
  detections: T[],
  currentPage: number
): T[] {
  return detections.filter(d => {
    if (d.status === 'pending' && (d.page_number == null || d.page_number === currentPage)) {
      return false;
    }
    return true;
  });
}

// Get pending detections on a page
export function getPendingOnPage<T extends { status?: string | null; page_number?: number | null }>(
  detections: T[],
  currentPage: number
): T[] {
  return detections.filter(
    d => d.status === 'pending' && (d.page_number == null || d.page_number === currentPage)
  );
}

// Check if a detection has been modified from its original state
export function hasDetectionBeenModified(
  modified: Detection,
  original: Detection
): boolean {
  return (
    modified.status !== original.status ||
    modified.bbox_x !== original.bbox_x ||
    modified.bbox_y !== original.bbox_y ||
    modified.bbox_width !== original.bbox_width ||
    modified.bbox_height !== original.bbox_height ||
    modified.exemption_code !== original.exemption_code ||
    modified.comment !== original.comment
  );
}

// Get all modified detections that need to be synced to the server
export function getModifiedDetections(
  modifiedDetections: Detection[],
  originalDetections: Detection[]
): Array<{ detection: Detection; original: Detection }> {
  const modified: Array<{ detection: Detection; original: Detection }> = [];

  for (const current of modifiedDetections) {
    const original = originalDetections.find(d => d.id === current.id);
    if (!original) continue;

    if (hasDetectionBeenModified(current, original)) {
      modified.push({ detection: current, original });
    }
  }

  return modified;
}

// Calculate toolbar position
export function calculateToolbarPosition(
  bboxX: number,
  bboxY: number,
  bboxHeight: number,
  dimensionsWidth: number,
  dimensionsHeight: number
): { left: number; top: number } {
  const toolbarX = bboxX * dimensionsWidth;
  const toolbarY = (bboxY + bboxHeight) * dimensionsHeight + 8;

  return {
    left: Math.max(8, Math.min(toolbarX, dimensionsWidth - 320)),
    top: Math.min(toolbarY, dimensionsHeight - 60),
  };
}

// Check if page change is valid
export function isValidPageChange(
  newPage: number,
  totalPages: number
): boolean {
  return newPage >= 1 && newPage <= totalPages;
}
