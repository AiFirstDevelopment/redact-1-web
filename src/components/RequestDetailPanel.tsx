import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRequestStore } from '../stores/requestStore';
import { api } from '../services/api';
import type { Request, RequestTimeline, EvidenceFile, User, AuditLog } from '../types';

interface RequestDetailPanelProps {
  request: Request;
  onClose: () => void;
  onRequestUpdated?: () => void;
}

export function RequestDetailPanel({ request, onClose, onRequestUpdated }: RequestDetailPanelProps) {
  const { files, fetchFiles, uploadFile, deleteFile } = useRequestStore();
  const [isUploading, setIsUploading] = useState(false);
  const [fileToDelete, setFileToDelete] = useState<EvidenceFile | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [isEditingTitle, setIsEditingTitle] = useState(false);
  const [editingTitle, setEditingTitle] = useState(request.title || '');
  const [users, setUsers] = useState<User[]>([]);
  const [isAssigning, setIsAssigning] = useState(false);
  const [auditLogs, setAuditLogs] = useState<AuditLog[]>([]);
  const [showAuditLog, setShowAuditLog] = useState(false);
  const [timeline, setTimeline] = useState<RequestTimeline[]>([]);
  const [showTimeline, setShowTimeline] = useState(false);
  const [showTollModal, setShowTollModal] = useState(false);
  const [showExtendModal, setShowExtendModal] = useState(false);
  const [tollReason, setTollReason] = useState('');
  const [extendReason, setExtendReason] = useState('');
  const [extendDate, setExtendDate] = useState('');
  const [isTolling, setIsTolling] = useState(false);
  const [isExtending, setIsExtending] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  const saveTitle = async () => {
    try {
      await api.updateRequest(request.id, { title: editingTitle });
      setIsEditingTitle(false);
      onRequestUpdated?.();
    } catch (err) {
      console.error('Failed to update title:', err);
    }
  };

  const cancelEditingTitle = () => {
    setIsEditingTitle(false);
    setEditingTitle(request.title || '');
  };

  useEffect(() => {
    fetchFiles(request.id);
  }, [request.id, fetchFiles]);

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

  const handleAssignmentChange = async (userId: string) => {
    setIsAssigning(true);
    try {
      await api.updateRequest(request.id, { created_by: userId });
      onRequestUpdated?.();
      fetchAuditLogs(); // Refresh audit log after assignment change
    } catch (err) {
      console.error('Failed to assign request:', err);
    } finally {
      setIsAssigning(false);
    }
  };

  const fetchAuditLogs = async () => {
    try {
      const { audit_logs } = await api.getRequestAuditLogs(request.id);
      setAuditLogs(audit_logs);
    } catch (err) {
      console.error('Failed to fetch audit logs:', err);
    }
  };

  useEffect(() => {
    fetchAuditLogs();
  }, [request.id]);

  const fetchTimeline = async () => {
    try {
      const { timeline } = await api.getRequestTimeline(request.id);
      setTimeline(timeline);
    } catch (err) {
      console.error('Failed to fetch timeline:', err);
    }
  };

  useEffect(() => {
    fetchTimeline();
  }, [request.id]);

  const handleToll = async () => {
    if (!tollReason.trim()) return;
    setIsTolling(true);
    try {
      await api.tollRequest(request.id, tollReason);
      setShowTollModal(false);
      setTollReason('');
      onRequestUpdated?.();
      fetchTimeline();
      fetchAuditLogs();
    } catch (err) {
      console.error('Failed to toll request:', err);
    } finally {
      setIsTolling(false);
    }
  };

  const handleResume = async () => {
    try {
      await api.resumeRequest(request.id);
      onRequestUpdated?.();
      fetchTimeline();
      fetchAuditLogs();
    } catch (err) {
      console.error('Failed to resume request:', err);
    }
  };

  const handleExtend = async () => {
    if (!extendReason.trim() || !extendDate) return;
    setIsExtending(true);
    try {
      const newDueDate = new Date(extendDate).getTime();
      await api.extendRequest(request.id, extendReason, newDueDate);
      setShowExtendModal(false);
      setExtendReason('');
      setExtendDate('');
      onRequestUpdated?.();
      fetchTimeline();
      fetchAuditLogs();
    } catch (err) {
      console.error('Failed to extend request:', err);
    } finally {
      setIsExtending(false);
    }
  };

  const getDueDateStatus = () => {
    if (!request.due_date) return null;
    if (request.tolled_at) {
      return { label: 'Tolled', className: 'bg-gray-200 text-gray-700' };
    }
    const now = Date.now();
    const dueDate = request.due_date < 1e12 ? request.due_date * 1000 : request.due_date;
    const daysRemaining = Math.ceil((dueDate - now) / (1000 * 60 * 60 * 24));

    if (daysRemaining < 0) {
      return { label: `${Math.abs(daysRemaining)} days overdue`, className: 'bg-red-600 text-white' };
    } else if (daysRemaining === 0) {
      return { label: 'Due today', className: 'bg-orange-500 text-white' };
    } else if (daysRemaining <= 3) {
      return { label: `${daysRemaining} days remaining`, className: 'bg-yellow-500 text-white' };
    } else if (daysRemaining <= 5) {
      return { label: `${daysRemaining} days remaining`, className: 'bg-yellow-400 text-gray-900' };
    } else {
      return { label: `${daysRemaining} days remaining`, className: 'bg-green-100 text-green-800' };
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      setIsUploading(true);
      try {
        await uploadFile(request.id, file);
      } catch (err) {
        console.error('Upload failed:', err);
      } finally {
        setIsUploading(false);
        if (fileInputRef.current) {
          fileInputRef.current.value = '';
        }
      }
    }
  };

  const formatDate = (timestamp: number) => {
    // Handle timestamps in seconds vs milliseconds
    const ms = timestamp < 1e12 ? timestamp * 1000 : timestamp;
    return new Date(ms).toLocaleDateString();
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    const colors: Record<string, string> = {
      new: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
      uploaded: 'bg-gray-100 text-gray-800',
      processing: 'bg-blue-100 text-blue-800',
      detected: 'bg-yellow-100 text-yellow-800',
      reviewed: 'bg-green-100 text-green-800',
      exported: 'bg-purple-100 text-purple-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const openFileReview = (file: EvidenceFile) => {
    if (file.file_type === 'video') {
      navigate(`/videos/${file.id}?request=${request.id}`);
    } else {
      navigate(`/files/${file.id}?request=${request.id}`);
    }
  };

  const handleDeleteClick = (e: React.MouseEvent, file: EvidenceFile) => {
    e.stopPropagation();
    setFileToDelete(file);
  };

  const handleConfirmDelete = async () => {
    if (!fileToDelete) return;
    setIsDeleting(true);
    try {
      await deleteFile(fileToDelete.id);
      setFileToDelete(null);
    } catch (err) {
      console.error('Delete failed:', err);
    } finally {
      setIsDeleting(false);
    }
  };

  return (
    <div className="h-full flex flex-col relative">
      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
        {/* Header */}
        <div className="flex justify-between items-center mb-4">
          <h3 className="font-semibold text-blue-600 text-lg">{request.request_number}</h3>
          <button
            onClick={onClose}
            className="p-2 text-gray-700 hover:text-gray-900"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
        {/* Request Info */}
        <div className="bg-card-white border rounded-lg p-4 mb-4 shadow-sm">
          {isEditingTitle ? (
            <div className="flex items-center gap-2 mb-2">
              <input
                type="text"
                value={editingTitle}
                onChange={(e) => setEditingTitle(e.target.value)}
                className="flex-1 px-2 py-1 text-lg font-semibold border border-gray-300 rounded focus:outline-none focus:ring-1 focus:ring-blue-500"
                placeholder="Add title..."
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') saveTitle();
                  if (e.key === 'Escape') cancelEditingTitle();
                }}
              />
              <button
                onClick={saveTitle}
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
            <h4
              className={`font-semibold text-lg mb-2 ${request.title ? '' : 'text-gray-400 italic'} hover:text-blue-600 cursor-text`}
              onClick={() => setIsEditingTitle(true)}
              title="Click to edit title"
            >
              {request.title || 'Add title...'}
            </h4>
          )}
          <div className="grid grid-cols-2 gap-4 text-sm">
            <div>
              <span className="text-gray-500">Request Date:</span>
              <p className="font-medium">{formatDate(request.request_date)}</p>
            </div>
            <div>
              <span className="text-gray-500">Status:</span>
              <p>
                <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusBadge(request.status)}`}>
                  {request.status.replace('_', ' ')}
                </span>
              </p>
            </div>
          </div>

          {/* Due Date Section */}
          {request.due_date && (
            <div className="mt-4 p-3 bg-gray-50 rounded-lg">
              <div className="flex items-center justify-between mb-2">
                <span className="text-gray-500 text-sm">Due Date:</span>
                {(() => {
                  const status = getDueDateStatus();
                  return status ? (
                    <span className={`px-2 py-0.5 text-xs rounded-full ${status.className}`}>
                      {status.label}
                    </span>
                  ) : null;
                })()}
              </div>
              <p className="font-medium mb-3">{formatDate(request.due_date)}</p>
              {request.tolled_days > 0 && (
                <p className="text-xs text-gray-500 mb-2">
                  Total tolled: {request.tolled_days} business days
                </p>
              )}
              <div className="flex gap-2">
                {request.tolled_at ? (
                  <button
                    onClick={handleResume}
                    className="flex-1 px-3 py-1.5 text-sm bg-green-600 text-white rounded hover:bg-green-700"
                  >
                    Resume Clock
                  </button>
                ) : (
                  <button
                    onClick={() => setShowTollModal(true)}
                    className="flex-1 px-3 py-1.5 text-sm bg-gray-600 text-white rounded hover:bg-gray-700"
                  >
                    Toll (Pause)
                  </button>
                )}
                <button
                  onClick={() => setShowExtendModal(true)}
                  className="flex-1 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                >
                  Extend
                </button>
              </div>
            </div>
          )}

          <div className="mt-4">
            <span className="text-gray-500 text-sm">Assigned To:</span>
            <select
              value={request.created_by}
              onChange={(e) => handleAssignmentChange(e.target.value)}
              disabled={isAssigning}
              className="mt-1 block w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 disabled:opacity-50"
            >
              {users.map((user) => (
                <option key={user.id} value={user.id}>
                  {user.name} ({user.role})
                </option>
              ))}
            </select>
          </div>
          {request.notes && (
            <div className="mt-4">
              <span className="text-gray-500 text-sm">Notes:</span>
              <p className="mt-1 text-sm">{request.notes}</p>
            </div>
          )}
        </div>

        {/* Due Date Timeline Section */}
        {request.due_date && (
          <div className="bg-card-white border rounded-lg p-4 mb-4 shadow-sm">
            <button
              onClick={() => setShowTimeline(!showTimeline)}
              className="flex items-center justify-between w-full text-left"
            >
              <h4 className="font-semibold">Due Date History</h4>
              <svg
                className={`w-5 h-5 text-gray-500 transition-transform ${showTimeline ? 'rotate-180' : ''}`}
                fill="none"
                stroke="currentColor"
                viewBox="0 0 24 24"
              >
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
              </svg>
            </button>
            {showTimeline && (
              <div className="mt-3 space-y-2 max-h-48 overflow-auto">
                {timeline.length === 0 ? (
                  <p className="text-gray-500 text-sm">No timeline events.</p>
                ) : (
                  timeline.map((event) => (
                    <div key={event.id} className="text-sm border-l-2 border-blue-200 pl-3 py-1">
                      <div className="flex justify-between items-start">
                        <span className="font-medium text-gray-900 capitalize">
                          {event.event_type.replace('_', ' ')}
                        </span>
                        <span className="text-xs text-gray-400">
                          {formatDate(event.created_at)}
                        </span>
                      </div>
                      {event.reason && (
                        <p className="text-gray-600 text-xs">{event.reason}</p>
                      )}
                      {event.new_due_date && (
                        <p className="text-gray-500 text-xs">
                          New due date: {formatDate(event.new_due_date)}
                        </p>
                      )}
                      <p className="text-gray-400 text-xs">by {event.user_name || 'System'}</p>
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Audit Trail Section */}
        <div className="bg-card-white border rounded-lg p-4 mb-4 shadow-sm">
          <button
            onClick={() => setShowAuditLog(!showAuditLog)}
            className="flex items-center justify-between w-full text-left"
          >
            <h4 className="font-semibold">Activity Log</h4>
            <svg
              className={`w-5 h-5 text-gray-500 transition-transform ${showAuditLog ? 'rotate-180' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
            </svg>
          </button>
          {showAuditLog && (
            <div className="mt-3 space-y-2 max-h-48 overflow-auto">
              {auditLogs.length === 0 ? (
                <p className="text-gray-500 text-sm">No activity recorded yet.</p>
              ) : (
                auditLogs.map((log) => (
                  <div key={log.id} className="text-sm border-l-2 border-gray-200 pl-3 py-1">
                    <div className="flex justify-between items-start">
                      <span className="font-medium text-gray-900">
                        {log.user_name || 'System'}
                      </span>
                      <span className="text-xs text-gray-400">
                        {formatDate(log.created_at)}
                      </span>
                    </div>
                    <p className="text-gray-600">
                      {log.action.charAt(0).toUpperCase() + log.action.slice(1)} {log.entity_type}
                      {log.details && (
                        <span className="text-gray-400 ml-1">
                          - {(() => {
                            try {
                              const details = JSON.parse(log.details);
                              if (details.created_by) return `assigned to user`;
                              if (details.status) return `status: ${details.status}`;
                              if (details.title !== undefined) return `title updated`;
                              return '';
                            } catch {
                              return log.details;
                            }
                          })()}
                        </span>
                      )}
                    </p>
                  </div>
                ))
              )}
            </div>
          )}
        </div>

        {/* Files Section */}
        <div className="bg-card-white border rounded-lg p-4 shadow-sm">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold">Files</h4>
            {files.length === 0 && (
              <label className={`px-3 py-1.5 text-sm rounded-md cursor-pointer ${
                isUploading
                  ? 'bg-gray-300 text-gray-500'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
                {isUploading ? 'Uploading...' : 'Upload File'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.txt,.csv,.doc,.docx,text/*,image/*,video/*"
                  onChange={handleFileUpload}
                  disabled={isUploading}
                  className="hidden"
                />
              </label>
            )}
          </div>

          {files.length === 0 ? (
            <p className="text-gray-500 text-center py-4 text-sm">
              No file uploaded yet.
            </p>
          ) : (
            <div className="space-y-2">
              {files.map((file) => (
                <div
                  key={file.id}
                  onClick={() => openFileReview(file)}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:border-blue-300 cursor-pointer transition-colors"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                    {file.file_type === 'video' ? (
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="font-medium text-sm truncate">{file.filename}</p>
                      {(() => {
                        const detections = file.detection_count ?? 0;
                        const pending = file.pending_count ?? 0;
                        const isReviewed = file.status === 'reviewed' || file.status === 'exported';

                        // File explicitly marked as reviewed (no redactions needed)
                        if (isReviewed && detections === 0) {
                          return (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-green-600 text-white flex-shrink-0">
                              Completed
                            </span>
                          );
                        }
                        // Has detections with some pending
                        if (detections > 0 && pending > 0) {
                          return (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-yellow-500 text-white flex-shrink-0">
                              Draft
                            </span>
                          );
                        }
                        // Has detections, all reviewed
                        if (detections > 0 && pending === 0) {
                          return (
                            <span className="px-1.5 py-0.5 text-xs rounded bg-green-600 text-white flex-shrink-0">
                              Completed
                            </span>
                          );
                        }
                        // No detections yet - file is new/unprocessed
                        return (
                          <span className="px-1.5 py-0.5 text-xs rounded bg-blue-500 text-white flex-shrink-0">
                            New
                          </span>
                        );
                      })()}
                    </div>
                    <p className="text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
                  </div>
                  <button
                    onClick={(e) => handleDeleteClick(e, file)}
                    className="p-1.5 text-red-500 hover:bg-red-50 rounded transition-colors"
                    title="Delete file"
                  >
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                    </svg>
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {fileToDelete && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold text-red-600 mb-4">Confirm Delete File</h3>
            <p className="text-gray-600 mb-6">
              Are you sure you want to delete <span className="font-semibold">{fileToDelete.filename}</span>? This action cannot be undone.
            </p>
            <div className="flex gap-3">
              <button
                onClick={() => setFileToDelete(null)}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={isDeleting}
              >
                Cancel
              </button>
              <button
                onClick={handleConfirmDelete}
                className="flex-1 px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700 disabled:opacity-50"
                disabled={isDeleting}
              >
                {isDeleting ? 'Deleting...' : 'Delete'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Toll Modal */}
      {showTollModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Toll (Pause) Due Date</h3>
            <p className="text-gray-600 text-sm mb-4">
              Tolling pauses the deadline clock. The due date will be extended by the number of business days tolled when resumed.
            </p>
            <label className="block text-sm text-gray-700 mb-2">Reason for tolling:</label>
            <textarea
              value={tollReason}
              onChange={(e) => setTollReason(e.target.value)}
              placeholder="e.g., Awaiting clarification from requester"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-4"
              rows={3}
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowTollModal(false);
                  setTollReason('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={isTolling}
              >
                Cancel
              </button>
              <button
                onClick={handleToll}
                className="flex-1 px-4 py-2 bg-gray-600 text-white rounded-md hover:bg-gray-700 disabled:opacity-50"
                disabled={isTolling || !tollReason.trim()}
              >
                {isTolling ? 'Tolling...' : 'Toll Clock'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Extend Modal */}
      {showExtendModal && (
        <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-50">
          <div className="bg-white rounded-lg p-6 max-w-sm mx-4 shadow-xl">
            <h3 className="text-lg font-semibold mb-4">Extend Due Date</h3>
            <label className="block text-sm text-gray-700 mb-2">Reason for extension:</label>
            <textarea
              value={extendReason}
              onChange={(e) => setExtendReason(e.target.value)}
              placeholder="e.g., Unusual circumstances - voluminous records"
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-4"
              rows={2}
            />
            <label className="block text-sm text-gray-700 mb-2">New due date:</label>
            <input
              type="date"
              value={extendDate}
              onChange={(e) => setExtendDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-1 focus:ring-blue-500 mb-4"
            />
            <div className="flex gap-3">
              <button
                onClick={() => {
                  setShowExtendModal(false);
                  setExtendReason('');
                  setExtendDate('');
                }}
                className="flex-1 px-4 py-2 border border-gray-300 rounded-md text-gray-700 hover:bg-gray-50"
                disabled={isExtending}
              >
                Cancel
              </button>
              <button
                onClick={handleExtend}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50"
                disabled={isExtending || !extendReason.trim() || !extendDate}
              >
                {isExtending ? 'Extending...' : 'Extend'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
