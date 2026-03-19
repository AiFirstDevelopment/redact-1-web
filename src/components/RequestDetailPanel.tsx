import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRequestStore } from '../stores/requestStore';
import { api } from '../services/api';
import type { Request, EvidenceFile, User, AuditLog } from '../types';

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

  const openFileReview = (fileId: string) => {
    navigate(`/files/${fileId}?request=${request.id}`);
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
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center bg-card-white">
        <div>
          <h3 className="font-semibold text-blue-600">{request.request_number}</h3>
          <p className="text-sm text-gray-500">Request Details</p>
        </div>
        <button
          onClick={onClose}
          className="p-2 text-gray-400 hover:text-gray-600"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Content */}
      <div className="flex-1 overflow-auto p-4">
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
            <h4 className="font-semibold">File</h4>
            {files.length === 0 && (
              <label className={`px-3 py-1.5 text-sm rounded-md cursor-pointer ${
                isUploading
                  ? 'bg-gray-300 text-gray-500'
                  : 'bg-blue-600 text-white hover:bg-blue-700'
              }`}>
                {isUploading ? 'Uploading...' : 'Upload PDF'}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf"
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
                  onClick={() => openFileReview(file.id)}
                  className="flex items-center gap-3 p-3 border rounded-lg hover:border-blue-300 cursor-pointer transition-colors"
                >
                  <div className="w-10 h-10 bg-gray-100 rounded flex items-center justify-center flex-shrink-0">
                    <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                    </svg>
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
    </div>
  );
}
