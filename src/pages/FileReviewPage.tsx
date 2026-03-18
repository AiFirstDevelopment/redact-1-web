import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import Konva from 'konva';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import { useDetectionStore } from '../stores/detectionStore';
import { api } from '../services/api';

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
  const { detections, isLoading, error, fetchDetections, detectFaces, updateDetection, deleteDetection } = useDetectionStore();
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

      if (pdfDoc) {
        // Process ALL pages of the PDF
        for (let pageNum = 1; pageNum <= totalPages; pageNum++) {
          setDetectingPage(pageNum);
          console.log(`[Detection] Processing page ${pageNum} of ${totalPages}`);

          // 1. Run client-side PII text detection
          const piiMatches = await detectPiiInPage(pdfDoc, pageNum);
          console.log(`[Detection] Found ${piiMatches.length} PII matches on page ${pageNum}`);

          // Create detections for PII matches via API
          for (const match of piiMatches) {
            try {
              await api.createDetection(id, {
                detection_type: match.type,
                bbox_x: match.bbox.x,
                bbox_y: match.bbox.y,
                bbox_width: match.bbox.width,
                bbox_height: match.bbox.height,
                page_number: pageNum,
              });
            } catch (e) {
              console.error('[Detection] Failed to create detection:', e);
            }
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

          // Convert to blob and send for face detection
          const pageBlob = await new Promise<Blob>((resolve, reject) => {
            canvas.toBlob((blob) => {
              if (blob) resolve(blob);
              else reject(new Error('Failed to convert canvas to blob'));
            }, 'image/png');
          });

          await detectFaces(id, pageBlob, pageNum);
        }
        setDetectingPage(null);

        // Refresh all detections
        await fetchDetections(id);
      } else {
        // Single image - no page number, face detection only
        await detectFaces(id);
      }

      console.log('[Detection] Detection complete');
      setHasUnsavedChanges(true);
    } catch (e) {
      console.error('[Detection] Detection failed:', e);
      setDetectingPage(null);
      setModalMessage(`Detection failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    }
  };

  // Click on pending detection = approve it
  const handleDetectionClick = async (detectionId: string, status: string) => {
    if (status === 'pending') {
      await updateDetection(detectionId, { status: 'approved' });
      setHasUnsavedChanges(true);
    }
  };

  // Double-click = delete/reject
  const handleDetectionDblClick = async (detectionId: string) => {
    await deleteDetection(detectionId);
    setHasUnsavedChanges(true);
  };

  const handleClose = () => {
    navigate(-1);
  };

  const [showCancelConfirm, setShowCancelConfirm] = useState(false);

  const handleCancel = async () => {
    if (hasUnsavedChanges) {
      setShowCancelConfirm(true);
    } else {
      navigate(-1);
    }
  };

  const handleSave = async () => {
    // TODO: Save redactions to server and generate redacted file
    setModalMessage('Save functionality - would save approved detections and generate redacted file');
    setHasUnsavedChanges(false);
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

    // Create manual redaction if large enough
    if (drawRect.width > 10 && drawRect.height > 10) {
      const normalizedX = drawRect.x / dimensions.width;
      const normalizedY = drawRect.y / dimensions.height;
      const normalizedW = drawRect.width / dimensions.width;
      const normalizedH = drawRect.height / dimensions.height;

      try {
        await api.createDetection(id, {
          detection_type: 'manual',
          bbox_x: normalizedX,
          bbox_y: normalizedY,
          bbox_width: normalizedW,
          bbox_height: normalizedH,
          status: 'approved',
        });
        await fetchDetections(id);
        setHasUnsavedChanges(true);
      } catch (e) {
        console.error('Failed to create manual redaction:', e);
      }
    }

    setIsDrawing(false);
    setDrawStart(null);
    setDrawRect(null);
  };

  const showDetectionPrompt = detections.length === 0 && !isLoading && detectingPage === null;

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
              className="px-4 py-2.5 rounded-lg font-semibold cursor-pointer border-0"
              style={{ backgroundColor: '#8FB8A0', color: '#2D3E35' }}
            >
              Save
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
                style={{ cursor: isDrawing ? 'crosshair' : 'default' }}
              >
                <Layer>
                  <KonvaImage
                    image={image}
                    width={dimensions.width}
                    height={dimensions.height}
                  />
                  {/* Render detections for current page */}
                  {detections
                    .filter((d) => d.page_number === null || d.page_number === currentPage)
                    .map((detection) => {
                    if (detection.bbox_x === null || detection.bbox_y === null ||
                        detection.bbox_width === null || detection.bbox_height === null) {
                      return null;
                    }
                    const isPending = detection.status === 'pending';
                    return (
                      <Rect
                        key={detection.id}
                        x={detection.bbox_x * dimensions.width}
                        y={detection.bbox_y * dimensions.height}
                        width={detection.bbox_width * dimensions.width}
                        height={detection.bbox_height * dimensions.height}
                        stroke={isPending ? '#FFA500' : '#000000'}
                        strokeWidth={2}
                        dash={isPending ? [4, 2] : undefined}
                        fill={isPending ? 'rgba(255, 165, 0, 0.15)' : 'rgba(0, 0, 0, 0.3)'}
                        onClick={() => handleDetectionClick(detection.id, detection.status)}
                        onDblClick={() => handleDetectionDblClick(detection.id)}
                        onTap={() => handleDetectionClick(detection.id, detection.status)}
                      />
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
                <button
                  onClick={handleDetect}
                  className="text-white text-lg font-bold px-8 py-4 rounded-xl border-0 cursor-pointer hover:opacity-90 transition-opacity"
                  style={{ backgroundColor: '#B5594C' }}
                >
                  Run Detection
                </button>
              </div>
            )}

            {/* Detecting Overlay */}
            {(isLoading || detectingPage !== null) && (
              <div className="absolute inset-0 bg-[#18181F]/75 flex flex-col items-center justify-center">
                <div className="w-44 h-1 bg-gray-700 rounded overflow-hidden mb-4">
                  <div className="h-full bg-[#B5594C] animate-[pulse_1s_ease-in-out_infinite]" style={{ width: '60%' }} />
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
                  navigate(-1);
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
