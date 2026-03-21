import { useEffect, useState, useRef, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { api } from '../services/api';
import { EvidenceFile, VideoDetection, VideoJob, VideoTrack, ExemptionCode, EXEMPTION_LABELS } from '../types';

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
  const [isStartingDetection, setIsStartingDetection] = useState(false);


  // Load file and detections
  useEffect(() => {
    if (!fileId) return;

    const loadData = async () => {
      try {
        setLoading(true);
        setError(null);

        // Get file info
        const token = await api.getToken();
        const fileResponse = await fetch(`${import.meta.env.VITE_API_URL || 'https://redact-1-worker.joelstevick.workers.dev'}/api/files/${fileId}`, {
          headers: { Authorization: `Bearer ${token}` },
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

  // Poll job status while processing OR while starting detection
  useEffect(() => {
    const shouldPoll = isStartingDetection || (job && ['pending', 'processing'].includes(job.status));
    if (!shouldPoll || !fileId) return;

    const poll = async () => {
      try {
        const { job: updated } = await api.getVideoJobStatus(fileId);
        setJob(updated);

        if (updated.status === 'completed') {
          // Reload detections
          const { detections: dets, tracks: trks } = await api.listVideoDetections(fileId);
          setDetections(dets);
          setTracks(trks);

          // If redaction job completed, get the redacted video URL
          if (updated.job_type === 'redaction') {
            try {
              const { url: redactedUrl } = await api.getRedactedVideoStreamUrl(fileId);
              setRedactedVideoUrl(redactedUrl);
            } catch {
              // Redacted video not ready yet
            }
          }
        }
      } catch {
        // Ignore polling errors - job might not exist yet
      }
    };

    // Poll immediately when starting detection
    if (isStartingDetection && !job) {
      poll();
    }

    const interval = setInterval(poll, 2000);

    return () => clearInterval(interval);
  }, [job, fileId, isStartingDetection]);

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

    setIsStartingDetection(true);
    setError(null);

    try {
      console.log('[VideoReview] Starting detection for file:', fileId);
      const { job: newJob } = await api.startVideoDetection(fileId);
      console.log('[VideoReview] Detection job created:', newJob);
      setJob(newJob);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to start detection';
      console.error('[VideoReview] Detection failed:', errorMsg);

      // If job already in progress, fetch the existing job status
      if (errorMsg.includes('already in progress')) {
        try {
          const { job: existingJob } = await api.getVideoJobStatus(fileId);
          setJob(existingJob);
        } catch {
          setError(errorMsg);
        }
      } else {
        setError(errorMsg);
      }
    } finally {
      setIsStartingDetection(false);
    }
  };

  // Cancel job
  const handleCancelJob = async () => {
    if (!fileId) return;

    console.log('[VideoReview] Cancelling job for file:', fileId);
    try {
      const { job: cancelledJob } = await api.cancelVideoJob(fileId);
      console.log('[VideoReview] Job cancelled:', cancelledJob);
      setJob(cancelledJob);
      setIsStartingDetection(false);
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : 'Failed to cancel job';
      console.error('[VideoReview] Cancel failed:', errorMsg);
      // Even if cancel fails, reset the UI state
      setJob(null);
      setIsStartingDetection(false);
      // Don't show error for "no active job" - job may have already completed
      if (!errorMsg.includes('No active job')) {
        setError(errorMsg);
      }
    }
  };

  // Approve/reject single detection
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

            {/* Original/Redacted tabs */}
            {redactedVideoUrl && (
              <div className="flex rounded overflow-hidden">
                <button
                  onClick={() => setShowRedacted(false)}
                  className={`px-4 py-1 ${!showRedacted ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  Original
                </button>
                <button
                  onClick={() => setShowRedacted(true)}
                  className={`px-4 py-1 ${showRedacted ? 'bg-blue-600' : 'bg-gray-700 hover:bg-gray-600'}`}
                >
                  Redacted
                </button>
              </div>
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

          {/* Centered detection button overlay - show when no detections and no active job */}
          {detections.length === 0 && !isStartingDetection && (!job || ['failed', 'completed', 'cancelled'].includes(job.status)) && (
            <div className="absolute inset-0 flex items-center justify-center z-10">
              <div className="text-center">
                {(job?.status === 'failed' || job?.status === 'cancelled') && job.error_message && (
                  <p className="text-yellow-400 mb-4">
                    {job.error_message === 'Cancelled by user' ? 'Detection cancelled' : job.error_message}
                  </p>
                )}
                <button
                  onClick={handleStartDetection}
                  className="px-8 py-4 text-white text-xl font-semibold rounded-lg shadow-lg transition-colors bg-blue-600 hover:bg-blue-500"
                >
                  {job?.status === 'failed' || job?.status === 'cancelled' ? 'Retry Detection' : 'Detect Faces'}
                </button>
              </div>
            </div>
          )}

          {/* Processing overlay - show when starting detection OR when job is pending/processing */}
          {(isStartingDetection || (job && ['pending', 'processing'].includes(job.status))) && (
            <div className="absolute inset-0 flex items-center justify-center bg-black/50 z-10">
              <div className="text-center w-72">
                <p className="text-xl text-white mb-4">
                  {job?.job_type === 'redaction' ? 'Generating redacted video' : 'Detecting faces'}...
                </p>
                <div className="flex justify-between text-sm text-gray-300 mb-2">
                  <span>Progress</span>
                  <span>{job?.progress ?? 0}%</span>
                </div>
                <div className="w-full h-2 bg-gray-700 rounded overflow-hidden mb-4">
                  <div
                    className="h-full bg-blue-500 transition-all duration-300"
                    style={{ width: `${job?.progress ?? 0}%` }}
                  />
                </div>
                <button
                  onClick={handleCancelJob}
                  disabled={!job}
                  className={`text-sm font-medium ${job ? 'text-red-400 hover:text-red-300' : 'text-gray-500 cursor-not-allowed'}`}
                >
                  Cancel
                </button>
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
        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4">
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


            {/* Job status */}
            {job && (
              <div className="space-y-2">
                <h3 className="font-semibold">Job Status</h3>
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
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
