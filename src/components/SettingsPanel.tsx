import { useAuthStore } from '../stores/authStore';

export function SettingsPanel() {
  const { user, agency, logout } = useAuthStore();

  const handleSignOut = async () => {
    await logout();
  };

  const handleChangeDepartment = () => {
    localStorage.removeItem('agency');
    localStorage.removeItem('token');
    window.location.reload();
  };

  return (
    <div className="p-6 max-w-2xl mx-auto">
      <h2 className="text-2xl font-bold mb-6">Settings</h2>

      {/* Profile Section */}
      <div className="bg-white border rounded-lg p-6 mb-6">
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
      <div className="bg-white border rounded-lg p-6 mb-6">
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

      {/* Account Section */}
      <div className="bg-white border rounded-lg p-6">
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
