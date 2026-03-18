import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useRequestStore } from '../stores/requestStore';
import type { Request } from '../types';

interface RequestDetailPanelProps {
  request: Request;
  onClose: () => void;
}

export function RequestDetailPanel({ request, onClose }: RequestDetailPanelProps) {
  const { files, fetchFiles, uploadFile } = useRequestStore();
  const [isUploading, setIsUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const navigate = useNavigate();

  useEffect(() => {
    fetchFiles(request.id);
  }, [request.id, fetchFiles]);

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
    return new Date(timestamp).toLocaleDateString();
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
    navigate(`/files/${fileId}`);
  };

  return (
    <div className="h-full flex flex-col">
      {/* Header */}
      <div className="p-4 border-b flex justify-between items-center bg-gray-50">
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
        <div className="bg-white border rounded-lg p-4 mb-4">
          <h4 className="font-semibold text-lg mb-2">{request.title}</h4>
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
          {request.notes && (
            <div className="mt-4">
              <span className="text-gray-500 text-sm">Notes:</span>
              <p className="mt-1 text-sm">{request.notes}</p>
            </div>
          )}
        </div>

        {/* Files Section */}
        <div className="bg-white border rounded-lg p-4">
          <div className="flex justify-between items-center mb-4">
            <h4 className="font-semibold">Files</h4>
            <label className={`px-3 py-1.5 text-sm rounded-md cursor-pointer ${
              isUploading
                ? 'bg-gray-300 text-gray-500'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}>
              {isUploading ? 'Uploading...' : 'Upload File'}
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                disabled={isUploading}
                className="hidden"
              />
            </label>
          </div>

          {files.length === 0 ? (
            <p className="text-gray-500 text-center py-4 text-sm">
              No files uploaded yet.
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
                    {file.file_type === 'image' ? (
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                    ) : (
                      <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-medium text-sm truncate">{file.filename}</p>
                    <p className="text-xs text-gray-500">{formatFileSize(file.file_size)}</p>
                  </div>
                  <span className={`px-2 py-0.5 text-xs rounded-full ${getStatusBadge(file.status)}`}>
                    {file.status}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
