import { useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useRequestStore } from '../stores/requestStore';
import { useAuthStore } from '../stores/authStore';

export function RequestsPage() {
  const { requests, isLoading, fetchRequests } = useRequestStore();
  const { user, logout } = useAuthStore();

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

  const formatDate = (timestamp: number) => {
    return new Date(timestamp).toLocaleDateString();
  };

  const getStatusBadge = (status: string) => {
    const colors = {
      new: 'bg-blue-100 text-blue-800',
      in_progress: 'bg-yellow-100 text-yellow-800',
      completed: 'bg-green-100 text-green-800',
    };
    return colors[status as keyof typeof colors] || 'bg-gray-100 text-gray-800';
  };

  return (
    <div className="min-h-screen bg-gray-100">
      <header className="bg-white shadow">
        <div className="max-w-7xl mx-auto px-4 py-4 flex justify-between items-center">
          <h1 className="text-xl font-bold">Redact-1</h1>
          <div className="flex items-center gap-4">
            <span className="text-gray-600">{user?.name}</span>
            <button
              onClick={logout}
              className="text-gray-600 hover:text-gray-900"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-4 py-8">
        <div className="flex justify-between items-center mb-6">
          <h2 className="text-2xl font-bold">Records Requests</h2>
          <Link
            to="/requests/new"
            className="bg-blue-600 text-white px-4 py-2 rounded-md hover:bg-blue-700"
          >
            New Request
          </Link>
        </div>

        {isLoading ? (
          <div className="text-center py-8">Loading...</div>
        ) : requests.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-8 text-center text-gray-500">
            No requests yet. Create your first request to get started.
          </div>
        ) : (
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="min-w-full divide-y divide-gray-200">
              <thead className="bg-gray-50">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Request #
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Title
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Date
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                    Status
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white divide-y divide-gray-200">
                {requests.map((request) => (
                  <tr key={request.id} className="hover:bg-gray-50">
                    <td className="px-6 py-4 whitespace-nowrap">
                      <Link
                        to={`/requests/${request.id}`}
                        className="text-blue-600 hover:text-blue-800"
                      >
                        {request.request_number}
                      </Link>
                    </td>
                    <td className="px-6 py-4">{request.title}</td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      {formatDate(request.request_date)}
                    </td>
                    <td className="px-6 py-4 whitespace-nowrap">
                      <span className={`px-2 py-1 text-xs rounded-full ${getStatusBadge(request.status)}`}>
                        {request.status.replace('_', ' ')}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </main>
    </div>
  );
}
