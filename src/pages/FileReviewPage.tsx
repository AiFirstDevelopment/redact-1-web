import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import { useDetectionStore } from '../stores/detectionStore';
import { api } from '../services/api';

export function FileReviewPage() {
  const { id } = useParams<{ id: string }>();
  const { detections, manualRedactions, isLoading, fetchDetections, detectFaces, updateDetection } = useDetectionStore();
  const [image, setImage] = useState<HTMLImageElement | null>(null);
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 });
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (id) {
      fetchDetections(id);
      loadImage(id);
    }
  }, [id, fetchDetections]);

  const loadImage = async (fileId: string) => {
    try {
      const blob = await api.getFileOriginal(fileId);
      const url = URL.createObjectURL(blob);
      const img = new window.Image();
      img.onload = () => {
        setImage(img);
        // Scale to fit container
        const containerWidth = containerRef.current?.clientWidth || 800;
        const scale = containerWidth / img.width;
        setDimensions({
          width: img.width * scale,
          height: img.height * scale,
        });
      };
      img.src = url;
    } catch (e) {
      console.error('Failed to load image:', e);
    }
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

  const getDetectionColor = (status: string) => {
    switch (status) {
      case 'approved': return '#22c55e';
      case 'rejected': return '#ef4444';
      default: return '#eab308';
    }
  };

  const allRedactions = [
    ...detections.filter(d => d.status !== 'rejected'),
    ...manualRedactions,
  ];

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-4">
              <Link to="/" className="text-gray-600 hover:text-gray-900">
                &larr; Back
              </Link>
              <h1 className="text-xl font-bold">Review File</h1>
            </div>
            <div className="flex gap-2">
              <button
                onClick={handleDetectFaces}
                disabled={isLoading}
                className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 disabled:opacity-50"
              >
                {isLoading ? 'Detecting...' : 'Detect Faces'}
              </button>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Canvas */}
          <div className="lg:col-span-2 bg-white rounded-lg shadow p-4" ref={containerRef}>
            {image ? (
              <Stage width={dimensions.width} height={dimensions.height}>
                <Layer>
                  <KonvaImage
                    image={image}
                    width={dimensions.width}
                    height={dimensions.height}
                  />
                  {allRedactions.map((item) => {
                    if (item.bbox_x === null || item.bbox_y === null ||
                        item.bbox_width === null || item.bbox_height === null) {
                      return null;
                    }
                    const isDetection = 'status' in item;
                    return (
                      <Rect
                        key={item.id}
                        x={item.bbox_x * dimensions.width}
                        y={item.bbox_y * dimensions.height}
                        width={item.bbox_width * dimensions.width}
                        height={item.bbox_height * dimensions.height}
                        stroke={isDetection ? getDetectionColor((item as typeof detections[0]).status) : '#3b82f6'}
                        strokeWidth={2}
                        fill={isDetection && (item as typeof detections[0]).status === 'approved' ? 'rgba(0,0,0,0.8)' : 'transparent'}
                      />
                    );
                  })}
                </Layer>
              </Stage>
            ) : (
              <div className="h-96 flex items-center justify-center text-gray-500">
                Loading image...
              </div>
            )}
          </div>

          {/* Detections Panel */}
          <div className="bg-white rounded-lg shadow p-4">
            <h2 className="text-lg font-semibold mb-4">Detections</h2>
            {detections.length === 0 ? (
              <p className="text-gray-500 text-center py-4">
                No detections. Click "Detect Faces" to analyze the image.
              </p>
            ) : (
              <div className="space-y-3">
                {detections.map((detection) => (
                  <div
                    key={detection.id}
                    className="border rounded-lg p-3"
                  >
                    <div className="flex justify-between items-center mb-2">
                      <span className="font-medium capitalize">{detection.detection_type}</span>
                      <span className={`px-2 py-1 text-xs rounded-full ${
                        detection.status === 'approved' ? 'bg-green-100 text-green-800' :
                        detection.status === 'rejected' ? 'bg-red-100 text-red-800' :
                        'bg-yellow-100 text-yellow-800'
                      }`}>
                        {detection.status}
                      </span>
                    </div>
                    {detection.confidence && (
                      <p className="text-sm text-gray-500 mb-2">
                        Confidence: {(detection.confidence).toFixed(1)}%
                      </p>
                    )}
                    {detection.status === 'pending' && (
                      <div className="flex gap-2">
                        <button
                          onClick={() => handleApprove(detection.id)}
                          className="flex-1 bg-green-600 text-white px-3 py-1 rounded text-sm hover:bg-green-700"
                        >
                          Approve
                        </button>
                        <button
                          onClick={() => handleReject(detection.id)}
                          className="flex-1 bg-red-600 text-white px-3 py-1 rounded text-sm hover:bg-red-700"
                        >
                          Reject
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
