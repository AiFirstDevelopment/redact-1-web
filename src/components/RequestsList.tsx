import { useState, useEffect, useCallback, useRef } from 'react';
import { FixedSizeList as List, ListOnScrollProps } from 'react-window';
import * as pdfjsLib from 'pdfjs-dist';
import pdfjsWorker from 'pdfjs-dist/build/pdf.worker.min.mjs?url';
import JSZip from 'jszip';
import { saveAs } from 'file-saver';
import type { Request, User, Detection, AuditLog } from '../types';
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

        // For videos, get the redacted version if available
        if (file.file_type === 'video') {
          try {
            const { url } = await api.getRedactedVideoStreamUrl(file.id);
            const response = await fetch(url);
            if (response.ok) {
              const blob = await response.blob();
              const baseName = file.filename.replace(/\.[^/.]+$/, '');
              zip.folder('redacted')?.file(`${baseName}_redacted.mp4`, blob);
            }
          } catch {
            // No redacted video available, skip
            console.log(`Skipping video ${file.filename} - no redacted version`);
          }
          continue;
        }

        // Get detections for this file
        const { detections } = await api.listDetections(file.id);
        const approvedDetections = detections.filter((d: Detection) => d.status === 'approved');

        // Get original file
        const blob = await api.getFileOriginal(file.id);

        if (file.file_type === 'pdf') {
          // Render PDF with redactions
          const arrayBuffer = await blob.arrayBuffer();
          const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
          const redactedFolder = zip.folder('redacted');

          for (let pageNum = 1; pageNum <= pdf.numPages; pageNum++) {
            const page = await pdf.getPage(pageNum);
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

            // Draw black rectangles over approved detections for this page
            context.fillStyle = '#000000';
            for (const detection of approvedDetections) {
              if (detection.page_number === pageNum || detection.page_number === null) {
                const x = (detection.bbox_x ?? 0) * canvas.width;
                const y = (detection.bbox_y ?? 0) * canvas.height;
                const w = (detection.bbox_width ?? 0) * canvas.width;
                const h = (detection.bbox_height ?? 0) * canvas.height;
                context.fillRect(x, y, w, h);
              }
            }

            // Convert to blob and add to zip
            const pageBlob = await new Promise<Blob>((resolve) => {
              canvas.toBlob((b) => resolve(b!), 'image/png');
            });
            const baseName = file.filename.replace(/\.[^/.]+$/, '');
            redactedFolder?.file(`${baseName}_page${pageNum}.png`, pageBlob);
          }
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
      onDelete?.(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
      setArchiveConfirm(null); // Cancel any pending archive
    }
  };

  const handleArchive = (id: string) => {
    if (archiveConfirm === id) {
      onArchive?.(id);
      setArchiveConfirm(null);
    } else {
      setArchiveConfirm(id);
      setDeleteConfirm(null); // Cancel any pending delete
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

  // Row renderer for virtual list
  const Row = useCallback(({ index, style }: { index: number; style: React.CSSProperties }) => {
    const request = filteredRequests[index];
    if (!request) return null;

    return (
      <div style={{ ...style, paddingBottom: 8 }}>
        <div
          className={`bg-card-white rounded-lg border p-4 cursor-pointer transition-all shadow-sm hover:shadow-md ${
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
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    onUnarchive?.(request.id);
                  }}
                  className="p-2 text-gray-400 hover:text-blue-600"
                  title="Restore"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
                  </svg>
                </button>
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
  }, [filteredRequests, selectedId, editingId, editingTitle, deleteConfirm, archiveConfirm, assigningId, users, downloadReadyMap, downloadingId, downloadProgress, showArchived, searchTerm, onSelect, onArchive, onUnarchive, onDelete, onRequestUpdated, openAuditModal]);

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
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchTerm ? 'No matching requests found.' : 'No requests yet.'}
        </div>
      ) : (
        <div ref={containerRef}>
          <List
            height={listHeight}
            itemCount={filteredRequests.length}
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
