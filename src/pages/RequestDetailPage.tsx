import { useEffect, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useRequestStore } from '../stores/requestStore';

export function RequestDetailPage() {
  const { id } = useParams<{ id: string }>();
  const { currentRequest, files, isLoading, fetchRequest, fetchFiles, uploadFile } = useRequestStore();
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (id) {
      fetchRequest(id);
      fetchFiles(id);
    }
  }, [id, fetchRequest, fetchFiles]);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && id) {
      await uploadFile(id, file);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const formatFileSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      uploaded: 'bg-gray-100 text-gray-800',
      processing: 'bg-blue-100 text-blue-800',
      detected: 'bg-yellow-100 text-yellow-800',
      reviewed: 'bg-green-100 text-green-800',
      exported: 'bg-purple-100 text-purple-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  if (isLoading || !currentRequest) {
    return <div className="min-h-screen flex items-center justify-center">Loading...</div>;
  }

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4">
          <div className="flex items-center gap-4">
            <Link to="/" className="text-gray-600 hover:text-gray-900">
              &larr; Back
            </Link>
            <h1 className="text-xl font-bold">{currentRequest.request_number}</h1>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <h2 className="text-lg font-semibold mb-4">{currentRequest.title}</h2>
          {currentRequest.notes && (
            <p className="text-gray-600">{currentRequest.notes}</p>
          )}
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <div className="flex justify-between items-center mb-4">
            <h3 className="text-lg font-semibold">Files</h3>
            <label className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700 cursor-pointer">
              Upload File
              <input
                ref={fileInputRef}
                type="file"
                accept="image/*,.pdf"
                onChange={handleFileUpload}
                className="hidden"
              />
            </label>
          </div>

          {files.length === 0 ? (
            <p className="text-gray-500 text-center py-8">
              No files uploaded yet.
            </p>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {files.map((file) => (
                <Link
                  key={file.id}
                  to={`/files/${file.id}`}
                  className="border rounded-lg p-4 hover:border-blue-500 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-gray-100 rounded flex items-center justify-center">
                      {file.file_type === 'image' ? (
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
                        </svg>
                      ) : (
                        <svg className="w-6 h-6 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                        </svg>
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-medium truncate">{file.filename}</p>
                      <p className="text-sm text-gray-500">{formatFileSize(file.file_size)}</p>
                    </div>
                    <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(file.status)}`}>
                      {file.status}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
