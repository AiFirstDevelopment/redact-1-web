import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuthStore } from '../stores/authStore';
import { BadgeLogo } from '../components/BadgeLogo';

export function EnrollmentPage() {
  const [departmentCode, setDepartmentCode] = useState('');
  const { enroll, isLoading, error } = useAuthStore();
  const navigate = useNavigate();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await enroll(departmentCode);
      navigate('/');
    } catch {
      // Error is handled by store
    }
  };

  return (
    <div className="min-h-screen flex flex-col items-center justify-center bg-pastel-blue">
      <BadgeLogo className="w-24 h-24 mb-6 drop-shadow-lg" />
      <div className="bg-pastel-mint p-8 rounded-lg shadow-xl w-full max-w-md border border-pastel-cream/50">
        <p className="text-white/80 text-center mb-6">Enter your department code to get started</p>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded">
              {error}
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-white mb-1">
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
        </form>
      </div>
    </div>
  );
}
