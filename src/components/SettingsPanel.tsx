import { useState, useEffect } from 'react';
import { useClerk } from '@clerk/clerk-react';
import { useAuthStore } from '../stores/authStore';
import { api } from '../services/api';

export function SettingsPanel() {
  const { user, agency } = useAuthStore();
  const { signOut } = useClerk();
  const [deadlineDays, setDeadlineDays] = useState(10);
  const [deadlineType, setDeadlineType] = useState<'business_days' | 'calendar_days'>('business_days');
  const [initialDays, setInitialDays] = useState(10);
  const [initialType, setInitialType] = useState<'business_days' | 'calendar_days'>('business_days');
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState<string | null>(null);

  // Load settings from agency in auth store
  useEffect(() => {
    if (agency) {
      const days = agency.default_deadline_days || 10;
      const type = agency.deadline_type || 'business_days';
      setDeadlineDays(days);
      setDeadlineType(type);
      setInitialDays(days);
      setInitialType(type);
    }
  }, [agency]);

  const hasChanges = deadlineDays !== initialDays || deadlineType !== initialType;

  const handleSaveDeadlineSettings = async () => {
    if (!agency?.id) return;
    setIsSaving(true);
    setSaveMessage(null);
    try {
      await api.updateAgency(agency.id, {
        default_deadline_days: deadlineDays,
        deadline_type: deadlineType,
      });
      // Update initial values after successful save
      setInitialDays(deadlineDays);
      setInitialType(deadlineType);
      setSaveMessage('Settings saved successfully');
      setTimeout(() => setSaveMessage(null), 3000);
    } catch (err) {
      console.error('Failed to save settings:', err);
      setSaveMessage('Failed to save settings');
    } finally {
      setIsSaving(false);
    }
  };

  const handleSignOut = async () => {
    await signOut();
  };

  const handleChangeDepartment = async () => {
    // Clear token and reload to go through enrollment flow again
    localStorage.removeItem('token');
    window.location.reload();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto bg-pastel-blue min-h-full">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      {/* Profile Section */}
      <div className="bg-card-white border rounded-lg p-6 mb-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-4">Profile</h3>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="text-sm text-gray-500">Name</label>
              <p className="font-medium">{user?.name}</p>
            </div>
            <div>
              <label className="text-sm text-gray-500">Email</label>
              <p className="font-medium">{user?.email}</p>
            </div>
          </div>
          <div>
            <label className="text-sm text-gray-500">Role</label>
            <p className="font-medium capitalize">{user?.role}</p>
          </div>
        </div>
      </div>

      {/* Department Section */}
      <div className="bg-card-white border rounded-lg p-6 mb-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-4">Department</h3>
        <div className="space-y-4">
          <div>
            <label className="text-sm text-gray-500">Department Name</label>
            <p className="font-medium">{agency?.name}</p>
          </div>
          <div>
            <label className="text-sm text-gray-500">Department Code</label>
            <p className="font-medium font-mono">{agency?.code}</p>
          </div>
          <button
            onClick={handleChangeDepartment}
            className="text-sm text-blue-600 hover:text-blue-800"
          >
            Change Department
          </button>
        </div>
      </div>

      {/* Due Date Settings Section (Supervisors only) */}
      {user?.role === 'supervisor' && (
        <div className="bg-card-white border rounded-lg p-6 mb-6 shadow-sm">
          <h3 className="font-semibold text-lg mb-4">Due Date Settings</h3>
          <p className="text-sm text-gray-500 mb-4">
            Configure the default response deadline for new records requests.
          </p>
          <div className="space-y-4">
            <div>
              <label className="block text-sm text-gray-500 mb-1">Default Deadline (days)</label>
              <input
                type="number"
                min="1"
                max="90"
                value={deadlineDays}
                onChange={(e) => setDeadlineDays(parseInt(e.target.value) || 10)}
                className="w-32 px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-500 mb-1">Deadline Type</label>
              <select
                value={deadlineType}
                onChange={(e) => setDeadlineType(e.target.value as 'business_days' | 'calendar_days')}
                className="px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-1 focus:ring-blue-500"
              >
                <option value="business_days">Business Days (excludes weekends)</option>
                <option value="calendar_days">Calendar Days</option>
              </select>
            </div>
            <div className="flex items-center gap-3">
              <button
                onClick={handleSaveDeadlineSettings}
                disabled={isSaving || !hasChanges}
                className="px-4 py-2 bg-blue-600 text-white rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {isSaving && (
                  <svg className="animate-spin h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                )}
                {isSaving ? 'Saving...' : 'Save Settings'}
              </button>
              {saveMessage && (
                <span className={`text-sm ${saveMessage.includes('Failed') ? 'text-red-600' : 'text-green-600'}`}>
                  {saveMessage}
                </span>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Account Section */}
      <div className="bg-card-white border rounded-lg p-6 shadow-sm">
        <h3 className="font-semibold text-lg mb-4">Account</h3>
        <button
          onClick={handleSignOut}
          className="px-4 py-2 bg-red-600 text-white rounded-md hover:bg-red-700"
        >
          Sign Out
        </button>
      </div>
    </div>
  );
}
