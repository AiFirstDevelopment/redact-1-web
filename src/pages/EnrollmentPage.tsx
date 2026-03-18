import { useState } from 'react';
import { useAuthStore } from '../stores/authStore';

export function EnrollmentPage() {
  const [departmentCode, setDepartmentCode] = useState('');
  const { enroll, isLoading, error, clearError } = useAuthStore();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await enroll(departmentCode);
    } catch {
      // Error is handled by store
    }
  };

  const handleDemo = () => {
    setDepartmentCode('SPRINGFIELD-PD');
    clearError();
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-100">
      <div className="bg-white p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold mb-2 text-center">Redact-1</h1>
        <p className="text-gray-600 text-center mb-6">Enter your department code to get started</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Department Code
            </label>
            <input
              type="text"
              value={departmentCode}
              onChange={(e) => setDepartmentCode(e.target.value.toUpperCase())}
              placeholder="e.g., SPRINGFIELD-PD"
              className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500 uppercase"
              required
            />
          </div>

          <button
            type="submit"
            disabled={isLoading || !departmentCode}
            className="w-full bg-blue-600 text-white py-2 px-4 rounded-md hover:bg-blue-700 disabled:opacity-50"
          >
            {isLoading ? 'Verifying...' : 'Continue'}
          </button>

          <div className="relative">
            <div className="absolute inset-0 flex items-center">
              <div className="w-full border-t border-gray-300" />
            </div>
            <div className="relative flex justify-center text-sm">
              <span className="px-2 bg-white text-gray-500">or</span>
            </div>
          </div>

          <button
            type="button"
            onClick={handleDemo}
            className="w-full bg-gray-100 text-gray-700 py-2 px-4 rounded-md hover:bg-gray-200 border border-gray-300"
          >
            Use Demo Department
          </button>
        </form>
      </div>
    </div>
  );
}
