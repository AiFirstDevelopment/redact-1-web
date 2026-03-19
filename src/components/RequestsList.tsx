import { useState } from 'react';
import type { Request } from '../types';
import { api } from '../services/api';

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
}: RequestsListProps) {
  const [searchTerm, setSearchTerm] = useState('');
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingTitle, setEditingTitle] = useState('');

  const filteredRequests = requests.filter(
    (r) =>
      r.request_number.toLowerCase().includes(searchTerm.toLowerCase()) ||
      r.title.toLowerCase().includes(searchTerm.toLowerCase())
  );

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

  const handleDelete = (id: string) => {
    if (deleteConfirm === id) {
      onDelete?.(id);
      setDeleteConfirm(null);
    } else {
      setDeleteConfirm(id);
    }
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

  return (
    <div className="p-6">
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

      {/* Search */}
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search requests..."
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
          className="w-full px-4 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
      </div>

      {/* List */}
      {isLoading ? (
        <div className="text-center py-8 text-gray-500">Loading...</div>
      ) : filteredRequests.length === 0 ? (
        <div className="text-center py-8 text-gray-500">
          {searchTerm ? 'No matching requests found.' : 'No requests yet.'}
        </div>
      ) : (
        <div className="space-y-2">
          {filteredRequests.map((request) => (
            <div
              key={request.id}
              className={`bg-white rounded-lg border p-4 cursor-pointer transition-colors ${
                selectedId === request.id
                  ? 'border-blue-500 ring-2 ring-blue-200'
                  : 'border-gray-200 hover:border-gray-300'
              }`}
              onClick={() => onSelect(request)}
            >
              <div className="flex justify-between items-start">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="font-semibold text-blue-600">
                      {request.request_number}
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
                      {request.title || 'Add title...'}
                    </p>
                  )}
                  <p className="text-sm text-gray-500 mt-1" title="Date request was received">
                    {formatDate(request.request_date)}
                  </p>
                </div>
                <div className="flex gap-1 ml-4">
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
                  ) : (
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        onArchive?.(request.id);
                      }}
                      className="p-2 text-gray-400 hover:text-yellow-600"
                      title="Archive"
                    >
                      <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 8h14M5 8a2 2 0 110-4h14a2 2 0 110 4M5 8v10a2 2 0 002 2h10a2 2 0 002-2V8m-9 4h4" />
                      </svg>
                    </button>
                  )}
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      handleDelete(request.id);
                    }}
                    className={`p-2 ${deleteConfirm === request.id ? 'text-red-600' : 'text-gray-400 hover:text-red-600'}`}
                    title={deleteConfirm === request.id ? 'Click again to confirm' : 'Delete'}
                  >
                    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                    </svg>
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
