import { useEffect, useState, useRef } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Stage, Layer, Image as KonvaImage, Rect, Transformer } from 'react-konva';
import Konva from 'konva';
import { useDetectionStore } from '../stores/detectionStore';
import { api } from '../services/api';

export function FileReviewPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { detections, manualRedactions, isLoading, fetchDetections, detectFaces, updateDetection } = useDetectionStore();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [imageError, setImageError] = useState<string | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const [, setScale] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const transformerRef = useRef<Konva.Transformer>(null);

  useEffect(() => {
    if (id) {
      fetchDetections(id);
      loadImage(id);
    }
  }, [id, fetchDetections]);

  useEffect(() => {
    // Update transformer when selection changes
    if (transformerRef.current) {
      const stage = transformerRef.current.getStage();
      if (stage && selectedId) {
        const selectedNode = stage.findOne(`#${selectedId}`);
        if (selectedNode) {
          transformerRef.current.nodes([selectedNode]);
        } else {
          transformerRef.current.nodes([]);
        }
      } else {
        transformerRef.current.nodes([]);
      }
    }
  }, [selectedId]);

  const loadImage = async (fileId: string) => {
    try {
      setImageError(null);
      const blob = await api.getFileOriginal(fileId);
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = () => {
        setImage(img);
        calculateDimensions(img);
      };
      img.onerror = () => {
        setImageError('Failed to decode image');
      };
      img.src = url;
    } catch (e) {
      console.error('Failed to load image:', e);
      setImageError(e instanceof Error ? e.message : 'Failed to load image');
    }
  };

  const calculateDimensions = (img: HTMLImageElement) => {
    if (!containerRef.current) return;
    const containerWidth = containerRef.current.clientWidth - 48; // padding
    const containerHeight = containerRef.current.clientHeight - 48;

    const scaleX = containerWidth / img.width;
    const scaleY = containerHeight / img.height;
    const newScale = Math.min(scaleX, scaleY, 1);

    setScale(newScale);
    setDimensions({
      width: img.width * newScale,
      height: img.height * newScale,
    });
  };

  const handleDetectFaces = async () => {
    if (id) {
      try {
        await detectFaces(id);
      } catch (e) {
        console.error('Face detection failed:', e);
      }
    }
  };

  const handleApprove = async (detectionId: string) => {
    await updateDetection(detectionId, { status: 'approved' });
  };

  const handleReject = async (detectionId: string) => {
    await updateDetection(detectionId, { status: 'rejected' });
  };

  const handleApproveAll = async () => {
    const pending = detections.filter(d => d.status === 'pending');
    for (const detection of pending) {
      await updateDetection(detection.id, { status: 'approved' });
    }
  };

  const handleClose = () => {
    navigate(-1);
  };

  const getDetectionColor = (status: string) => {
    switch (status) {
      case 'approved': return '#22c55e';
      case 'rejected': return '#ef4444';
      default: return '#eab308';
    }
  };

  const pendingCount = detections.filter(d => d.status === 'pending').length;
  const approvedCount = detections.filter(d => d.status === 'approved').length;

  return (
    <div className="fixed inset-0 bg-gray-900 z-50 flex flex-col">
      {/* Header */}
      <header className="bg-gray-800 border-b border-gray-700 px-4 py-3 flex justify-between items-center">
        <div className="flex items-center gap-4">
          <button
            onClick={handleClose}
            className="text-gray-400 hover:text-white flex items-center gap-2"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back
          </button>
          <h1 className="text-white font-semibold">File Review</h1>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={handleDetectFaces}
            disabled={isLoading}
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50 text-sm"
          >
            {isLoading ? 'Detecting...' : 'Detect Faces'}
          </button>
          {pendingCount > 0 && (
            <button
              onClick={handleApproveAll}
              className="bg-green-600 text-white px-4 py-2 rounded-md hover:bg-green-700 text-sm"
            >
              Approve All ({pendingCount})
            </button>
          )}
        </div>
      </header>

      {/* Main content */}
      <div className="flex-1 flex overflow-hidden">
        {/* Canvas area */}
        <div
          ref={containerRef}
          className="flex-1 bg-gray-800 flex items-center justify-center p-6 overflow-auto"
        >
          {imageError ? (
            <div className="text-red-400 text-center">
              <p className="mb-2">Error loading image</p>
              <p className="text-sm text-gray-500">{imageError}</p>
            </div>
          ) : image ? (
            <div className="bg-white shadow-2xl">
              <Stage
                width={dimensions.width}
                height={dimensions.height}
                onClick={(e) => {
                  // Deselect when clicking on empty area
                  if (e.target === e.target.getStage()) {
                    setSelectedId(null);
                  }
                }}
              >
                <Layer>
                  <KonvaImage
                    image={image}
                    width={dimensions.width}
                    height={dimensions.height}
                  />
                  {/* Render detections */}
                  {detections.filter(d => d.status !== 'rejected').map((detection) => {
                    if (detection.bbox_x === null || detection.bbox_y === null ||
                        detection.bbox_width === null || detection.bbox_height === null) {
                      return null;
                    }
                    const isSelected = selectedId === detection.id;
                    const isApproved = detection.status === 'approved';
                    return (
                      <Rect
                        key={detection.id}
                        id={detection.id}
                        x={detection.bbox_x * dimensions.width}
                        y={detection.bbox_y * dimensions.height}
                        width={detection.bbox_width * dimensions.width}
                        height={detection.bbox_height * dimensions.height}
                        stroke={getDetectionColor(detection.status)}
                        strokeWidth={isSelected ? 3 : 2}
                        fill={isApproved ? 'rgba(0,0,0,0.85)' : 'transparent'}
                        onClick={() => setSelectedId(detection.id)}
                        onTap={() => setSelectedId(detection.id)}
                        draggable={!isApproved}
                      />
                    );
                  })}
                  {/* Render manual redactions */}
                  {manualRedactions.map((redaction) => {
                    if (redaction.bbox_x === null || redaction.bbox_y === null ||
                        redaction.bbox_width === null || redaction.bbox_height === null) {
                      return null;
                    }
                    return (
                      <Rect
                        key={redaction.id}
                        id={redaction.id}
                        x={redaction.bbox_x * dimensions.width}
                        y={redaction.bbox_y * dimensions.height}
                        width={redaction.bbox_width * dimensions.width}
                        height={redaction.bbox_height * dimensions.height}
                        stroke="#3b82f6"
                        strokeWidth={2}
                        fill="rgba(0,0,0,0.85)"
                      />
                    );
                  })}
                  <Transformer ref={transformerRef} />
                </Layer>
              </Stage>
            </div>
          ) : (
            <div className="text-gray-400">Loading image...</div>
          )}
        </div>

        {/* Right panel - detections list */}
        <aside className="w-80 bg-gray-800 border-l border-gray-700 flex flex-col">
          <div className="p-4 border-b border-gray-700">
            <h2 className="text-white font-semibold">Detections</h2>
            <div className="flex gap-4 mt-2 text-sm">
              <span className="text-yellow-500">{pendingCount} pending</span>
              <span className="text-green-500">{approvedCount} approved</span>
            </div>
          </div>

          <div className="flex-1 overflow-auto p-4 space-y-3">
            {detections.length === 0 ? (
              <p className="text-gray-500 text-center py-4 text-sm">
                No detections yet. Click "Detect Faces" to analyze the image.
              </p>
            ) : (
              detections.map((detection) => (
                <div
                  key={detection.id}
                  className={`bg-gray-700 rounded-lg p-3 cursor-pointer transition-colors ${
                    selectedId === detection.id ? 'ring-2 ring-blue-500' : ''
                  }`}
                  onClick={() => setSelectedId(detection.id)}
                >
                  <div className="flex justify-between items-center mb-2">
                    <span className="text-white font-medium capitalize text-sm">
                      {detection.detection_type}
                    </span>
                    <span className={`px-2 py-0.5 text-xs rounded-full ${
                      detection.status === 'approved' ? 'bg-green-900 text-green-300' :
                      detection.status === 'rejected' ? 'bg-red-900 text-red-300' :
                      'bg-yellow-900 text-yellow-300'
                    }`}>
                      {detection.status}
                    </span>
                  </div>
                  {detection.confidence && (
                    <p className="text-xs text-gray-400 mb-2">
                      Confidence: {detection.confidence.toFixed(1)}%
                    </p>
                  )}
                  {detection.status === 'pending' && (
                    <div className="flex gap-2">
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleApprove(detection.id);
                        }}
                        className="flex-1 bg-green-600 text-white px-2 py-1 rounded text-xs hover:bg-green-700"
                      >
                        Approve
                      </button>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleReject(detection.id);
                        }}
                        className="flex-1 bg-red-600 text-white px-2 py-1 rounded text-xs hover:bg-red-700"
                      >
                        Reject
                      </button>
                    </div>
                  )}
                </div>
              ))
            )}
          </div>
        </aside>
      </div>
    </div>
  );
}
