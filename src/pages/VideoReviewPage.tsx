import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { EvidenceFile, VideoDetection, VideoJob, VideoTrack, ExemptionCode, EXEMPTION_LABELS } from '../types';

type ReviewTab = 'detections' | 'timeline';

export function VideoReviewPage() {
  const { fileId } = useParams<{ fileId: string }>();
  const navigate = useNavigate();

  // State
  const [file, setFile] = useState<EvidenceFile | null>(null);
  const [videoUrl, setVideoUrl] = useState<string | null>(null);
  const [redactedVideoUrl, setRedactedVideoUrl] = useState<string | null>(null);
  const [detections, setDetections] = useState<VideoDetection[]>([]);
  const [tracks, setTracks] = useState<VideoTrack[]>([]);
  const [job, setJob] = useState<VideoJob | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<ReviewTab>('detections');
  const [selectedTrack, setSelectedTrack] = useState<string | null>(null);
  const [selectedDetection, setSelectedDetection] = useState<VideoDetection | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [showRedacted, setShowRedacted] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // Bulk action state
  const [bulkExemption, setBulkExemption] = useState<ExemptionCode>('b7c');
  const [bulkComment, setBulkComment] = useState('');

  // Load file and detections
  useEffect(() => {
    if (!fileId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get file info
        const fileResponse = await fetch(`${import.meta.env.VITE_API_URL || 'https://redact-1-worker.joelstevick.workers.dev'}/api/files/${fileId}`, {
          headers: { Authorization: `Bearer ${api.getToken()}` },
        });
        if (!fileResponse.ok) throw new Error('Failed to load file');
        const { file: fileData } = await fileResponse.json();
        setFile(fileData);

        // Get video stream URL
        const { url } = await api.getVideoStreamUrl(fileId);
        setVideoUrl(url);

        // Get detections
        const { detections: dets, tracks: trks } = await api.listVideoDetections(fileId);
        setDetections(dets);
        setTracks(trks);

        // Get job status
        try {
          const { job: jobData } = await api.getVideoJobStatus(fileId);
          setJob(jobData);
        } catch {
          // No job yet - that's OK
        }

        // Get redacted video URL if available
        if (fileData.redacted_s3_key) {
          try {
            const { url: redactedUrl } = await api.getRedactedVideoStreamUrl(fileId);
            setRedactedVideoUrl(redactedUrl);
          } catch {
            // Redacted video not ready
          }
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to load video');
      } finally {
        setLoading(false);
      }
    };

    loadData();
  }, [fileId]);

  // Poll job status while processing
  useEffect(() => {
    if (!job || !['pending', 'processing'].includes(job.status)) return;

    const interval = setInterval(async () => {
      try {
        const { job: updated } = await api.getVideoJobStatus(fileId!);
        setJob(updated);

        if (updated.status === 'completed') {
          // Reload detections
          const { detections: dets, tracks: trks } = await api.listVideoDetections(fileId!);
          setDetections(dets);
          setTracks(trks);
        }
      } catch {
        // Ignore polling errors
      }
    }, 3000);

    return () => clearInterval(interval);
  }, [job, fileId]);

  // Draw detection overlays on canvas
  const drawOverlays = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;

    ctx.clearRect(0, 0, canvas.width, canvas.height);

    // Get detections at current time
    const currentMs = currentTime * 1000;
    const activeDetections = detections.filter(
      d => d.start_time_ms <= currentMs && d.end_time_ms >= currentMs
    );

    activeDetections.forEach(det => {
      const x = det.bbox_x * canvas.width;
      const y = det.bbox_y * canvas.height;
      const w = det.bbox_width * canvas.width;
      const h = det.bbox_height * canvas.height;

      // Color based on status
      let strokeColor = '#fbbf24'; // yellow for pending
      if (det.status === 'approved') strokeColor = '#22c55e'; // green
      if (det.status === 'rejected') strokeColor = '#ef4444'; // red

      // Highlight selected
      const isSelected = selectedDetection?.id === det.id || selectedTrack === det.track_id;
      const lineWidth = isSelected ? 4 : 2;

      ctx.strokeStyle = strokeColor;
      ctx.lineWidth = lineWidth;
      ctx.strokeRect(x, y, w, h);

      // Draw label
      if (det.track_id) {
        ctx.fillStyle = strokeColor;
        ctx.font = '12px sans-serif';
        ctx.fillText(det.track_id, x, y - 4);
      }
    });
  }, [currentTime, detections, selectedDetection, selectedTrack]);

  // Redraw on time update
  useEffect(() => {
    drawOverlays();
  }, [drawOverlays]);

  // Handle video time update
  const handleTimeUpdate = () => {
    if (videoRef.current) {
      setCurrentTime(videoRef.current.currentTime);
    }
  };

  // Start detection
  const handleStartDetection = async () => {
    if (!fileId) return;

    try {
      const { job: newJob } = await api.startVideoDetection(fileId);
      setJob(newJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start detection');
    }
  };

  // Approve/reject single detection
  const handleUpdateDetection = async (id: string, status: 'approved' | 'rejected') => {
    try {
      const { detection } = await api.updateVideoDetection(id, { status });
      setDetections(prev => prev.map(d => d.id === id ? detection : d));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update detection');
    }
  };

  // Bulk approve/reject by track
  const handleBulkUpdate = async (status: 'approved' | 'rejected') => {
    if (!fileId) return;

    try {
      await api.bulkUpdateVideoDetections(fileId, {
        track_id: selectedTrack || undefined,
        status,
        exemption_code: bulkExemption,
        comment: bulkComment || undefined,
      });

      // Reload detections
      const { detections: dets, tracks: trks } = await api.listVideoDetections(fileId);
      setDetections(dets);
      setTracks(trks);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to bulk update');
    }
  };

  // Start redaction
  const handleStartRedaction = async () => {
    if (!fileId) return;

    try {
      const { job: newJob } = await api.startVideoRedaction(fileId);
      setJob(newJob);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start redaction');
    }
  };

  // Seek to detection time
  const seekToDetection = (det: VideoDetection) => {
    if (videoRef.current) {
      videoRef.current.currentTime = det.start_time_ms / 1000;
      setSelectedDetection(det);
    }
  };

  // Format time
  const formatTime = (ms: number) => {
    const s = Math.floor(ms / 1000);
    const min = Math.floor(s / 60);
    const sec = s % 60;
    return `${min}:${sec.toString().padStart(2, '0')}`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-white">Loading video...</div>
      </div>
    );
  }

  if (error || !file) {
    return (
      <div className="flex items-center justify-center h-screen bg-gray-900">
        <div className="text-center">
          <p className="text-red-400 mb-4">{error || 'File not found'}</p>
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 bg-gray-700 text-white rounded hover:bg-gray-600"
          >
            Go Back
          </button>
        </div>
      </div>
    );
  }

  const pendingCount = detections.filter(d => d.status === 'pending').length;
  const approvedCount = detections.filter(d => d.status === 'approved').length;

  return (
    <div className="flex h-screen bg-gray-900 text-white">
      {/* Video Panel */}
      <div className="flex-1 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-700">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="text-gray-400 hover:text-white"
            >
              &larr; Back
            </button>
            <h1 className="text-lg font-semibold">{file.filename}</h1>
          </div>

          <div className="flex items-center gap-4">
            {/* Job status */}
            {job && ['pending', 'processing'].includes(job.status) && (
              <div className="flex items-center gap-2 text-yellow-400">
                <span className="animate-spin">&#9696;</span>
                <span>{job.job_type === 'detection' ? 'Detecting' : 'Redacting'}... {job.progress}%</span>
              </div>
            )}

            {/* Toggle original/redacted */}
            {redactedVideoUrl && (
              <button
                onClick={() => setShowRedacted(!showRedacted)}
                className={`px-3 py-1 rounded ${showRedacted ? 'bg-green-600' : 'bg-gray-600'}`}
              >
                {showRedacted ? 'Showing Redacted' : 'Show Redacted'}
              </button>
            )}
          </div>
        </div>

        {/* Video container - constrained to 720p max */}
        <div className="flex-1 relative flex items-center justify-center bg-black">
          <div className="relative max-w-[1280px] max-h-[720px] w-full h-full flex items-center justify-center">
            <video
              ref={videoRef}
              src={showRedacted && redactedVideoUrl ? redactedVideoUrl : videoUrl || undefined}
              controls
              onTimeUpdate={handleTimeUpdate}
              className={`max-w-full max-h-full ${detections.length === 0 && !job ? 'opacity-50' : ''}`}
            />
          {!showRedacted && (
            <canvas
              ref={canvasRef}
              className="absolute top-0 left-0 w-full h-full pointer-events-none"
              style={{ objectFit: 'contain' }}
            />
          )}

          {/* Centered detection button overlay */}
          {detections.length === 0 && !job && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <button
                onClick={handleStartDetection}
                className="px-8 py-4 bg-blue-600 hover:bg-blue-500 text-white text-xl font-semibold rounded-lg shadow-lg transition-colors"
              >
                Detect Faces
              </button>
            </div>
          )}

          {/* Processing overlay */}
          {job && ['pending', 'processing'].includes(job.status) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="text-center">
                <div className="text-4xl mb-4 animate-spin">&#9696;</div>
                <p className="text-xl text-white">
                  {job.job_type === 'detection' ? 'Detecting faces' : 'Generating redacted video'}...
                </p>
                <p className="text-2xl text-white font-bold mt-2">{job.progress}%</p>
              </div>
            </div>
          )}
          </div>
        </div>

        {/* Detection timeline */}
        <div className="h-20 border-t border-gray-700 p-2 overflow-x-auto">
          <div className="relative h-full">
            {tracks.map((track, i) => (
              <div
                key={track.track_id}
                className="absolute h-4 flex"
                style={{ top: i * 18 }}
              >
                <span className="text-xs text-gray-400 w-16">{track.track_id}</span>
                {detections
                  .filter(d => d.track_id === track.track_id)
                  .map(det => {
                    const duration = job?.duration_seconds ? job.duration_seconds * 1000 : 60000;
                    const left = `${(det.start_time_ms / duration) * 100}%`;
                    const width = `${((det.end_time_ms - det.start_time_ms) / duration) * 100}%`;
                    return (
                      <div
                        key={det.id}
                        className={`absolute h-3 rounded cursor-pointer ${
                          det.status === 'approved' ? 'bg-green-500' :
                          det.status === 'rejected' ? 'bg-red-500' : 'bg-yellow-500'
                        }`}
                        style={{ left, width, minWidth: '4px' }}
                        onClick={() => seekToDetection(det)}
                        title={`${formatTime(det.start_time_ms)} - ${formatTime(det.end_time_ms)}`}
                      />
                    );
                  })}
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Sidebar */}
      <div className="w-80 border-l border-gray-700 flex flex-col">
        {/* Tabs */}
        <div className="flex border-b border-gray-700">
          <button
            className={`flex-1 py-3 text-center ${activeTab === 'detections' ? 'bg-gray-700' : ''}`}
            onClick={() => setActiveTab('detections')}
          >
            Detections ({detections.length})
          </button>
          <button
            className={`flex-1 py-3 text-center ${activeTab === 'timeline' ? 'bg-gray-700' : ''}`}
            onClick={() => setActiveTab('timeline')}
          >
            Timeline
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'detections' ? (
            <div className="space-y-4">
              {/* Status summary */}
              <div className="grid grid-cols-3 gap-2 text-center text-sm">
                <div className="bg-yellow-500/20 p-2 rounded">
                  <div className="font-bold">{pendingCount}</div>
                  <div className="text-yellow-400">Pending</div>
                </div>
                <div className="bg-green-500/20 p-2 rounded">
                  <div className="font-bold">{approvedCount}</div>
                  <div className="text-green-400">Approved</div>
                </div>
                <div className="bg-red-500/20 p-2 rounded">
                  <div className="font-bold">{detections.length - pendingCount - approvedCount}</div>
                  <div className="text-red-400">Rejected</div>
                </div>
              </div>

              {/* Actions */}
              <div className="space-y-2">
                {detections.length === 0 && !job && (
                  <button
                    onClick={handleStartDetection}
                    className="w-full py-2 bg-blue-600 rounded hover:bg-blue-500"
                  >
                    Start Face Detection
                  </button>
                )}

                {pendingCount > 0 && (
                  <>
                    <select
                      value={bulkExemption}
                      onChange={e => setBulkExemption(e.target.value as ExemptionCode)}
                      className="w-full p-2 bg-gray-700 rounded"
                    >
                      {Object.entries(EXEMPTION_LABELS).map(([code, label]) => (
                        <option key={code} value={code}>{label}</option>
                      ))}
                    </select>
                    <input
                      type="text"
                      value={bulkComment}
                      onChange={e => setBulkComment(e.target.value)}
                      placeholder="Comment (optional)"
                      className="w-full p-2 bg-gray-700 rounded"
                    />
                    <button
                      onClick={() => handleBulkUpdate('approved')}
                      className="w-full py-2 bg-green-600 rounded hover:bg-green-500"
                    >
                      {selectedTrack ? `Approve Track ${selectedTrack}` : 'Approve All Pending'}
                    </button>
                    <button
                      onClick={() => handleBulkUpdate('rejected')}
                      className="w-full py-2 bg-red-600 rounded hover:bg-red-500"
                    >
                      {selectedTrack ? `Reject Track ${selectedTrack}` : 'Reject All Pending'}
                    </button>
                  </>
                )}

                {approvedCount > 0 && pendingCount === 0 && !job?.status?.includes('processing') && (
                  <button
                    onClick={handleStartRedaction}
                    className="w-full py-2 bg-purple-600 rounded hover:bg-purple-500"
                  >
                    Generate Redacted Video
                  </button>
                )}
              </div>

              {/* Track list */}
              <div className="space-y-2">
                <h3 className="font-semibold">Tracks</h3>
                {tracks.map(track => (
                  <button
                    key={track.track_id}
                    onClick={() => setSelectedTrack(selectedTrack === track.track_id ? null : track.track_id)}
                    className={`w-full p-2 rounded text-left ${
                      selectedTrack === track.track_id ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'
                    }`}
                  >
                    <div className="flex justify-between">
                      <span>{track.track_id}</span>
                      <span className="text-gray-400">{track.count} segments</span>
                    </div>
                  </button>
                ))}
              </div>

              {/* Detection list */}
              <div className="space-y-2">
                <h3 className="font-semibold">All Detections</h3>
                {detections.map(det => (
                  <div
                    key={det.id}
                    onClick={() => seekToDetection(det)}
                    className={`p-2 rounded cursor-pointer ${
                      selectedDetection?.id === det.id ? 'ring-2 ring-blue-400' : ''
                    } ${
                      det.status === 'approved' ? 'bg-green-900/30' :
                      det.status === 'rejected' ? 'bg-red-900/30' : 'bg-gray-700'
                    }`}
                  >
                    <div className="flex justify-between text-sm">
                      <span>{det.track_id || 'manual'}</span>
                      <span>{formatTime(det.start_time_ms)} - {formatTime(det.end_time_ms)}</span>
                    </div>
                    <div className="flex gap-2 mt-2">
                      <button
                        onClick={e => { e.stopPropagation(); handleUpdateDetection(det.id, 'approved'); }}
                        className="flex-1 py-1 bg-green-600 rounded text-xs hover:bg-green-500"
                        disabled={det.status === 'approved'}
                      >
                        Approve
                      </button>
                      <button
                        onClick={e => { e.stopPropagation(); handleUpdateDetection(det.id, 'rejected'); }}
                        className="flex-1 py-1 bg-red-600 rounded text-xs hover:bg-red-500"
                        disabled={det.status === 'rejected'}
                      >
                        Reject
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <h3 className="font-semibold">Job History</h3>
              {job ? (
                <div className="p-3 bg-gray-700 rounded">
                  <div className="flex justify-between">
                    <span className="capitalize">{job.job_type}</span>
                    <span className={
                      job.status === 'completed' ? 'text-green-400' :
                      job.status === 'failed' ? 'text-red-400' :
                      job.status === 'processing' ? 'text-yellow-400' : 'text-gray-400'
                    }>
                      {job.status}
                    </span>
                  </div>
                  {job.progress > 0 && job.status === 'processing' && (
                    <div className="mt-2 bg-gray-600 rounded h-2">
                      <div
                        className="bg-blue-500 h-full rounded"
                        style={{ width: `${job.progress}%` }}
                      />
                    </div>
                  )}
                  {job.error_message && (
                    <p className="mt-2 text-red-400 text-sm">{job.error_message}</p>
                  )}
                  {job.duration_seconds && (
                    <p className="mt-1 text-sm text-gray-400">
                      Duration: {Math.round(job.duration_seconds)}s
                    </p>
                  )}
                </div>
              ) : (
                <p className="text-gray-400">No jobs yet</p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
