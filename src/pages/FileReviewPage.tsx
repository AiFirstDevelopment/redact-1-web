import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate, useSearchParams } from 'react-router-dom';
import { Stage, Layer, Image as KonvaImage, Rect, Circle, Group } from 'react-konva';
import Konva from 'konva';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useDetectionStore } from '../stores/detectionStore';
import { api } from '../services/api';
import { ExemptionCode, EXEMPTION_LABELS, DEFAULT_EXEMPTION_CODES, Detection } from '../types';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = pdfjsWorker;

// PII Detection Patterns (matching desktop app)
const PII_PATTERNS = {
  ssn: /\b\d{3}-\d{2}-\d{4}\b/g,
  phone: /(\(\d{3}\)\s?|\b\d{3}[-.])\d{3}[-.]?\d{4}\b/g,
  email: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g,
  dob: /\b(0[1-9]|1[0-2])[/\-](0[1-9]|[12]\d|3[01])[/\-](19|20)\d{2}\b/g,
  address: /\b\d+\s+[\w\s]+(?:Street|St|Avenue|Ave|Road|Rd|Boulevard|Blvd|Drive|Dr|Lane|Ln|Court|Ct|Way|Place|Pl)\.?\b/gi,
  plate: /\b[A-Z]{2,4}[-\s]?\d{2,5}\b|\b\d{1,3}[-\s]?[A-Z]{2,4}[-\s]?\d{1,4}\b/gi,
};

interface TextItem {
  str: string;
  transform: number[];
  width: number;
  height: number;
}

interface PiiMatch {
  type: string;
  text: string;
  bbox: { x: number; y: number; width: number; height: number };
}

export function FileReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const requestId = searchParams.get('request');
  const { detections, isLoading, error, fetchDetections } = useDetectionStore();
  const [image, setImage] = useState<HTMLImageElement | HTMLCanvasElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [currentPage, setCurrentPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [pdfDoc, setPdfDoc] = useState<pdfjsLib.PDFDocumentProxy | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [drawStart, setDrawStart] = useState<{ x: number; y: number } | null>(null);
  const [drawRect, setDrawRect] = useState<{ x: number; y: number; width: number; height: number } | null>(null);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [modalMessage, setModalMessage] = useState<string | null>(null);
  const [localDetections, setLocalDetections] = useState<Array<{
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
  }>>([]);
  const [selectedDetectionId, setSelectedDetectionId] = useState<string | null>(null);
  const [toolbarExemptionCode, setToolbarExemptionCode] = useState<ExemptionCode>('b6');
  const [toolbarComment, setToolbarComment] = useState('');
  const [isSaving, setIsSaving] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);

  const calculateDimensions = useCallback((imgWidth: number, imgHeight: number) => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 48;
    const containerHeight = containerRef.current.clientHeight - 48;

    const scaleX = containerWidth / imgWidth;
    const scaleY = containerHeight / imgHeight;
    const newScale = Math.min(scaleX, scaleY, 1);

    setDimensions({
      width: imgWidth * newScale,
      height: imgHeight * newScale,
    });
  }, []);

  const renderPdfPage = useCallback(async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number) => {
    const page = await pdf.getPage(pageNum);
    const viewport = page.getViewport({ scale: 2 });

    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d')!;
    canvas.width = viewport.width;
    canvas.height = viewport.height;

    await page.render({
      canvasContext: context,
      viewport: viewport,
      canvas: canvas,
    } as Parameters<typeof page.render>[0]).promise;

    setImage(canvas);
    calculateDimensions(canvas.width, canvas.height);
  }, [calculateDimensions]);

  useEffect(() => {
    if (id) {
      fetchDetections(id);
      loadFile(id);
    }
  }, [id, fetchDetections]);

  const loadFile = async (fileId: string) => {
    try {
      setImageError(null);
      const blob = await api.getFileOriginal(fileId);
      const isPdf = blob.type === 'application/pdf';

      if (isPdf) {
        const arrayBuffer = await blob.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        setPdfDoc(pdf);
        setTotalPages(pdf.numPages);
        await renderPdfPage(pdf, 1);
      } else {
        const url = URL.createObjectURL(blob);
        const img = new window.Image();
        img.onload = () => {
          setImage(img);
          calculateDimensions(img.width, img.height);
        };
        img.onerror = () => {
          setImageError('Failed to decode image');
        };
        img.src = url;
      }
    } catch (e) {
      console.error('Failed to load file:', e);
      setImageError(e instanceof Error ? e.message : 'Failed to load file');
    }
  };

  const handlePageChange = async (newPage: number) => {
    if (pdfDoc && newPage >= 1 && newPage <= totalPages) {
      setCurrentPage(newPage);
      await renderPdfPage(pdfDoc, newPage);
    }
  };

  const [detectingPage, setDetectingPage] = useState<number | null>(null);

  // Extract text with positions and detect PII
  const detectPiiInPage = async (pdf: pdfjsLib.PDFDocumentProxy, pageNum: number): Promise<PiiMatch[]> => {
    const page = await pdf.getPage(pageNum);
    const textContent = await page.getTextContent();
    const viewport = page.getViewport({ scale: 1 });

    const matches: PiiMatch[] = [];
    const items = textContent.items as TextItem[];

    // Build full text and track positions
    const textWithPositions: { text: string; item: TextItem; index: number }[] = [];
    let fullText = '';

    for (const item of items) {
      if (!item.str) continue;
      textWithPositions.push({ text: item.str, item, index: fullText.length });
      fullText += item.str + ' ';
    }

    // Run each pattern
    for (const [type, pattern] of Object.entries(PII_PATTERNS)) {
      // Reset regex lastIndex
      pattern.lastIndex = 0;
      let match;

      while ((match = pattern.exec(fullText)) !== null) {
        // Find which text items contain this match
        const matchStart = match.index;
        const matchEnd = matchStart + match[0].length;

        // Find overlapping items
        let minX = Infinity, minY = Infinity, maxX = 0, maxY = 0;
        let found = false;

        for (const { text, item, index } of textWithPositions) {
          const itemEnd = index + text.length;

          // Check if this item overlaps with the match
          if (index < matchEnd && itemEnd > matchStart) {
            found = true;
            const transform = item.transform;
            const x = transform[4];
            const y = transform[5];
            const width = item.width || text.length * 8; // Estimate if no width
            const height = item.height || 12; // Default height

            minX = Math.min(minX, x);
            minY = Math.min(minY, y);
            maxX = Math.max(maxX, x + width);
            maxY = Math.max(maxY, y + height);
          }
        }

        if (found && maxX > minX && maxY > minY) {
          // Convert to normalized coordinates (0-1)
          // PDF coordinates: origin at bottom-left, Y increases upward
          // We need: origin at top-left, Y increases downward
          matches.push({
            type,
            text: match[0],
            bbox: {
              x: minX / viewport.width,
              y: 1 - (maxY / viewport.height), // Flip Y
              width: (maxX - minX) / viewport.width,
              height: (maxY - minY) / viewport.height,
            },
          });
        }
      }
    }

    return matches;
  };

  const handleDetect = async () => {
    if (!id) return;

    try {
      console.log('[Detection] Starting detection for file:', id);
      const newLocalDetections: typeof localDetections = [];

      if (pdfDoc) {
        // Process ALL pages of the PDF
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          setDetectingPage(pageNum);
          console.log(`[Detection] Processing page ${pageNum} of ${totalPages}`);

          // 1. Run client-side PII text detection - add to local state
          const piiMatches = await detectPiiInPage(pdfDoc, pageNum);
          console.log(`[Detection] Found ${piiMatches.length} PII matches on page ${pageNum}`);

          for (const match of piiMatches) {
            newLocalDetections.push({
              id: `local-${Date.now()}-${Math.random()}`,
              detection_type: match.type,
              bbox_x: match.bbox.x,
              bbox_y: match.bbox.y,
              bbox_width: match.bbox.width,
              bbox_height: match.bbox.height,
              page_number: pageNum,
              status: 'pending',
              exemption_code: null,
              comment: null,
            });
          }

          // 2. Render page to canvas for face detection
          const page = await pdfDoc.getPage(pageNum);
          const viewport = page.getViewport({ scale: 2 });
          const canvas = document.createElement('canvas');
          const context = canvas.getContext('2d')!;
          canvas.width = viewport.width;
          canvas.height = viewport.height;

          await page.render({
            canvasContext: context,
            viewport: viewport,
            canvas: canvas,
          } as Parameters<typeof page.render>[0]).promise;

          // Convert to blob and send for face detection (server-side)
          const pageBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Failed to convert canvas to blob'));
            }, 'image/png');
          });

          // Call face detection API and add results to local state
          const faceResult = await api.detectFaces(id, pageBlob, pageNum);
          for (const detection of faceResult.detections) {
            newLocalDetections.push({
              id: `local-${Date.now()}-${Math.random()}`,
              detection_type: detection.detection_type,
              bbox_x: detection.bbox_x ?? 0,
              bbox_y: detection.bbox_y ?? 0,
              bbox_width: detection.bbox_width ?? 0,
              bbox_height: detection.bbox_height ?? 0,
              page_number: pageNum,
              status: 'pending',
              exemption_code: null,
              comment: null,
            });
          }
        }
        setDetectingPage(null);
      } else {
        // Single image - face detection only
        const faceResult = await api.detectFaces(id);
        for (const detection of faceResult.detections) {
          newLocalDetections.push({
            id: `local-${Date.now()}-${Math.random()}`,
            detection_type: detection.detection_type,
            bbox_x: detection.bbox_x ?? 0,
            bbox_y: detection.bbox_y ?? 0,
            bbox_width: detection.bbox_width ?? 0,
            bbox_height: detection.bbox_height ?? 0,
            page_number: null,
            status: 'pending',
            exemption_code: null,
            comment: null,
          });
        }
      }

      setLocalDetections(prev => [...prev, ...newLocalDetections]);
      console.log('[Detection] Detection complete, added', newLocalDetections.length, 'local detections');
      setHasUnsavedChanges(true);
    } catch (e) {
      console.error('[Detection] Detection failed:', e);
      setDetectingPage(null);
      setModalMessage(`Detection failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  // Click on detection = select it and show toolbar
  const handleDetectionClick = (detectionId: string, detectionType: string, _status: string, exemptionCode: string | null, comment: string | null) => {
    setSelectedDetectionId(detectionId);
    // Set toolbar defaults based on detection type or existing values
    const defaultCode = DEFAULT_EXEMPTION_CODES[detectionType as Detection['detection_type']] || 'b6';
    setToolbarExemptionCode((exemptionCode as ExemptionCode) || defaultCode);
    setToolbarComment(comment || '');
  };

  // Handle approve from toolbar
  const handleToolbarApprove = () => {
    if (!selectedDetectionId) return;

    // Check if it's a local detection
    const localDetection = localDetections.find(d => d.id === selectedDetectionId);
    if (localDetection) {
      setLocalDetections(prev => prev.map(d =>
        d.id === selectedDetectionId
          ? { ...d, status: 'approved', exemption_code: toolbarExemptionCode, comment: toolbarComment || null }
          : d
      ));
    }
    // Note: Server detections are not handled here since they're already saved

    setSelectedDetectionId(null);
    setHasUnsavedChanges(true);
  };

  // Handle reject from toolbar
  const handleToolbarReject = () => {
    if (!selectedDetectionId) return;

    // Check if it's a local detection
    const localDetection = localDetections.find(d => d.id === selectedDetectionId);
    if (localDetection) {
      setLocalDetections(prev => prev.filter(d => d.id !== selectedDetectionId));
    }

    setSelectedDetectionId(null);
    setHasUnsavedChanges(true);
  };

  // Deselect when clicking elsewhere
  const handleStageClick = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only deselect if clicking on background, not on a detection
    if (e.target === e.target.getStage() || e.target.getClassName() === 'Image') {
      setSelectedDetectionId(null);
    }
  };

  const goBackToRequest = () => {
    if (requestId) {
      navigate(`/?request=${requestId}`);
    } else {
      navigate('/');
    }
  };

  const handleClose = () => {
    goBackToRequest();
  };

  const handleMarkNoRedactionsNeeded = async () => {
    if (!id) return;
    try {
      await api.markFileReviewed(id);
      setModalMessage('File marked as reviewed - no redactions needed');
      setTimeout(() => goBackToRequest(), 1500);
    } catch (e) {
      setModalMessage('Failed to mark file as reviewed');
    }
  };

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleCancel = async () => {
    if (hasUnsavedChanges) {
      setShowCancelConfirm(true);
    } else {
      goBackToRequest();
    }
  };

  const handleSave = async () => {
    if (!id) return;
    setIsSaving(true);

    try {
      // Persist local detections to the API
      for (const detection of localDetections) {
        await api.createDetection(id, {
          detection_type: detection.detection_type,
          bbox_x: detection.bbox_x,
          bbox_y: detection.bbox_y,
          bbox_width: detection.bbox_width,
          bbox_height: detection.bbox_height,
          page_number: detection.page_number ?? undefined,
          status: detection.status,
          exemption_code: detection.exemption_code ?? undefined,
          comment: detection.comment ?? undefined,
        });
      }

      // Clear local detections and navigate back
      setLocalDetections([]);
      setHasUnsavedChanges(false);
      setModalMessage('Changes saved successfully');
      setTimeout(() => goBackToRequest(), 1000);
    } catch (e) {
      console.error('Failed to save:', e);
      setModalMessage('Failed to save changes');
      setIsSaving(false);
    }
  };

  // Drawing handlers - always enabled, starts when clicking empty space
  const handleStageMouseDown = (e: Konva.KonvaEventObject<MouseEvent>) => {
    // Only start drawing if clicking on the image/stage itself, not on a detection rect
    if (e.target !== e.target.getStage() && e.target.getClassName() !== 'Image') return;

    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    setIsDrawing(true);
    setDrawStart({ x: pos.x, y: pos.y });
    setDrawRect({ x: pos.x, y: pos.y, width: 0, height: 0 });
  };

  const handleStageMouseMove = (e: Konva.KonvaEventObject<MouseEvent>) => {
    if (!isDrawing || !drawStart) return;
    const stage = e.target.getStage();
    if (!stage) return;
    const pos = stage.getPointerPosition();
    if (!pos) return;

    const x = Math.min(drawStart.x, pos.x);
    const y = Math.min(drawStart.y, pos.y);
    const width = Math.abs(pos.x - drawStart.x);
    const height = Math.abs(pos.y - drawStart.y);

    setDrawRect({ x, y, width, height });
  };

  const handleStageMouseUp = async () => {
    if (!isDrawing || !drawRect || !id) {
      setIsDrawing(false);
      setDrawStart(null);
      setDrawRect(null);
      return;
    }

    // Create manual redaction if large enough - keep in local state until Save
    if (drawRect.width > 10 && drawRect.height > 10) {
      const normalizedX = drawRect.x / dimensions.width;
      const normalizedY = drawRect.y / dimensions.height;
      const normalizedW = drawRect.width / dimensions.width;
      const normalizedH = drawRect.height / dimensions.height;

      const newId = `local-${Date.now()}`;
      const localDetection = {
        id: newId,
        detection_type: 'manual',
        bbox_x: normalizedX,
        bbox_y: normalizedY,
        bbox_width: normalizedW,
        bbox_height: normalizedH,
        page_number: pdfDoc ? currentPage : null,
        status: 'pending', // Start as pending, user must approve with exemption code
        exemption_code: null,
        comment: null,
      };
      setLocalDetections(prev => [...prev, localDetection]);
      setSelectedDetectionId(newId); // Select it immediately to show toolbar
      setToolbarExemptionCode('b6'); // Default for manual
      setToolbarComment('');
      setHasUnsavedChanges(true);
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawRect(null);
  };

  const showDetectionPrompt = detections.length === 0 && localDetections.length === 0 && !isLoading && detectingPage === null;

  return (
    <div className="fixed inset-0 bg-[#18181F] z-50 flex flex-col">
      {/* Toolbar - matching desktop brick color */}
      <header className="px-5 py-3.5 flex justify-between items-center" style={{ backgroundColor: '#B5594C' }}>
        <div className="flex items-center gap-4">
          {showDetectionPrompt ? (
            <button
              onClick={handleClose}
              className="px-4 py-2.5 rounded-lg font-semibold cursor-pointer border-0"
              style={{ backgroundColor: '#D4B8A8', color: '#3D3632' }}
            >
              Close
            </button>
          ) : null}
        </div>

        <h1 className="text-white font-semibold text-[15px]">File Review</h1>

        {!showDetectionPrompt && (
          <div className="flex items-center gap-2.5">
            <button
              onClick={handleCancel}
              className="px-4 py-2.5 rounded-lg font-semibold cursor-pointer border-0"
              style={{ backgroundColor: '#D4B8A8', color: '#3D3632' }}
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={isSaving}
              className="px-4 py-2.5 rounded-lg font-semibold cursor-pointer border-0 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              style={{ backgroundColor: '#8FB8A0', color: '#2D3E35' }}
            >
              {isSaving && (
                <svg className="animate-spin h-4 w-4" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z" />
                </svg>
              )}
              {isSaving ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
        {showDetectionPrompt && <div />}
      </header>

      {/* Main content - full width canvas */}
      <div
        ref={containerRef}
        className="flex-1 bg-[#18181F] flex items-center justify-center p-6 overflow-auto relative"
      >
        {imageError ? (
          <div className="text-red-400 text-center">
            <p className="mb-2">Error loading file</p>
            <p className="text-sm text-gray-500">{imageError}</p>
          </div>
        ) : image ? (
          <>
            <div className="bg-white shadow-2xl">
              <Stage
                ref={stageRef}
                width={dimensions.width}
                height={dimensions.height}
                onMouseDown={handleStageMouseDown}
                onMouseMove={handleStageMouseMove}
                onMouseUp={handleStageMouseUp}
                onClick={handleStageClick}
                style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
              >
                <Layer>
                  <KonvaImage
                    image={image}
                    width={dimensions.width}
                    height={dimensions.height}
                  />
                  {/* Render local (unsaved) detections */}
                  {localDetections
                    .filter((d) => d.page_number == null || d.page_number === currentPage)
                    .map((detection) => {
                      const isPending = detection.status === 'pending';
                      const isSelected = selectedDetectionId === detection.id;
                      const hasComment = !!detection.comment;
                      const rectX = detection.bbox_x * dimensions.width;
                      const rectY = detection.bbox_y * dimensions.height;
                      const rectW = detection.bbox_width * dimensions.width;
                      const rectH = detection.bbox_height * dimensions.height;
                      return (
                        <Group key={detection.id}>
                          <Rect
                            x={rectX}
                            y={rectY}
                            width={rectW}
                            height={rectH}
                            stroke={isSelected ? '#3B82F6' : isPending ? '#FFA500' : '#000000'}
                            strokeWidth={isSelected ? 3 : 2}
                            dash={isPending && !isSelected ? [4, 2] : undefined}
                            fill={isSelected ? 'rgba(59, 130, 246, 0.2)' : isPending ? 'rgba(255, 165, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)'}
                            onClick={() => handleDetectionClick(detection.id, detection.detection_type, detection.status, detection.exemption_code, detection.comment)}
                            onTap={() => handleDetectionClick(detection.id, detection.detection_type, detection.status, detection.exemption_code, detection.comment)}
                          />
                          {hasComment && (
                            <Circle
                              x={rectX + rectW - 6}
                              y={rectY + 6}
                              radius={5}
                              fill="#60A5FA"
                              stroke="#1E40AF"
                              strokeWidth={1}
                            />
                          )}
                        </Group>
                      );
                    })}
                  {/* Drawing rect preview */}
                  {isDrawing && drawRect && (
                    <Rect
                      x={drawRect.x}
                      y={drawRect.y}
                      width={drawRect.width}
                      height={drawRect.height}
                      stroke="#000000"
                      strokeWidth={2}
                      dash={[4, 2]}
                      fill="rgba(0, 0, 0, 0.15)"
                    />
                  )}
                </Layer>
              </Stage>
            </div>

            {/* Run Detection Prompt Overlay */}
            {showDetectionPrompt && (
              <div className="absolute inset-0 bg-black/50 flex items-center justify-center">
                <div className="flex flex-col gap-4">
                  <button
                    onClick={handleDetect}
                    className="text-white text-lg font-bold px-8 py-4 rounded-xl border-0 cursor-pointer hover:opacity-90 transition-opacity"
                    style={{ backgroundColor: '#B5594C' }}
                  >
                    Run Detection
                  </button>
                  <button
                    onClick={handleMarkNoRedactionsNeeded}
                    className="text-gray-300 text-sm px-6 py-2 rounded-lg border border-gray-500 cursor-pointer hover:bg-gray-700 transition-colors bg-transparent"
                  >
                    No Redactions Needed
                  </button>
                </div>
              </div>
            )}

            {/* Detecting Overlay */}
            {(isLoading || detectingPage !== null) && (
              <div className="absolute inset-0 bg-[#18181F]/75 flex flex-col items-center justify-center">
                <div className="w-44 h-2 bg-gray-700 rounded overflow-hidden mb-4">
                  <div
                    className="h-full bg-[#B5594C] transition-all duration-300"
                    style={{ width: detectingPage !== null ? `${(detectingPage / totalPages) * 100}%` : '100%' }}
                  />
                </div>
                <p className="text-white text-sm">
                  {detectingPage !== null
                    ? `Detecting page ${detectingPage} of ${totalPages}...`
                    : 'Detecting sensitive content...'}
                </p>
              </div>
            )}

            {/* Error display */}
            {error && (
              <div className="absolute top-4 left-1/2 -translate-x-1/2 bg-red-600 text-white px-4 py-2 rounded-lg shadow-lg">
                {error}
              </div>
            )}

            {/* Floating Toolbar for selected detection */}
            {selectedDetectionId && (() => {
              const selected = localDetections.find(d => d.id === selectedDetectionId);
              if (!selected) return null;

              // Position toolbar below the detection
              const toolbarX = selected.bbox_x * dimensions.width;
              const toolbarY = (selected.bbox_y + selected.bbox_height) * dimensions.height + 8;

              return (
                <div
                  className="absolute bg-[#252530] rounded-lg shadow-xl p-3 flex items-center gap-2 z-50"
                  style={{
                    left: Math.max(8, Math.min(toolbarX, dimensions.width - 320)),
                    top: Math.min(toolbarY, dimensions.height - 60),
                  }}
                >
                  <select
                    value={toolbarExemptionCode}
                    onChange={(e) => setToolbarExemptionCode(e.target.value as ExemptionCode)}
                    className="bg-gray-700 text-white text-sm rounded px-2 py-1.5 border-0 outline-none cursor-pointer"
                  >
                    {Object.entries(EXEMPTION_LABELS).map(([code, label]) => (
                      <option key={code} value={code}>{label}</option>
                    ))}
                  </select>
                  <input
                    type="text"
                    placeholder="Add note..."
                    value={toolbarComment}
                    onChange={(e) => setToolbarComment(e.target.value)}
                    className="bg-gray-700 text-white text-sm rounded px-2 py-1.5 w-28 border-0 outline-none placeholder-gray-400"
                  />
                  <button
                    onClick={handleToolbarApprove}
                    className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                    title="Approve"
                  >
                    ✓
                  </button>
                  <button
                    onClick={handleToolbarReject}
                    className="bg-red-600 hover:bg-red-700 text-white px-3 py-1.5 rounded text-sm font-medium transition-colors"
                    title="Reject"
                  >
                    ✗
                  </button>
                </div>
              );
            })()}
          </>
        ) : (
          <div className="text-gray-400">Loading file...</div>
        )}
      </div>

      {/* PDF Navigation */}
      {totalPages > 1 && (
        <div className="bg-[#252530] py-3.5 flex justify-center items-center gap-4">
          <button
            onClick={() => handlePageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
          >
            Previous
          </button>
          <span className="text-gray-400 text-sm">
            Page <span className="font-semibold text-white">{currentPage}</span> of{' '}
            <span className="font-semibold text-white">{totalPages}</span>
          </span>
          <button
            onClick={() => handlePageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="px-4 py-2 bg-gray-700 text-white rounded disabled:opacity-50"
          >
            Next
          </button>
        </div>
      )}

      {/* Message Modal */}
      {modalMessage && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
          <div className="bg-[#252530] rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <p className="text-white text-center mb-6">{modalMessage}</p>
            <button
              onClick={() => setModalMessage(null)}
              className="w-full py-2.5 rounded-lg font-semibold"
              style={{ backgroundColor: '#B5594C', color: 'white' }}
            >
              OK
            </button>
          </div>
        </div>
      )}

      {/* Cancel Confirmation Modal */}
      {showCancelConfirm && (
        <div className="fixed inset-0 bg-black/60 flex items-center justify-center z-[100]">
          <div className="bg-[#252530] rounded-xl p-6 max-w-md mx-4 shadow-2xl">
            <h3 className="text-white font-semibold text-lg mb-2">Discard Changes?</h3>
            <p className="text-gray-400 mb-6">Are you sure you want to cancel? All changes will be lost.</p>
            <div className="flex gap-3">
              <button
                onClick={() => setShowCancelConfirm(false)}
                className="flex-1 py-2.5 rounded-lg font-semibold bg-gray-600 text-white"
              >
                No
              </button>
              <button
                onClick={() => {
                  setShowCancelConfirm(false);
                  goBackToRequest();
                }}
                className="flex-1 py-2.5 rounded-lg font-semibold"
                style={{ backgroundColor: '#B5594C', color: 'white' }}
              >
                Yes, Discard
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
