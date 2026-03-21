import { useState, useEffect, useCallback, useRef } from 'react';
import { FixedSizeList as List, ListOnScrollProps } from 'react-window';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Request, User, Detection, AuditLog } from '../types';
import { EXEMPTION_LABELS, ExemptionCode } from '../types';
import { api } from '../services/api';

pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

interface RequestsListProps {
  requests: Request[];
  isLoading: boolean;
  selectedId: string | null;
  onSelect: (request: Request) => void;
  onNewRequest: () => void;
  onArchive?: (id: string) => void;
  onUnarchive?: (id: string) => void;
  onDelete?: (id: string) => void;
  onRequestUpdated?: () => void;
  onSwitchToRequests?: () => void;
  onRestoreRequest?: (id: string) => void;
  showArchived?: boolean;
  searchTerm: string;
  onSearchChange: (term: string) => void;
  assigneeFilter: string;
  onAssigneeFilterChange: (assignee: string) => void;
  total: number;
  onLoadMore: () => void;
  isLoadingMore: boolean;
}

export function RequestsList({
  requests,
  isLoading,
  selectedId,
  onSelect,
  onNewRequest,
  onArchive,
  onUnarchive,
  onDelete,
  onRequestUpdated,
  onSwitchToRequests,
  onRestoreRequest,
  showArchived = false,
  searchTerm,
  onSearchChange,
  assigneeFilter,
  onAssigneeFilterChange,
  total,
  onLoadMore,
  isLoadingMore,
}: RequestsListProps) {
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [archiveConfirm, setArchiveConfirm] = useState<string | null>(null);
  const [animatingIds, setAnimatingIds] = useState<Set<string>>(new Set());
  const [removedIds, setRemovedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [auditModalRequest, setAuditModalRequest] = useState<Request | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [loadingAuditLogs, setLoadingAuditLogs] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const [listHeight, setListHeight] = useState(600);
  const [editingTitle, setEditingTitle] = useState('');
  const [users, setUsers] = useState<User[]>([]);
  const [assigningId, setAssigningId] = useState<string | null>(null);
  const [downloadReadyMap, setDownloadReadyMap] = useState<Record<string, boolean>>({});

  // Re-release (copy to new request) state
  const [copyFromRequest, setCopyFromRequest] = useState<Request | null>(null);
  const [isCopying, setIsCopying] = useState(false);
  const [copyResult, setCopyResult] = useState<{ success: boolean; newRequestId?: string; filesCopied?: number; error?: string } | null>(null);

  useEffect(() => {
    const loadUsers = async () => {
      try {
        const { users } = await api.listUsers();
        setUsers(users);
      } catch (err) {
        console.error('Failed to load users:', err);
      }
    };
    loadUsers();
  }, []);

  // Check which requests have all files completed (ready for download)
  useEffect(() => {
    const checkDownloadReady = async () => {
      const readyMap: Record<string, boolean> = {};

      for (const request of requests) {
        try {
          const { files } = await api.listFiles(request.id);

          // No files = not ready
          if (files.length === 0) {
            readyMap[request.id] = false;
            continue;
          }

          // Check if all files are completed
          const allCompleted = files.every(file => {
            const isReviewed = file.status === 'reviewed' || file.status === 'exported';
            const hasCompletedDetections = (file.detection_count ?? 0) > 0 && (file.pending_count ?? 0) === 0;
            return isReviewed || hasCompletedDetections;
          });

          readyMap[request.id] = allCompleted;
        } catch (err) {
          console.error(`Failed to check files for request ${request.id}:`, err);
          readyMap[request.id] = false;
        }
      }

      setDownloadReadyMap(readyMap);
    };

    if (requests.length > 0) {
      checkDownloadReady();
    }
  }, [requests]);

  const handleAssignmentChange = async (e: React.ChangeEvent<HTMLSelectElement>, requestId: string) => {
    e.stopPropagation();
    const userId = e.target.value;
    setAssigningId(requestId);
    try {
      await api.updateRequest(requestId, { created_by: userId });
      onRequestUpdated?.();
    } catch (err) {
      console.error('Failed to assign request:', err);
    } finally {
      setAssigningId(null);
    }
  };

  const [downloadingId, setDownloadingId] = useState<string | null>(null);

  const [downloadProgress, setDownloadProgress] = useState<{ current: number; total: number; file: string } | null>(null);

  const handleDownload = async (e: React.MouseEvent, request: Request) => {
    e.stopPropagation();
    setDownloadingId(request.id);
    setDownloadProgress(null);

    try {
      const zip = new JSZip();

      // Get files for this request
      const { files } = await api.listFiles(request.id);
      const totalFiles = files.length;

      // Process each file
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        setDownloadProgress({ current: i + 1, total: totalFiles, file: file.filename });

        // For videos, get the redacted version and create visual redaction log PDF
        if (file.file_type === 'video') {
          try {
            // Try to get redacted video
            try {
              const { url } = await api.getRedactedVideoStreamUrl(file.id);
              const response = await fetch(url);
              if (response.ok) {
                const blob = await response.blob();
                const baseName = file.filename.replace(/\.[^/.]+$/, '');
                zip.folder('redacted')?.file(`${baseName}_redacted.mp4`, blob);
              }
            } catch {
              console.log(`No redacted video for ${file.filename}`);
            }

            // Create visual video redaction log PDF
            const { detections: videoDetections } = await api.listVideoDetections(file.id);
            if (videoDetections.length > 0) {
              // Group detections by track
              const trackMap = new Map<string, typeof videoDetections>();
              for (const det of videoDetections) {
                const trackId = det.track_id || 'unknown';
                if (!trackMap.has(trackId)) {
                  trackMap.set(trackId, []);
                }
                trackMap.get(trackId)!.push(det);
              }

              // Get first detection for each track (earliest appearance)
              const trackFirstAppearances: Array<{
                trackId: string;
                detection: typeof videoDetections[0];
                startTimeMs: number;
                endTimeMs: number;
              }> = [];

              for (const [trackId, trackDetections] of trackMap) {
                // Sort by time to find first appearance
                trackDetections.sort((a, b) => (a.start_time_ms || 0) - (b.start_time_ms || 0));
                const firstDet = trackDetections[0];
                const lastDet = trackDetections[trackDetections.length - 1];
                trackFirstAppearances.push({
                  trackId,
                  detection: firstDet,
                  startTimeMs: firstDet.start_time_ms || 0,
                  endTimeMs: lastDet.end_time_ms || lastDet.start_time_ms || 0,
                });
              }

              // Sort tracks by first appearance time
              trackFirstAppearances.sort((a, b) => a.startTimeMs - b.startTimeMs);

              // Load original video - fetch as blob to avoid CORS/tainted canvas issues
              const { url: videoStreamUrl } = await api.getVideoStreamUrl(file.id);
              const videoResponse = await fetch(videoStreamUrl);
              const videoBlob = await videoResponse.blob();
              const videoBlobUrl = URL.createObjectURL(videoBlob);

              const video = document.createElement('video');
              video.muted = true;
              video.preload = 'auto';

              await new Promise<void>((resolve, reject) => {
                video.onloadedmetadata = () => resolve();
                video.onerror = () => reject(new Error('Failed to load video'));
                video.src = videoBlobUrl;
              });

              // Create PDF
              const videoPdf = await PDFDocument.create();
              const font = await videoPdf.embedFont(StandardFonts.Helvetica);
              const boldFont = await videoPdf.embedFont(StandardFonts.HelveticaBold);

              // Track all redactions for the summary index
              const redactionIndex: Array<{
                footnote: number;
                frame: number;
                trackId: string;
                position: string;
                timeRange: string;
                status: 'approved' | 'rejected';
                exemptionCode: string;
                exemptionLabel: string;
                comment: string;
              }> = [];
              let footnoteCounter = 1;

              // Format time as MM:SS.ms
              const formatTime = (ms: number) => {
                const totalSec = Math.floor(ms / 1000);
                const min = Math.floor(totalSec / 60);
                const sec = totalSec % 60;
                const msRemainder = Math.floor((ms % 1000) / 10);
                return `${min}:${sec.toString().padStart(2, '0')}.${msRemainder.toString().padStart(2, '0')}`;
              };

              // Helper to seek video and capture frame
              const captureFrame = async (timeMs: number): Promise<HTMLCanvasElement> => {
                return new Promise((resolve, reject) => {
                  const seekHandler = () => {
                    video.removeEventListener('seeked', seekHandler);
                    const canvas = document.createElement('canvas');
                    canvas.width = video.videoWidth;
                    canvas.height = video.videoHeight;
                    const ctx = canvas.getContext('2d')!;
                    ctx.drawImage(video, 0, 0);
                    resolve(canvas);
                  };
                  video.addEventListener('seeked', seekHandler);
                  video.currentTime = timeMs / 1000;
                  setTimeout(() => reject(new Error('Seek timeout')), 5000);
                });
              };

              // Process each track (each becomes a "page" in the PDF)
              for (let frameIdx = 0; frameIdx < trackFirstAppearances.length; frameIdx++) {
                const { trackId, detection, startTimeMs, endTimeMs } = trackFirstAppearances[frameIdx];

                // Capture frame at first appearance
                const canvas = await captureFrame(startTimeMs);
                const ctx = canvas.getContext('2d')!;

                // Calculate position for index
                const bboxX = detection.bbox_x ?? 0;
                const bboxY = detection.bbox_y ?? 0;
                const vPos = bboxY < 0.33 ? 'upper' : bboxY < 0.66 ? 'middle' : 'lower';
                const hPos = bboxX < 0.33 ? 'left' : bboxX < 0.66 ? 'center' : 'right';
                const position = vPos === 'middle' && hPos === 'center' ? 'center' : `${vPos}-${hPos}`;

                const isRejected = detection.status === 'rejected';
                const footnoteNum = footnoteCounter++;
                const exemptionCode = (detection.exemption_code || (isRejected ? '' : 'b6')) as ExemptionCode;
                const timeRange = `${formatTime(startTimeMs)} - ${formatTime(endTimeMs)}`;

                // Add to summary index
                redactionIndex.push({
                  footnote: footnoteNum,
                  frame: frameIdx + 1,
                  trackId,
                  position,
                  timeRange,
                  status: isRejected ? 'rejected' : 'approved',
                  exemptionCode: exemptionCode || '',
                  exemptionLabel: exemptionCode ? (EXEMPTION_LABELS[exemptionCode] || exemptionCode) : '',
                  comment: detection.comment || '',
                });

                // Draw redaction rectangle on canvas
                const x = (detection.bbox_x ?? 0) * canvas.width;
                const y = (detection.bbox_y ?? 0) * canvas.height;
                const w = (detection.bbox_width ?? 0) * canvas.width;
                const h = (detection.bbox_height ?? 0) * canvas.height;

                if (isRejected) {
                  // Dashed red outline for rejected
                  ctx.strokeStyle = '#CC0000';
                  ctx.lineWidth = 3;
                  ctx.setLineDash([8, 5]);
                  ctx.strokeRect(x, y, w, h);
                  ctx.setLineDash([]);

                  // Red footnote marker outside top-right
                  ctx.fillStyle = '#CC0000';
                  ctx.font = 'bold 16px Arial';
                  const markerText = `[${footnoteNum}]`;
                  const textWidth = ctx.measureText(markerText).width;
                  ctx.fillText(markerText, x + w - textWidth, y - 6);
                } else {
                  // Solid black rectangle for approved
                  ctx.fillStyle = '#000000';
                  ctx.fillRect(x, y, w, h);

                  // White footnote marker on black
                  ctx.fillStyle = '#FFFFFF';
                  ctx.font = 'bold 16px Arial';
                  const markerText = `[${footnoteNum}]`;
                  const textWidth = ctx.measureText(markerText).width;
                  ctx.fillText(markerText, x + w - textWidth - 4, y + 18);
                }

                // Convert canvas to PNG
                const pngDataUrl = canvas.toDataURL('image/png');
                const pngBytes = await fetch(pngDataUrl).then(r => r.arrayBuffer());
                const pngImage = await videoPdf.embedPng(pngBytes);

                // Calculate page dimensions with mini-index
                const imgWidth = pngImage.width / 2;
                const imgHeight = pngImage.height / 2;
                const indexMargin = 20;
                const lineHeight = 14;
                const headerSpace = 25;
                const indexHeight = headerSpace + lineHeight + indexMargin;
                const totalPageHeight = imgHeight + indexHeight;

                // Add page
                const pdfPage = videoPdf.addPage([imgWidth, totalPageHeight]);

                // Draw frame image
                pdfPage.drawImage(pngImage, {
                  x: 0,
                  y: indexHeight,
                  width: imgWidth,
                  height: imgHeight,
                });

                // Mini-index below image
                let indexY = indexHeight - indexMargin;

                pdfPage.drawText(`Frame ${frameIdx + 1}: Track ${trackId} (${timeRange})`, {
                  x: indexMargin,
                  y: indexY,
                  size: 10,
                  font: boldFont,
                  color: rgb(0.3, 0.3, 0.3),
                });
                indexY -= lineHeight + 2;

                const statusText = isRejected ? 'REJECTED' : 'REDACTED';
                const statusColor = isRejected ? rgb(0.8, 0, 0) : rgb(0, 0.5, 0);
                const textColor = isRejected ? rgb(0.8, 0, 0) : rgb(0, 0, 0);

                pdfPage.drawText(`[${footnoteNum}] ${position} - Face`, { x: indexMargin, y: indexY, size: 8, font: font, color: textColor });
                pdfPage.drawText(statusText, { x: indexMargin + 100, y: indexY, size: 8, font: boldFont, color: statusColor });

                if (!isRejected && exemptionCode) {
                  pdfPage.drawText(`${exemptionCode}: ${detection.comment || ''}`, {
                    x: indexMargin + 165,
                    y: indexY,
                    size: 8,
                    font: font,
                    color: rgb(0.3, 0.3, 0.3),
                  });
                } else if (isRejected) {
                  pdfPage.drawText(detection.comment || 'Not redacted', {
                    x: indexMargin + 165,
                    y: indexY,
                    size: 8,
                    font: font,
                    color: rgb(0.5, 0.5, 0.5),
                  });
                }
              }

              // Cleanup video blob URL
              URL.revokeObjectURL(videoBlobUrl);

              // Add summary index page(s)
              if (redactionIndex.length > 0) {
                const pageWidth = 612;
                const pageHeight = 792;
                const margin = 50;
                const lineHeight = 16;
                const headerHeight = 60;
                let currentY = pageHeight - margin - headerHeight;
                let indexPage = videoPdf.addPage([pageWidth, pageHeight]);

                // Header
                indexPage.drawText('VIDEO REDACTION SUMMARY', {
                  x: margin,
                  y: pageHeight - margin - 20,
                  size: 18,
                  font: boldFont,
                });
                indexPage.drawText(`File: ${file.filename}`, {
                  x: margin,
                  y: pageHeight - margin - 40,
                  size: 10,
                  font: font,
                  color: rgb(0.3, 0.3, 0.3),
                });
                indexPage.drawText(`Generated: ${new Date().toLocaleString()}`, {
                  x: margin,
                  y: pageHeight - margin - 52,
                  size: 10,
                  font: font,
                  color: rgb(0.3, 0.3, 0.3),
                });

                // Table header
                currentY -= 10;
                indexPage.drawText('#', { x: margin, y: currentY, size: 10, font: boldFont });
                indexPage.drawText('Frame', { x: margin + 25, y: currentY, size: 10, font: boldFont });
                indexPage.drawText('Track', { x: margin + 65, y: currentY, size: 10, font: boldFont });
                indexPage.drawText('Time Range', { x: margin + 130, y: currentY, size: 10, font: boldFont });
                indexPage.drawText('Decision', { x: margin + 230, y: currentY, size: 10, font: boldFont });
                indexPage.drawText('Exemption', { x: margin + 300, y: currentY, size: 10, font: boldFont });
                indexPage.drawText('Comment', { x: margin + 420, y: currentY, size: 10, font: boldFont });

                currentY -= 5;
                indexPage.drawLine({
                  start: { x: margin, y: currentY },
                  end: { x: pageWidth - margin, y: currentY },
                  thickness: 0.5,
                  color: rgb(0.5, 0.5, 0.5),
                });
                currentY -= lineHeight;

                for (const entry of redactionIndex) {
                  if (currentY < margin + 50) {
                    indexPage = videoPdf.addPage([pageWidth, pageHeight]);
                    currentY = pageHeight - margin - 20;
                    indexPage.drawText('VIDEO REDACTION SUMMARY (continued)', {
                      x: margin,
                      y: currentY,
                      size: 14,
                      font: boldFont,
                    });
                    currentY -= 30;
                  }

                  const isRejected = entry.status === 'rejected';
                  const textColor = isRejected ? rgb(0.8, 0, 0) : rgb(0, 0, 0);
                  const statusColor = isRejected ? rgb(0.8, 0, 0) : rgb(0, 0.5, 0);
                  const statusText = isRejected ? 'REJECTED' : 'REDACTED';

                  indexPage.drawText(`[${entry.footnote}]`, { x: margin, y: currentY, size: 9, font: font, color: textColor });
                  indexPage.drawText(`${entry.frame}`, { x: margin + 25, y: currentY, size: 9, font: font, color: textColor });
                  indexPage.drawText(entry.trackId.substring(0, 10), { x: margin + 65, y: currentY, size: 8, font: font, color: textColor });
                  indexPage.drawText(entry.timeRange, { x: margin + 130, y: currentY, size: 8, font: font, color: textColor });
                  indexPage.drawText(statusText, { x: margin + 230, y: currentY, size: 8, font: boldFont, color: statusColor });

                  if (!isRejected && entry.exemptionCode) {
                    indexPage.drawText(entry.exemptionCode, { x: margin + 300, y: currentY, size: 9, font: boldFont });
                    indexPage.drawText(entry.exemptionLabel.substring(0, 20), { x: margin + 330, y: currentY, size: 7, font: font, color: rgb(0.4, 0.4, 0.4) });
                  } else if (isRejected) {
                    indexPage.drawText('N/A', { x: margin + 300, y: currentY, size: 9, font: font, color: rgb(0.5, 0.5, 0.5) });
                  }

                  // Wrap comment text to fit available width
                  const commentX = margin + 420;
                  const commentMaxWidth = pageWidth - margin - commentX;
                  const commentFontSize = 8;
                  const comment = entry.comment || '';

                  if (comment) {
                    // Simple word wrapping
                    const words = comment.split(' ');
                    let lines: string[] = [];
                    let currentLine = '';

                    for (const word of words) {
                      const testLine = currentLine ? `${currentLine} ${word}` : word;
                      const testWidth = font.widthOfTextAtSize(testLine, commentFontSize);
                      if (testWidth <= commentMaxWidth) {
                        currentLine = testLine;
                      } else {
                        if (currentLine) lines.push(currentLine);
                        currentLine = word;
                      }
                    }
                    if (currentLine) lines.push(currentLine);

                    // Draw each line
                    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
                      indexPage.drawText(lines[lineIdx], { x: commentX, y: currentY, size: commentFontSize, font: font, color: textColor });
                      if (lineIdx < lines.length - 1) currentY -= 10; // smaller spacing for wrapped lines
                    }
                  }

                  currentY -= lineHeight;
                }

                // Final summary
                currentY -= 20;
                if (currentY < margin + 80) {
                  indexPage = videoPdf.addPage([pageWidth, pageHeight]);
                  currentY = pageHeight - margin;
                }

                const approvedCount = redactionIndex.filter(r => r.status === 'approved').length;
                const rejectedCount = redactionIndex.filter(r => r.status === 'rejected').length;

                indexPage.drawText('Summary:', { x: margin, y: currentY, size: 10, font: boldFont });
                currentY -= lineHeight;
                indexPage.drawText(`Total faces tracked: ${redactionIndex.length}`, { x: margin + 10, y: currentY, size: 9, font: font });
                currentY -= lineHeight;
                indexPage.drawText(`Redacted: ${approvedCount}`, { x: margin + 10, y: currentY, size: 9, font: font, color: rgb(0, 0.5, 0) });
                currentY -= lineHeight;
                indexPage.drawText(`Rejected: ${rejectedCount}`, { x: margin + 10, y: currentY, size: 9, font: font, color: rgb(0.8, 0, 0) });
              }

              // Save PDF
              const pdfBytes = await videoPdf.save();
              const baseName = file.filename.replace(/\.[^/.]+$/, '');
              zip.folder('redacted')?.file(`${baseName}_redaction_log.pdf`, pdfBytes);
            }
          } catch (err) {
            console.error(`Error processing video ${file.filename}:`, err);
          }
          continue;
        }

        // Get detections for this file (both approved and rejected for documentation)
        const { detections } = await api.listDetections(file.id);
        const approvedDetections = detections.filter((d: Detection) => d.status === 'approved');
        const rejectedDetections = detections.filter((d: Detection) => d.status === 'rejected');

        // Get original file
        const blob = await api.getFileOriginal(file.id);

        if (file.file_type === 'pdf') {
          // Render PDF with redactions and footnotes
          const arrayBuffer = await blob.arrayBuffer();
          const sourcePdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

          // Create new PDF document
          const outputPdf = await PDFDocument.create();
          const font = await outputPdf.embedFont(StandardFonts.Helvetica);
          const boldFont = await outputPdf.embedFont(StandardFonts.HelveticaBold);

          // Track all redactions for the index
          const redactionIndex: Array<{
            footnote: number;
            page: number;
            position: string;
            detectionType: string;
            status: 'approved' | 'rejected';
            exemptionCode: string;
            exemptionLabel: string;
            comment: string;
          }> = [];
          let footnoteCounter = 1;

          // Process each page
          for (let pageNum = 1; pageNum <= sourcePdf.numPages; pageNum++) {
            const page = await sourcePdf.getPage(pageNum);
            const viewport = page.getViewport({ scale: 2 });
            const canvas = document.createElement('canvas');
            const context = canvas.getContext('2d')!;
            canvas.width = viewport.width;
            canvas.height = viewport.height;

            // Render page
            await page.render({
              canvasContext: context,
              viewport: viewport,
              canvas: canvas,
            } as Parameters<typeof page.render>[0]).promise;

            // Get detections for this page
            const pageApproved = approvedDetections.filter(
              d => d.page_number === pageNum || d.page_number === null
            );
            const pageRejected = rejectedDetections.filter(
              d => d.page_number === pageNum || d.page_number === null
            );

            // Helper to add detection to index
            const addToIndex = (detection: Detection, status: 'approved' | 'rejected') => {
              const footnoteNum = footnoteCounter++;
              const bboxX = detection.bbox_x ?? 0;
              const bboxY = detection.bbox_y ?? 0;
              const vPos = bboxY < 0.33 ? 'upper' : bboxY < 0.66 ? 'middle' : 'lower';
              const hPos = bboxX < 0.33 ? 'left' : bboxX < 0.66 ? 'center' : 'right';
              const position = vPos === 'middle' && hPos === 'center' ? 'center' : `${vPos}-${hPos}`;
              const exemptionCode = (detection.exemption_code || (status === 'approved' ? 'b6' : '')) as ExemptionCode;

              redactionIndex.push({
                footnote: footnoteNum,
                page: pageNum,
                position,
                detectionType: detection.detection_type === 'face' ? 'Face' :
                               detection.detection_type === 'manual' ? 'Manual' : detection.detection_type,
                status,
                exemptionCode: exemptionCode || '',
                exemptionLabel: exemptionCode ? (EXEMPTION_LABELS[exemptionCode] || exemptionCode) : '',
                comment: detection.comment || '',
              });
              return footnoteNum;
            };

            // Draw APPROVED detections (solid black rectangles)
            for (const detection of pageApproved) {
              const x = (detection.bbox_x ?? 0) * canvas.width;
              const y = (detection.bbox_y ?? 0) * canvas.height;
              const w = (detection.bbox_width ?? 0) * canvas.width;
              const h = (detection.bbox_height ?? 0) * canvas.height;

              // Draw solid black redaction rectangle
              context.fillStyle = '#000000';
              context.fillRect(x, y, w, h);

              // Draw footnote marker (white text on black)
              const footnoteNum = addToIndex(detection, 'approved');
              context.fillStyle = '#FFFFFF';
              context.font = 'bold 14px Arial';
              const markerText = `[${footnoteNum}]`;
              const textWidth = context.measureText(markerText).width;
              context.fillText(markerText, x + w - textWidth - 2, y + 14);
            }

            // Draw REJECTED detections (dashed outline, not filled)
            for (const detection of pageRejected) {
              const x = (detection.bbox_x ?? 0) * canvas.width;
              const y = (detection.bbox_y ?? 0) * canvas.height;
              const w = (detection.bbox_width ?? 0) * canvas.width;
              const h = (detection.bbox_height ?? 0) * canvas.height;

              // Draw dashed rectangle outline (red)
              context.strokeStyle = '#CC0000';
              context.lineWidth = 2;
              context.setLineDash([6, 4]);
              context.strokeRect(x, y, w, h);
              context.setLineDash([]); // Reset

              // Draw footnote marker (red text, outside top-right)
              const footnoteNum = addToIndex(detection, 'rejected');
              context.fillStyle = '#CC0000';
              context.font = 'bold 12px Arial';
              const markerText = `[${footnoteNum}]`;
              const textWidth = context.measureText(markerText).width;
              context.fillText(markerText, x + w - textWidth, y - 4);
            }

            // Convert canvas to PNG and embed in PDF
            const pngDataUrl = canvas.toDataURL('image/png');
            const pngBytes = await fetch(pngDataUrl).then(r => r.arrayBuffer());
            const pngImage = await outputPdf.embedPng(pngBytes);

            // Get redactions for this page (for mini-index)
            const pageRedactions = redactionIndex.filter(r => r.page === pageNum);

            // Calculate page dimensions - add space for mini-index if needed
            const imgWidth = pngImage.width / 2;
            const imgHeight = pngImage.height / 2;
            const indexMargin = 20;
            const lineHeight = 14;
            const headerSpace = pageRedactions.length > 0 ? 25 : 0;
            const indexHeight = pageRedactions.length > 0
              ? headerSpace + (pageRedactions.length * lineHeight) + indexMargin
              : 0;
            const totalPageHeight = imgHeight + indexHeight;

            // Add page with room for mini-index below image
            const pdfPage = outputPdf.addPage([imgWidth, totalPageHeight]);

            // Draw image at top (PDF coordinates: y=0 is bottom)
            pdfPage.drawImage(pngImage, {
              x: 0,
              y: indexHeight, // Push image up to make room for index below
              width: imgWidth,
              height: imgHeight,
            });

            // Draw mini-index below the image
            if (pageRedactions.length > 0) {
              let indexY = indexHeight - indexMargin;

              // Mini-index header
              pdfPage.drawText(`Page ${pageNum} Redactions:`, {
                x: indexMargin,
                y: indexY,
                size: 10,
                font: boldFont,
                color: rgb(0.3, 0.3, 0.3),
              });
              indexY -= lineHeight + 2;

              // Draw each redaction entry
              for (const entry of pageRedactions) {
                const isRejected = entry.status === 'rejected';
                const textColor = isRejected ? rgb(0.8, 0, 0) : rgb(0, 0, 0);
                const statusText = isRejected ? 'REJECTED' : 'REDACTED';
                const statusColor = isRejected ? rgb(0.8, 0, 0) : rgb(0, 0.5, 0);

                // Compact format: [#] Location - Type - DECISION - Exemption: Comment
                let entryText = `[${entry.footnote}] ${entry.position} - ${entry.detectionType}`;
                pdfPage.drawText(entryText, { x: indexMargin, y: indexY, size: 8, font: font, color: textColor });

                pdfPage.drawText(statusText, { x: indexMargin + 130, y: indexY, size: 8, font: boldFont, color: statusColor });

                if (!isRejected && entry.exemptionCode) {
                  pdfPage.drawText(`${entry.exemptionCode}: ${entry.comment || ''}`, {
                    x: indexMargin + 195,
                    y: indexY,
                    size: 8,
                    font: font,
                    color: rgb(0.3, 0.3, 0.3),
                  });
                } else if (isRejected) {
                  pdfPage.drawText(entry.comment || 'Not redacted', {
                    x: indexMargin + 195,
                    y: indexY,
                    size: 8,
                    font: font,
                    color: rgb(0.5, 0.5, 0.5),
                  });
                }

                indexY -= lineHeight;
              }
            }
          }

          // Add Redaction Index page(s) if there are redactions
          if (redactionIndex.length > 0) {
            const pageWidth = 612; // Letter size
            const pageHeight = 792;
            const margin = 50;
            const lineHeight = 16;
            const headerHeight = 60;
            let currentY = pageHeight - margin - headerHeight;
            let indexPage = outputPdf.addPage([pageWidth, pageHeight]);

            // Draw header
            indexPage.drawText('REDACTION SUMMARY', {
              x: margin,
              y: pageHeight - margin - 20,
              size: 18,
              font: boldFont,
              color: rgb(0, 0, 0),
            });
            indexPage.drawText(`Document: ${file.filename}`, {
              x: margin,
              y: pageHeight - margin - 40,
              size: 10,
              font: font,
              color: rgb(0.3, 0.3, 0.3),
            });
            indexPage.drawText(`Generated: ${new Date().toLocaleString()}`, {
              x: margin,
              y: pageHeight - margin - 52,
              size: 10,
              font: font,
              color: rgb(0.3, 0.3, 0.3),
            });

            // Draw table header
            currentY -= 10;
            indexPage.drawText('#', { x: margin, y: currentY, size: 10, font: boldFont });
            indexPage.drawText('Page', { x: margin + 30, y: currentY, size: 10, font: boldFont });
            indexPage.drawText('Location', { x: margin + 65, y: currentY, size: 10, font: boldFont });
            indexPage.drawText('Type', { x: margin + 130, y: currentY, size: 10, font: boldFont });
            indexPage.drawText('Decision', { x: margin + 175, y: currentY, size: 10, font: boldFont });
            indexPage.drawText('Exemption', { x: margin + 240, y: currentY, size: 10, font: boldFont });
            indexPage.drawText('Justification', { x: margin + 380, y: currentY, size: 10, font: boldFont });

            currentY -= 5;
            indexPage.drawLine({
              start: { x: margin, y: currentY },
              end: { x: pageWidth - margin, y: currentY },
              thickness: 0.5,
              color: rgb(0.5, 0.5, 0.5),
            });
            currentY -= lineHeight;

            // Draw each redaction entry
            for (const entry of redactionIndex) {
              // Check if we need a new page
              if (currentY < margin + lineHeight) {
                indexPage = outputPdf.addPage([pageWidth, pageHeight]);
                currentY = pageHeight - margin;
                // Redraw header on continuation page
                indexPage.drawText('REDACTION SUMMARY (continued)', {
                  x: margin,
                  y: currentY,
                  size: 14,
                  font: boldFont,
                });
                currentY -= 30;
              }

              const isRejected = entry.status === 'rejected';
              const textColor = isRejected ? rgb(0.8, 0, 0) : rgb(0, 0, 0);

              indexPage.drawText(`[${entry.footnote}]`, { x: margin, y: currentY, size: 9, font: font, color: textColor });
              indexPage.drawText(`${entry.page}`, { x: margin + 30, y: currentY, size: 9, font: font, color: textColor });
              indexPage.drawText(entry.position, { x: margin + 65, y: currentY, size: 9, font: font, color: textColor });
              indexPage.drawText(entry.detectionType, { x: margin + 130, y: currentY, size: 9, font: font, color: textColor });

              // Decision column with color coding
              const decisionText = isRejected ? 'REJECTED' : 'REDACTED';
              const decisionColor = isRejected ? rgb(0.8, 0, 0) : rgb(0, 0.5, 0);
              indexPage.drawText(decisionText, { x: margin + 175, y: currentY, size: 8, font: boldFont, color: decisionColor });

              // Exemption code (only for approved)
              if (!isRejected && entry.exemptionCode) {
                indexPage.drawText(entry.exemptionCode, { x: margin + 240, y: currentY, size: 9, font: boldFont });
                // Truncate exemption label if too long
                const labelText = entry.exemptionLabel.length > 18
                  ? entry.exemptionLabel.substring(0, 16) + '...'
                  : entry.exemptionLabel;
                indexPage.drawText(labelText, { x: margin + 275, y: currentY, size: 7, font: font, color: rgb(0.3, 0.3, 0.3) });
              } else if (isRejected) {
                indexPage.drawText('N/A', { x: margin + 240, y: currentY, size: 9, font: font, color: rgb(0.5, 0.5, 0.5) });
              }

              // Truncate comment if too long
              const commentText = entry.comment.length > 25
                ? entry.comment.substring(0, 23) + '...'
                : entry.comment;
              indexPage.drawText(commentText || (isRejected ? 'Not redacted' : ''), { x: margin + 380, y: currentY, size: 9, font: font, color: textColor });

              currentY -= lineHeight;
            }
          }

          // Save PDF to zip
          const pdfBytes = await outputPdf.save();
          const baseName = file.filename.replace(/\.[^/.]+$/, '');
          zip.folder('redacted')?.file(`${baseName}_redacted.pdf`, pdfBytes);
        } else {
          // For images, render with redactions
          const img = new Image();
          const url = URL.createObjectURL(blob);
          await new Promise<void>((resolve) => {
            img.onload = () => resolve();
            img.src = url;
          });

          const canvas = document.createElement('canvas');
          canvas.width = img.width;
          canvas.height = img.height;
          const context = canvas.getContext('2d')!;
          context.drawImage(img, 0, 0);

          // Draw redactions
          context.fillStyle = '#000000';
          for (const detection of approvedDetections) {
            const x = (detection.bbox_x ?? 0) * canvas.width;
            const y = (detection.bbox_y ?? 0) * canvas.height;
            const w = (detection.bbox_width ?? 0) * canvas.width;
            const h = (detection.bbox_height ?? 0) * canvas.height;
            context.fillRect(x, y, w, h);
          }

          const redactedBlob = await new Promise<Blob>((resolve) => {
            canvas.toBlob((b) => resolve(b!), 'image/png');
          });
          const baseName = file.filename.replace(/\.[^/.]+$/, '');
          zip.folder('redacted')?.file(`${baseName}_redacted.png`, redactedBlob);
          URL.revokeObjectURL(url);
        }
      }

      // Add audit trail
      const { audit_logs } = await api.getRequestAuditLogs(request.id);
      const auditText = [
        `Audit Trail for ${request.request_number}`,
        `Generated: ${new Date().toISOString()}`,
        '',
        ...audit_logs.map(log => {
          const date = new Date(log.created_at < 1e12 ? log.created_at * 1000 : log.created_at);
          return `[${date.toISOString()}] ${log.user_name || 'System'}: ${log.action} ${log.entity_type}${log.details ? ` - ${log.details}` : ''}`;
        })
      ].join('\n');
      zip.file('audit_trail.txt', auditText);

      // Generate and download zip
      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const fileName = (request.title || request.request_number).replace(/[^a-zA-Z0-9-_]/g, '_');
      saveAs(zipBlob, `${fileName}_redacted.zip`);
    } catch (err) {
      console.error('Failed to generate export:', err);
      setErrorMessage('Failed to generate export. Please try again.');
      setTimeout(() => setErrorMessage(null), 5000);
    } finally {
      setDownloadingId(null);
      setDownloadProgress(null);
    }
  };

  // Filtering is now done server-side
  const filteredRequests = requests;

  const formatDate = (timestamp: number) => {
    // Handle timestamps in seconds vs milliseconds
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    return new Date(ms).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      new: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  const getDueDateStatus = (request: Request) => {
    if (!request.due_date) return null;
    if (request.tolled_at) {
      return { label: 'Tolled', className: 'bg-gray-200 text-gray-700' };
    }
    const now = Date.now();
    const dueDate = request.due_date < 1e12 ? request.due_date * 1000 : request.due_date;
    const daysRemaining = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return { label: `${Math.abs(daysRemaining)}d overdue`, className: 'bg-red-600 text-white' };
    } else if (daysRemaining === 0) {
      return { label: 'Due today', className: 'bg-orange-500 text-white' };
    } else if (daysRemaining <= 3) {
      return { label: `${daysRemaining}d left`, className: 'bg-yellow-500 text-white' };
    } else if (daysRemaining <= 5) {
      return { label: `${daysRemaining}d left`, className: 'bg-yellow-400 text-gray-900' };
    } else {
      return { label: `${daysRemaining}d left`, className: 'bg-green-100 text-green-800' };
    }
  };

  const highlightMatch = (text: string) => {
    if (!searchTerm.trim()) return text;
    const regex = new RegExp(`(${searchTerm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    return parts.map((part, i) =>
      regex.test(part) ? (
        <mark key={i} className="bg-yellow-300 rounded px-0.5">{part}</mark>
      ) : (
        part
      )
    );
  };

  const handleDelete = (id: string) => {
    if (deleteConfirm === id) {
      // Start animation
      setAnimatingIds(prev => new Set(prev).add(id));
      setDeleteConfirm(null);
      // Call API optimistically (don't wait)
      onDelete?.(id);
      // Remove after animation
      setTimeout(() => {
        setRemovedIds(prev => new Set(prev).add(id));
        setAnimatingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
    } else {
      setDeleteConfirm(id);
      setArchiveConfirm(null); // Cancel any pending archive
    }
  };

  const handleArchive = (id: string) => {
    if (archiveConfirm === id) {
      // Start animation
      setAnimatingIds(prev => new Set(prev).add(id));
      setArchiveConfirm(null);
      // Call API optimistically (don't wait)
      onArchive?.(id);
      // Remove after animation
      setTimeout(() => {
        setRemovedIds(prev => new Set(prev).add(id));
        setAnimatingIds(prev => {
          const next = new Set(prev);
          next.delete(id);
          return next;
        });
      }, 300);
    } else {
      setArchiveConfirm(id);
      setDeleteConfirm(null); // Cancel any pending delete
    }
  };

  const handleUnarchive = async (id: string) => {
    // Start animation
    setAnimatingIds(prev => new Set(prev).add(id));

    // Remove from view after animation, then restore
    setTimeout(async () => {
      setRemovedIds(prev => new Set(prev).add(id));
      setAnimatingIds(prev => {
        const next = new Set(prev);
        next.delete(id);
        return next;
      });
      // Call restore handler after animation completes
      await onRestoreRequest?.(id);
    }, 300);
  };

  const handleCopyToNewRequest = async () => {
    if (!copyFromRequest) return;

    setIsCopying(true);
    setCopyResult(null);

    try {
      // Create new request with reference to original
      // Strip existing "Re-release: " prefix to avoid "Re-release: Re-release: ..."
      const baseTitle = (copyFromRequest.title || copyFromRequest.request_number).replace(/^Re-release:\s*/i, '');
      const newTitle = `Re-release: ${baseTitle}`;
      const newNotes = `Re-release per court order. Original request: ${copyFromRequest.request_number}`;

      const response = await fetch(
        `${import.meta.env.VITE_API_URL || 'https://redact-1-worker.joelstevick.workers.dev'}/api/requests`,
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${await api.getToken()}`,
          },
          body: JSON.stringify({
            title: newTitle,
            notes: newNotes,
            request_date: Date.now(),
          }),
        }
      );

      if (!response.ok) {
        throw new Error('Failed to create new request');
      }

      const { request: newRequest } = await response.json();

      // Copy files from original request
      const { count } = await api.copyFilesFromRequest(newRequest.id, copyFromRequest.id);

      setCopyResult({
        success: true,
        newRequestId: newRequest.id,
        filesCopied: count,
      });

      // Close modal, switch to requests tab, and refresh
      setCopyFromRequest(null);
      onSwitchToRequests?.();
      onRequestUpdated?.();
    } catch (err) {
      setCopyResult({
        success: false,
        error: err instanceof Error ? err.message : 'Failed to copy request',
      });
    } finally {
      setIsCopying(false);
    }
  };

  const openAuditModal = async (e: React.MouseEvent, request: Request) => {
    e.stopPropagation();
    setAuditModalRequest(request);
    setLoadingAuditLogs(true);
    try {
      const { audit_logs } = await api.getRequestAuditLogs(request.id);
      // Sort by recency (most recent first)
      const sorted = [...audit_logs].sort((a, b) => b.created_at - a.created_at);
      setAuditLogs(sorted);
    } catch (err) {
      console.error('Failed to load audit logs:', err);
      setAuditLogs([]);
    } finally {
      setLoadingAuditLogs(false);
    }
  };

  const closeAuditModal = () => {
    setAuditModalRequest(null);
    setAuditLogs([]);
  };

  const startEditingTitle = (e: React.MouseEvent, request: Request) => {
    e.stopPropagation();
    setEditingId(request.id);
    setEditingTitle(request.title || '');
  };

  const saveTitle = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    try {
      await api.updateRequest(id, { title: editingTitle });
      setEditingId(null);
      onRequestUpdated?.();
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  };

  const cancelEditingTitle = (e: React.MouseEvent) => {
    e.stopPropagation();
    setEditingId(null);
    setEditingTitle('');
  };

  // Calculate list height based on container
  useEffect(() => {
    const updateHeight = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        // Leave space for header, search, and indicator
        setListHeight(Math.max(400, window.innerHeight - rect.top - 20));
      }
    };
    updateHeight();
    window.addEventListener('resize', updateHeight);
    return () => window.removeEventListener('resize', updateHeight);
  }, []);

  // Infinite scroll - load more when scrolling near bottom
  const handleScroll = useCallback((props: ListOnScrollProps) => {
    if (props.scrollUpdateWasRequested) return;
    const totalHeight = filteredRequests.length * 160; // approximate row height
    const threshold = listHeight + 200;
    if (props.scrollOffset + threshold >= totalHeight && !isLoadingMore && filteredRequests.length < total) {
      onLoadMore();
    }
  }, [filteredRequests.length, listHeight, isLoadingMore, total, onLoadMore]);

  // Filter out removed items, keep animating ones visible
  const visibleRequests = filteredRequests.filter(r => !removedIds.has(r.id));

  // Row renderer for virtual list
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const request = visibleRequests[index];
    if (!request) return null;

    const isAnimating = animatingIds.has(request.id);

    return (
      <div style={{ ...style, paddingBottom: 8 }} className={isAnimating ? 'animate-fade-out' : ''}>
        <div
          className={`bg-card-white rounded-lg border p-4 cursor-pointer transition-all shadow-sm hover:shadow-md h-[144px] ${
            selectedId === request.id
              ? 'border-blue-500 ring-2 ring-blue-100 shadow-md'
              : 'border-slate-200 hover:border-slate-300'
          }`}
          onClick={() => onSelect(request)}
        >
          <div className="flex justify-between items-start">
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-1">
                <span className="font-semibold text-blue-600">
                  {highlightMatch(request.request_number)}
                </span>
                <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusBadge(request.status)}`}>
                  {request.status.replace('_', ' ')}
                </span>
                {(request.file_count ?? 0) > 0 && (
                  <span
                    className={`px-2 py-0.5 text-xs rounded-full ${
                      (request.files_completed ?? 0) === (request.file_count ?? 0)
                        ? 'bg-green-700 text-white'
                        : 'bg-gray-200 text-gray-700'
                    }`}
                    title={`${request.files_completed ?? 0} of ${request.file_count} file${request.file_count !== 1 ? 's' : ''} reviewed`}
                  >
                    {request.files_completed ?? 0}/{request.file_count} file{request.file_count !== 1 ? 's' : ''}
                  </span>
                )}
                {(() => {
                  const dueStatus = getDueDateStatus(request);
                  return dueStatus ? (
                    <span
                      className={`px-2 py-0.5 text-xs rounded-full ${dueStatus.className}`}
                      title={request.due_date ? `Due: ${formatDate(request.due_date)}` : ''}
                    >
                      {dueStatus.label}
                    </span>
                  ) : null;
                })()}
              </div>
              {editingId === request.id ? (
                <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                  <input
                    type="text"
                    value={editingTitle}
                    onChange={(e) => setEditingTitle(e.target.value)}
                    className="flex-1 px-2 py-1 text-sm border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                    placeholder="Add title..."
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') saveTitle(e as unknown as React.MouseEvent, request.id);
                      if (e.key === 'Escape') cancelEditingTitle(e as unknown as React.MouseEvent);
                    }}
                  />
                  <button
                    onClick={(e) => saveTitle(e, request.id)}
                    className="p-1 text-green-600 hover:text-green-700"
                    title="Save"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                  <button
                    onClick={cancelEditingTitle}
                    className="p-1 text-red-600 hover:text-red-700"
                    title="Cancel"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ) : (
                <p
                  className={`${request.title ? 'text-gray-900' : 'text-gray-400 italic'} hover:text-blue-600 cursor-text`}
                  onClick={(e) => startEditingTitle(e, request)}
                  title="Click to edit title"
                >
                  {request.title ? highlightMatch(request.title) : 'Add title...'}
                </p>
              )}
              {request.notes && (
                <p className="text-sm text-gray-500 mt-1 italic truncate" title={request.notes}>
                  {request.notes}
                </p>
              )}
              <p className="text-sm text-gray-500 mt-1">
                <span title="Date request was received">Received: {formatDate(request.request_date)}</span>
                {request.due_date && (
                  <span className="ml-3" title="Response due date">Due: {formatDate(request.due_date)}</span>
                )}
              </p>
              <div className="mt-2" onClick={(e) => e.stopPropagation()}>
                <select
                  value={request.created_by}
                  onChange={(e) => handleAssignmentChange(e, request.id)}
                  disabled={assigningId === request.id}
                  className="text-sm px-2 py-1 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
                >
                  {users.map((user) => (
                    <option key={user.id} value={user.id}>
                      {user.name}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="flex gap-1 ml-4">
              {!showArchived && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onSelect(request);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600"
                  title="Edit"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
                  </svg>
                </button>
              )}
              <button
                onClick={(e) => openAuditModal(e, request)}
                className="p-2 text-gray-400 hover:text-purple-600"
                title="View Audit Trail"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                </svg>
              </button>
              {downloadingId === request.id && downloadProgress ? (
                <div className="flex items-center gap-2 px-2 py-1 bg-blue-100 rounded-lg">
                  <svg className="w-4 h-4 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <span className="text-xs text-blue-700">{downloadProgress.current}/{downloadProgress.total}</span>
                </div>
              ) : (
                <button
                  onClick={(e) => handleDownload(e, request)}
                  disabled={downloadingId === request.id || !downloadReadyMap[request.id]}
                  className="p-2 text-gray-400 hover:text-green-600 disabled:opacity-50 disabled:cursor-not-allowed"
                  title={downloadReadyMap[request.id] ? 'Download Redacted Files' : 'Complete review to enable download'}
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
                  </svg>
                </button>
              )}
              {showArchived ? (
                <>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleUnarchive(request.id);
                    }}
                    className="p-2 text-gray-400 hover:text-blue-600"
                    title="Restore"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                    </svg>
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setCopyFromRequest(request);
                    }}
                    className="p-2 text-gray-400 hover:text-purple-600"
                    title="Re-release"
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                  </button>
                </>
              ) : archiveConfirm === request.id ? (
                <div className="flex items-center bg-yellow-500 rounded-full shadow-sm" title="Archive">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setArchiveConfirm(null);
                    }}
                    className="p-1.5 text-white hover:bg-yellow-600 rounded-l-full"
                    title="Cancel"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="w-px h-4 bg-yellow-400" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleArchive(request.id);
                    }}
                    className="p-1.5 text-white hover:bg-yellow-600 rounded-r-full"
                    title="Confirm archive"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleArchive(request.id);
                  }}
                  className="p-2 text-gray-400 hover:text-yellow-600"
                  title="Archive"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                  </svg>
                </button>
              )}
              {deleteConfirm === request.id ? (
                <div className="flex items-center bg-red-500 rounded-full shadow-sm" title="Delete">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      setDeleteConfirm(null);
                    }}
                    className="p-1.5 text-white hover:bg-red-600 rounded-l-full"
                    title="Cancel"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                  <div className="w-px h-4 bg-red-400" />
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(request.id);
                    }}
                    className="p-1.5 text-white hover:bg-red-600 rounded-r-full"
                    title="Confirm delete"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                    </svg>
                  </button>
                </div>
              ) : (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    handleDelete(request.id);
                  }}
                  className="p-2 text-gray-400 hover:text-red-600"
                  title="Delete"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                  </svg>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  }, [visibleRequests, selectedId, editingId, editingTitle, deleteConfirm, archiveConfirm, assigningId, users, downloadReadyMap, downloadingId, downloadProgress, showArchived, searchTerm, animatingIds, onSelect, onArchive, onUnarchive, onDelete, onRequestUpdated, openAuditModal]);

  return (
    <div className="p-6 bg-pastel-blue min-h-full">
      {/* Error Toast */}
      {errorMessage && (
        <div className="fixed top-4 right-4 bg-red-500 text-white px-4 py-3 rounded-lg shadow-lg z-50 flex items-center gap-3">
          <span>{errorMessage}</span>
          <button
            onClick={() => setErrorMessage(null)}
            className="text-white hover:text-red-200"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      )}

      {/* Audit Trail Modal */}
      {auditModalRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={closeAuditModal}>
          <div className="bg-white rounded-lg shadow-xl max-w-2xl w-full mx-4 max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">
                Audit Trail - {auditModalRequest.request_number}
              </h3>
              <button
                onClick={closeAuditModal}
                className="p-1 text-gray-400 hover:text-gray-600"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4">
              {loadingAuditLogs ? (
                <div className="flex items-center justify-center py-8">
                  <svg className="w-6 h-6 animate-spin text-blue-600" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                </div>
              ) : auditLogs.length === 0 ? (
                <p className="text-gray-500 text-center py-8">No audit logs found.</p>
              ) : (
                <div className="space-y-2">
                  {auditLogs.map((log) => {
                    const date = new Date(log.created_at < 1e12 ? log.created_at * 1000 : log.created_at);
                    return (
                      <div key={log.id} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                        <div className="flex justify-between items-start">
                          <span className="font-medium text-gray-900">
                            {log.user_name || 'System'}
                          </span>
                          <span className="text-xs text-gray-400">
                            {date.toLocaleDateString()}
                          </span>
                        </div>
                        <p className="text-gray-600">
                          {log.action.split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join('_')} {log.entity_type}
                          {(() => {
                            try {
                              const details = log.details ? JSON.parse(log.details) : {};
                              const parts = [];
                              // File context
                              if (details.filename) parts.push(`"${details.filename}"`);
                              if (details.old_filename && details.new_filename) {
                                parts.push(`"${details.old_filename}" → "${details.new_filename}"`);
                              }
                              // Detection context
                              if (details.detection_type) {
                                const detDesc = details.detection_type === 'face' ? 'Face' :
                                               details.detection_type === 'manual' ? 'Manual redaction' : details.detection_type;
                                const pageInfo = details.page_number ? ` on page ${details.page_number}` : '';
                                const posInfo = details.position ? ` (${details.position})` : '';
                                const newPosInfo = details.new_position ? ` moved to ${details.new_position}` : '';
                                parts.push(`${detDesc}${pageInfo}${posInfo}${newPosInfo}`);
                              }
                              // Video track context
                              if (details.track_id) parts.push(`track: ${details.track_id}`);
                              // Status and code
                              if (details.status) parts.push(`${details.status}`);
                              if (details.exemption_code) parts.push(`code: ${details.exemption_code}`);
                              if (details.count !== undefined) parts.push(`${details.count} detections`);
                              // Note/comment
                              if (details.comment) parts.push(`note: "${details.comment}"`);
                              else if (details.status) parts.push(`note: ""`);
                              return parts.length > 0 ? (
                                <span className="text-gray-400 ml-1">- {parts.join(', ')}</span>
                              ) : null;
                            } catch {
                              return log.details ? (
                                <span className="text-gray-400 ml-1">- {log.details}</span>
                              ) : null;
                            }
                          })()}
                        </p>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Copy to New Request Modal */}
      {copyFromRequest && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50" onClick={() => !isCopying && setCopyFromRequest(null)}>
          <div className="bg-white rounded-lg shadow-xl max-w-md w-full mx-4" onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-center p-4 border-b">
              <h3 className="text-lg font-semibold">Re-release Request</h3>
              {!isCopying && (
                <button
                  onClick={() => setCopyFromRequest(null)}
                  className="p-1 text-gray-400 hover:text-gray-600"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>
            <div className="p-4">
              {copyResult ? (
                copyResult.success ? (
                  <div className="text-center">
                    <div className="text-green-600 mb-2">
                      <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                      </svg>
                    </div>
                    <p className="text-lg font-semibold mb-2">Request Created</p>
                    <p className="text-gray-600 mb-4">
                      {copyResult.filesCopied} file{copyResult.filesCopied !== 1 ? 's' : ''} copied to new request
                    </p>
                    <button
                      onClick={() => {
                        setCopyFromRequest(null);
                        setCopyResult(null);
                      }}
                      className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Done
                    </button>
                  </div>
                ) : (
                  <div className="text-center">
                    <div className="text-red-600 mb-2">
                      <svg className="w-12 h-12 mx-auto" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                      </svg>
                    </div>
                    <p className="text-lg font-semibold mb-2">Failed</p>
                    <p className="text-gray-600 mb-4">{copyResult.error}</p>
                    <button
                      onClick={() => setCopyResult(null)}
                      className="px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700"
                    >
                      Try Again
                    </button>
                  </div>
                )
              ) : isCopying ? (
                <div className="text-center py-4">
                  <svg className="w-8 h-8 animate-spin mx-auto text-blue-600 mb-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                  </svg>
                  <p className="text-gray-600">Creating new request and copying files...</p>
                </div>
              ) : (
                <>
                  <p className="text-gray-600 mb-4">
                    This will create a new request with copies of all files from:
                  </p>
                  <div className="bg-gray-50 rounded-lg p-3 mb-4">
                    <p className="font-semibold">{copyFromRequest.request_number}</p>
                    {copyFromRequest.title && (
                      <p className="text-sm text-gray-600">{copyFromRequest.title}</p>
                    )}
                  </div>
                  <p className="text-sm text-gray-500 mb-4">
                    Files will be copied to the new request without any redaction decisions.
                    You will need to review and make new redaction decisions.
                  </p>
                  <div className="flex gap-3">
                    <button
                      onClick={() => setCopyFromRequest(null)}
                      className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                    >
                      Cancel
                    </button>
                    <button
                      onClick={handleCopyToNewRequest}
                      className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700"
                    >
                      Create Re-release
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <h2 className="text-2xl font-bold">
          {showArchived ? 'Archived Requests' : 'Records Requests'}
        </h2>
        {!showArchived && (
          <button
            onClick={onNewRequest}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            New Request
          </button>
        )}
      </div>

      {/* Search and Filter */}
      <div className="mb-4 flex gap-3">
        <input
          type="text"
          placeholder="Search requests..."
          value={searchTerm}
          onChange={(e) => onSearchChange(e.target.value)}
          className="flex-1 px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={assigneeFilter}
          onChange={(e) => onAssigneeFilterChange(e.target.value)}
          className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white"
        >
          <option value="">All Assignees</option>
          {users.map((user) => (
            <option key={user.id} value={user.id}>
              {user.name}
            </option>
          ))}
        </select>
      </div>

      {/* Loaded indicator */}
      {total > 0 && (
        <div className="mb-2 text-sm text-gray-600 flex items-center gap-2">
          <span>{filteredRequests.length} of {total} requests loaded</span>
          {isLoadingMore && (
            <svg className="w-4 h-4 animate-spin" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
            </svg>
          )}
        </div>
      )}

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : visibleRequests.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchTerm ? 'No matching requests found.' : 'No requests yet.'}
        </div>
      ) : (
        <div ref={containerRef}>
          <List
            height={listHeight}
            itemCount={visibleRequests.length}
            itemSize={160}
            width="100%"
            onScroll={handleScroll}
          >
            {Row}
          </List>
        </div>
      )}
    </div>
  );
}
