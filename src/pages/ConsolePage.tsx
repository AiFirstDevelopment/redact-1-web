import { useEffect, useState, useCallback } from 'react';
import { api } from '../services/api';

interface SystemStatus {
  timestamp: number;
  cloudflare: {
    worker: { status: string };
    d1: { status: string; counts: Record<string, number> };
    r2: { status: string; bucket: string };
  };
  aws: {
    lambda: {
      detection: { running: number; invocationsLast5Min: number };
      redaction: { running: number; invocationsLast5Min: number };
    };
    s3: { bucket: string; status: string };
    rekognition: { status: string };
  };
  jobs: {
    last24h: { pending: number; processing: number; completed: number; failed: number; cancelled: number };
  };
}

interface UsageSummary {
  period: string;
  rekognition_images: number;
  rekognition_video_minutes: number;
  lambda_detection_seconds: number;
  lambda_redaction_seconds: number;
  s3_upload_gb: number;
  s3_download_gb: number;
  r2_upload_gb: number;
  r2_download_gb: number;
  estimated_cost_usd: number;
}

interface AWSMetrics {
  period: { start: string; end: string };
  costs: Array<{ service: string; cost: number; unit: string }>;
  totalCost: number;
  lambda: {
    detectionInvocations: number;
    detectionDurationMs: number;
    redactionInvocations: number;
    redactionDurationMs: number;
  };
  rekognition: { faceDetectionMinutes: number };
  s3: { storageSizeBytes: number; getRequests: number; putRequests: number };
}

interface DailyUsage {
  date: string;
  metric_type: string;
  total: number;
}

interface PauseState {
  paused: boolean;
  terminate: boolean;
  reason?: string;
  pausedAt?: number;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function formatDuration(ms: number): string {
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3600000) return `${(ms / 60000).toFixed(1)}m`;
  return `${(ms / 3600000).toFixed(1)}h`;
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    running: 'bg-green-500',
    connected: 'bg-green-500',
    configured: 'bg-blue-500',
    active: 'bg-green-500',
    error: 'bg-red-500',
    'not configured': 'bg-yellow-500',
  };
  return (
    <span className={`px-2 py-1 rounded text-xs font-medium ${colors[status] || 'bg-gray-500'}`}>
      {status}
    </span>
  );
}

function Card({ title, children, className = '', headerAction }: { title: string; children: React.ReactNode; className?: string; headerAction?: React.ReactNode }) {
  return (
    <div className={`bg-gray-800 rounded-lg p-4 ${className}`}>
      <div className="flex items-center justify-between mb-3">
        <h3 className="text-sm font-medium text-gray-400">{title}</h3>
        {headerAction}
      </div>
      {children}
    </div>
  );
}

function MetricRow({ label, value, unit = '', onClick, title }: { label: string; value: string | number; unit?: string; onClick?: () => void; title?: string }) {
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="flex justify-between items-center py-1 w-full hover:bg-gray-700/50 rounded transition-colors cursor-pointer"
        title={title}
      >
        <span className="text-gray-400 text-sm">{label}</span>
        <span className="text-white font-mono">
          {value}
          {unit && <span className="text-gray-500 ml-1 text-xs">{unit}</span>}
        </span>
      </button>
    );
  }

  return (
    <div className="flex justify-between items-center py-1" title={title}>
      <span className="text-gray-400 text-sm">{label}</span>
      <span className="text-white font-mono">
        {value}
        {unit && <span className="text-gray-500 ml-1 text-xs">{unit}</span>}
      </span>
    </div>
  );
}

function ListModal<T>({
  isOpen,
  title,
  data,
  renderItem,
  onClose
}: {
  isOpen: boolean;
  title: string;
  data: T[];
  renderItem: (item: T, index: number) => React.ReactNode;
  onClose: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg w-full max-w-2xl mx-4 shadow-xl border border-gray-700 max-h-[80vh] flex flex-col">
        <div className="flex justify-between items-center p-4 border-b border-gray-700">
          <h3 className="text-xl font-bold text-white">{title}</h3>
          <button
            onClick={onClose}
            className="text-gray-400 hover:text-white text-2xl leading-none"
          >
            &times;
          </button>
        </div>
        <div className="overflow-y-auto flex-1 p-4">
          {data.length === 0 ? (
            <div className="text-gray-500 text-center py-8">No records found</div>
          ) : (
            <div className="space-y-2">
              {data.map((item, i) => renderItem(item, i))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function JobsChart({ jobs }: { jobs: { pending: number; processing: number; completed: number; failed: number; cancelled: number } }) {
  const total = jobs.pending + jobs.processing + jobs.completed + jobs.failed + jobs.cancelled;
  if (total === 0) return <div className="text-gray-500 text-sm">No jobs in last 24h</div>;

  const segments = [
    { label: 'Completed', value: jobs.completed, color: 'bg-green-500' },
    { label: 'Processing', value: jobs.processing, color: 'bg-blue-500' },
    { label: 'Pending', value: jobs.pending, color: 'bg-yellow-500' },
    { label: 'Failed', value: jobs.failed, color: 'bg-red-500' },
    { label: 'Cancelled', value: jobs.cancelled, color: 'bg-gray-500' },
  ];

  return (
    <div>
      <div className="h-4 flex rounded overflow-hidden mb-2">
        {segments.map((seg) => (
          seg.value > 0 && (
            <div
              key={seg.label}
              className={`${seg.color}`}
              style={{ width: `${(seg.value / total) * 100}%` }}
              title={`${seg.label}: ${seg.value}`}
            />
          )
        ))}
      </div>
      <div className="grid grid-cols-5 gap-2 text-xs">
        {segments.map((seg) => (
          <div key={seg.label} className="text-center">
            <div className={`w-3 h-3 rounded ${seg.color} mx-auto mb-1`} />
            <div className="text-gray-400">{seg.label}</div>
            <div className="text-white font-mono">{seg.value}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function DailyUsageChart({ data }: { data: DailyUsage[] }) {
  // Group by date
  const byDate = data.reduce((acc, item) => {
    if (!acc[item.date]) acc[item.date] = {};
    acc[item.date][item.metric_type] = item.total;
    return acc;
  }, {} as Record<string, Record<string, number>>);

  const dates = Object.keys(byDate).sort().slice(-14); // Last 14 days
  if (dates.length === 0) return <div className="text-gray-500 text-sm">No usage data</div>;

  const metricTypes = ['rekognition_image', 's3_upload_bytes', 'r2_upload_bytes', 'lambda_detection_ms'];
  const colors: Record<string, string> = {
    rekognition_image: 'bg-purple-500',
    s3_upload_bytes: 'bg-blue-500',
    r2_upload_bytes: 'bg-green-500',
    lambda_detection_ms: 'bg-yellow-500',
  };

  return (
    <div>
      <div className="flex items-end h-32 gap-1 mb-2">
        {dates.map((date) => {
          const dayData = byDate[date] || {};
          const hasData = metricTypes.some((m) => dayData[m] > 0);
          return (
            <div key={date} className="flex-1 flex flex-col justify-end" title={date}>
              {hasData ? (
                metricTypes.map((metric) => (
                  dayData[metric] > 0 && (
                    <div
                      key={metric}
                      className={`${colors[metric]} min-h-[4px]`}
                      style={{ height: `${Math.min(100, Math.log10(dayData[metric] + 1) * 20)}%` }}
                    />
                  )
                ))
              ) : (
                <div className="bg-gray-700 h-1" />
              )}
            </div>
          );
        })}
      </div>
      <div className="flex justify-between text-xs text-gray-500">
        <span>{dates[0]}</span>
        <span>{dates[dates.length - 1]}</span>
      </div>
      <div className="flex gap-4 mt-2 text-xs">
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-purple-500 rounded" />
          <span className="text-gray-400">Rekognition</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-blue-500 rounded" />
          <span className="text-gray-400">S3</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-green-500 rounded" />
          <span className="text-gray-400">R2</span>
        </div>
        <div className="flex items-center gap-1">
          <div className="w-3 h-3 bg-yellow-500 rounded" />
          <span className="text-gray-400">Lambda</span>
        </div>
      </div>
    </div>
  );
}

function ConfirmModal({
  isOpen,
  title,
  message,
  confirmText,
  confirmColor = 'bg-red-600 hover:bg-red-500',
  onConfirm,
  onCancel
}: {
  isOpen: boolean;
  title: string;
  message: string;
  confirmText: string;
  confirmColor?: string;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
      <div className="bg-gray-800 rounded-lg p-6 max-w-md w-full mx-4 shadow-xl border border-gray-700">
        <h3 className="text-xl font-bold text-white mb-2">{title}</h3>
        <p className="text-gray-300 mb-6">{message}</p>
        <div className="flex justify-end gap-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded font-medium"
          >
            Cancel
          </button>
          <button
            onClick={onConfirm}
            className={`px-4 py-2 ${confirmColor} rounded font-medium`}
          >
            {confirmText}
          </button>
        </div>
      </div>
    </div>
  );
}

interface AdminAgency {
  id: string;
  code: string;
  name: string;
  default_deadline_days: number;
  deadline_type: string;
  created_at: number;
  user_count: number;
}

export function ConsolePage() {
  const [systemStatus, setSystemStatus] = useState<SystemStatus | null>(null);
  const [usage, setUsage] = useState<UsageSummary | null>(null);
  const [awsMetrics, setAwsMetrics] = useState<AWSMetrics | null>(null);
  const [dailyUsage, setDailyUsage] = useState<DailyUsage[]>([]);
  const [pauseState, setPauseState] = useState<PauseState | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [showPauseModal, setShowPauseModal] = useState(false);
  const [showTerminateModal, setShowTerminateModal] = useState(false);
  const [showAgenciesModal, setShowAgenciesModal] = useState(false);
  const [showUsersModal, setShowUsersModal] = useState(false);
  const [showCreateAgencyModal, setShowCreateAgencyModal] = useState(false);
  const [showCreateSupervisorModal, setShowCreateSupervisorModal] = useState(false);
  const [showAgencyUsersModal, setShowAgencyUsersModal] = useState(false);
  const [agencyUsers, setAgencyUsers] = useState<Array<{ id: string; email: string; name: string; role: string; created_at: number; agency_name: string }>>([]);
  const [agencies, setAgencies] = useState<Array<{ id: string; code: string; name: string; created_at: number }>>([]);
  const [users, setUsers] = useState<Array<{ id: string; email: string; name: string; role: string; created_at: number; agency_name: string }>>([]);

  // Admin state
  const [activeTab, setActiveTab] = useState<'monitoring' | 'admin'>('monitoring');
  const [adminAgencies, setAdminAgencies] = useState<AdminAgency[]>([]);
  const [adminLoading, setAdminLoading] = useState(false);
  const [adminSuccess, setAdminSuccess] = useState<string | null>(null);

  // Agency form
  const [newAgencyCode, setNewAgencyCode] = useState('');
  const [newAgencyName, setNewAgencyName] = useState('');
  const [newAgencyDays, setNewAgencyDays] = useState(10);
  const [newAgencyType, setNewAgencyType] = useState<'business_days' | 'calendar_days'>('business_days');

  // Supervisor form
  const [newSupervisorEmail, setNewSupervisorEmail] = useState('');
  const [newSupervisorName, setNewSupervisorName] = useState('');
  const [selectedAgencyCode, setSelectedAgencyCode] = useState('');

  const fetchData = useCallback(async () => {
    try {
      setError(null);
      const [statusRes, usageRes, awsRes, dailyRes, pauseRes] = await Promise.all([
        api.consoleGetSystemStatus(),
        api.consoleGetUsageSummary(30),
        api.consoleGetAWSMetrics(30),
        api.consoleGetDailyUsage(30),
        api.consoleGetSystemPause(),
      ]);
      setSystemStatus(statusRes);
      setUsage(usageRes.usage);
      setAwsMetrics(awsRes.aws);
      setDailyUsage(dailyRes.daily);
      setPauseState(pauseRes.system);
      setLastRefresh(new Date());
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch metrics');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (!autoRefresh) return;
    const interval = setInterval(fetchData, 10000); // Refresh every 10 seconds
    return () => clearInterval(interval);
  }, [autoRefresh, fetchData]);

  const handlePause = async () => {
    try {
      const result = await api.consoleSetSystemPause(true, { reason: 'Manual pause from console' });
      setPauseState(result.system);
      setShowPauseModal(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to pause');
      setShowPauseModal(false);
    }
  };

  const handleResume = async () => {
    try {
      const result = await api.consoleSetSystemPause(false);
      setPauseState(result.system);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to resume');
    }
  };

  const handleTerminate = async () => {
    try {
      const result = await api.consoleSetSystemPause(true, { terminate: true, reason: 'Emergency stop from console' });
      setPauseState(result.system);
      setShowTerminateModal(false);
      fetchData();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to terminate');
      setShowTerminateModal(false);
    }
  };

  const handleShowAgencies = async () => {
    try {
      const result = await api.consoleGetRecentAgencies();
      setAgencies(result.agencies);
      setShowAgenciesModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agencies');
    }
  };

  const handleShowUsers = async () => {
    try {
      const result = await api.consoleGetRecentUsers();
      setUsers(result.users);
      setShowUsersModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    }
  };

  const handleShowAgencyUsers = async (agencyCode: string) => {
    try {
      setSelectedAgencyCode(agencyCode);
      const result = await api.consoleGetRecentUsers();
      // Filter users by agency
      const filtered = result.users.filter(u => u.agency_name === adminAgencies.find(a => a.code === agencyCode)?.name);
      setAgencyUsers(filtered);
      setShowAgencyUsersModal(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch users');
    }
  };

  const handleAddSupervisor = (agencyCode: string) => {
    setSelectedAgencyCode(agencyCode);
    setShowCreateSupervisorModal(true);
  };

  const fetchAdminAgencies = async () => {
    try {
      setAdminLoading(true);
      const result = await api.adminListAgencies();
      setAdminAgencies(result.agencies);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch agencies');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCreateAgency = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAdminLoading(true);
      setError(null);
      setAdminSuccess(null);
      await api.adminCreateAgency({
        code: newAgencyCode,
        name: newAgencyName,
        default_deadline_days: newAgencyDays,
        deadline_type: newAgencyType,
      });
      setAdminSuccess(`Agency "${newAgencyCode}" created successfully`);
      setNewAgencyCode('');
      setNewAgencyName('');
      setNewAgencyDays(10);
      setNewAgencyType('business_days');
      setShowCreateAgencyModal(false);
      fetchAdminAgencies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create agency');
    } finally {
      setAdminLoading(false);
    }
  };

  const handleCreateSupervisor = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      setAdminLoading(true);
      setError(null);
      setAdminSuccess(null);
      const result = await api.adminCreateSupervisor({
        email: newSupervisorEmail,
        name: newSupervisorName,
        agency_code: selectedAgencyCode,
      });
      setAdminSuccess(`Supervisor "${newSupervisorEmail}" created for ${result.user.agency.name}. They can now sign up at the app with this email.`);
      setNewSupervisorEmail('');
      setNewSupervisorName('');
      setShowCreateSupervisorModal(false);
      setSelectedAgencyCode('');
      fetchAdminAgencies();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create supervisor');
    } finally {
      setAdminLoading(false);
    }
  };

  useEffect(() => {
    if (activeTab === 'admin') {
      fetchAdminAgencies();
    }
  }, [activeTab]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-900 text-white flex items-center justify-center">
        <div className="text-xl">Loading metrics...</div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-900 text-white p-6">
      {/* Header */}
      <div className="flex justify-between items-center mb-6">
        <div>
          <h1 className="text-2xl font-bold">System Console</h1>
          <div className="text-sm text-gray-400">
            Last refresh: {lastRefresh.toLocaleTimeString()}
          </div>
        </div>
        <div className="flex items-center gap-4">
          {activeTab === 'monitoring' && (
            <>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={autoRefresh}
                  onChange={(e) => setAutoRefresh(e.target.checked)}
                  className="rounded"
                />
                Auto-refresh (10s)
              </label>
              <button
                onClick={fetchData}
                className="px-4 py-2 bg-gray-700 hover:bg-gray-600 rounded text-sm"
              >
                Refresh Now
              </button>
            </>
          )}
        </div>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6">
        <button
          onClick={() => setActiveTab('monitoring')}
          className={`px-4 py-2 rounded font-medium ${
            activeTab === 'monitoring'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Monitoring
        </button>
        <button
          onClick={() => setActiveTab('admin')}
          className={`px-4 py-2 rounded font-medium ${
            activeTab === 'admin'
              ? 'bg-teal-600 text-white'
              : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          Admin
        </button>
      </div>

      {error && (
        <div className="bg-red-900/50 border border-red-500 text-red-200 px-4 py-3 rounded mb-6">
          {error}
        </div>
      )}

      {adminSuccess && (
        <div className="bg-green-900/50 border border-green-500 text-green-200 px-4 py-3 rounded mb-6">
          {adminSuccess}
        </div>
      )}

      {activeTab === 'admin' ? (
        /* Admin Tab Content */
        <div className="space-y-6">
          {/* Existing Agencies */}
          <Card
            title="Agencies"
            headerAction={
              <button
                onClick={() => setShowCreateAgencyModal(true)}
                className="w-7 h-7 flex items-center justify-center bg-teal-600 hover:bg-teal-500 rounded-full text-white text-xl font-bold leading-none"
                title="Add new agency"
              >
                +
              </button>
            }
          >
            {adminLoading ? (
              <div className="text-gray-500">Loading...</div>
            ) : adminAgencies.length === 0 ? (
              <div className="text-gray-500">No agencies yet. Click (+) to create one.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="text-left text-gray-400 border-b border-gray-700">
                      <th className="pb-2">Code</th>
                      <th className="pb-2">Name</th>
                      <th className="pb-2">Deadline</th>
                      <th className="pb-2">
                        <span className="inline-flex items-center gap-2">
                          Users
                          <button
                            onClick={(e) => {
                              e.stopPropagation();
                              if (adminAgencies.length === 1) {
                                handleAddSupervisor(adminAgencies[0].code);
                              }
                            }}
                            className="w-5 h-5 flex items-center justify-center bg-teal-600 hover:bg-teal-500 rounded-full text-white text-sm font-bold leading-none"
                            title="Add supervisor"
                          >
                            +
                          </button>
                        </span>
                      </th>
                      <th className="pb-2">Created</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminAgencies.map((agency) => (
                      <tr
                        key={agency.id}
                        className="border-b border-gray-700/50"
                      >
                        <td className="py-2 font-mono text-teal-400">{agency.code}</td>
                        <td className="py-2">{agency.name}</td>
                        <td className="py-2 text-gray-400">
                          {agency.default_deadline_days} {agency.deadline_type.replace('_', ' ')}
                        </td>
                        <td className="py-2">
                          <span className="inline-flex items-center gap-2">
                            <button
                              onClick={() => handleShowAgencyUsers(agency.code)}
                              className="text-teal-400 hover:text-teal-300 hover:underline"
                              title="View users"
                            >
                              {agency.user_count}
                            </button>
                            <button
                              onClick={() => handleAddSupervisor(agency.code)}
                              className="w-5 h-5 flex items-center justify-center bg-teal-600 hover:bg-teal-500 rounded-full text-white text-sm font-bold leading-none"
                              title={`Add supervisor to ${agency.code}`}
                            >
                              +
                            </button>
                          </span>
                        </td>
                        <td className="py-2 text-gray-500">
                          {new Date(agency.created_at * 1000).toLocaleDateString()}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>
        </div>
      ) : (
        <>
          {/* System Controls */}
      <div className="bg-gray-800 rounded-lg p-4 mb-6">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h2 className="text-lg font-semibold">System Controls</h2>
            {pauseState?.paused ? (
              <span className="px-3 py-1 bg-red-500 rounded-full text-sm font-medium animate-pulse">
                PAUSED
              </span>
            ) : (
              <span className="px-3 py-1 bg-green-500 rounded-full text-sm font-medium">
                ACTIVE
              </span>
            )}
          </div>
          <div className="flex gap-2">
            {pauseState?.paused ? (
              <button
                onClick={handleResume}
                className="px-4 py-2 bg-green-600 hover:bg-green-500 rounded font-medium"
              >
                Resume Processing
              </button>
            ) : (
              <button
                onClick={() => setShowPauseModal(true)}
                className="px-4 py-2 bg-yellow-600 hover:bg-yellow-500 rounded font-medium"
              >
                Pause Processing
              </button>
            )}
            <button
              onClick={() => setShowTerminateModal(true)}
              className="px-4 py-2 bg-red-600 hover:bg-red-500 rounded font-medium"
            >
              Emergency Stop
            </button>
          </div>
        </div>
        {pauseState?.reason && (
          <div className="mt-2 text-sm text-gray-400">
            Reason: {pauseState.reason}
            {pauseState.pausedAt && (
              <span className="ml-2">
                (since {new Date(pauseState.pausedAt * 1000).toLocaleString()})
              </span>
            )}
          </div>
        )}
      </div>

      {/* Main Grid */}
      <div className="grid grid-cols-4 gap-4 mb-6">
        {/* Cloudflare Status */}
        <Card title="Cloudflare Worker">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Status</span>
              <StatusBadge status={systemStatus?.cloudflare.worker.status || 'unknown'} />
            </div>
          </div>
        </Card>

        <Card title="D1 Database">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Status</span>
              <StatusBadge status={systemStatus?.cloudflare.d1.status || 'unknown'} />
            </div>
            {systemStatus?.cloudflare.d1.counts && (
              <div className="pt-2 border-t border-gray-700">
                <MetricRow label="Agencies" value={systemStatus.cloudflare.d1.counts.agencies || 0} onClick={handleShowAgencies} title="Total registered agencies/departments" />
                <MetricRow label="Users" value={systemStatus.cloudflare.d1.counts.users || 0} onClick={handleShowUsers} title="Total active users (not deleted)" />
                <MetricRow label="Requests" value={systemStatus.cloudflare.d1.counts.requests || 0} title="Active requests (not archived or deleted)" />
                <MetricRow label="Files" value={systemStatus.cloudflare.d1.counts.files || 0} title="Total files (not deleted)" />
                <MetricRow label="Active Jobs" value={systemStatus.cloudflare.d1.counts.video_jobs || 0} title="Video jobs currently pending or processing" />
                <MetricRow label="Detections" value={systemStatus.cloudflare.d1.counts.detections || 0} title="Face detections created in the last 5 minutes" />
                <MetricRow label="Video Detections" value={systemStatus.cloudflare.d1.counts.video_detections || 0} title="Video detections created in the last 5 minutes" />
              </div>
            )}
          </div>
        </Card>

        <Card title="R2 Storage">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Status</span>
              <StatusBadge status={systemStatus?.cloudflare.r2.status || 'unknown'} />
            </div>
            <MetricRow label="Bucket" value={systemStatus?.cloudflare.r2.bucket || '-'} title="R2 bucket for file storage" />
          </div>
        </Card>

        <Card title="S3 Storage">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Status</span>
              <StatusBadge status={systemStatus?.aws.s3.status || 'unknown'} />
            </div>
            <MetricRow label="Bucket" value={systemStatus?.aws.s3.bucket || '-'} title="S3 bucket for video storage" />
          </div>
        </Card>
      </div>

      {/* Lambda Status */}
      <div className="grid grid-cols-3 gap-4 mb-6">
        <Card title="Lambda - Detection">
          <div className="space-y-2">
            <MetricRow
              label="Currently Running"
              value={systemStatus?.aws.lambda.detection.running || 0}
              title="Number of detection Lambda functions currently executing"
            />
            <MetricRow
              label="Invocations (5 min)"
              value={systemStatus?.aws.lambda.detection.invocationsLast5Min || 0}
              title="Detection Lambda invocations in the last 5 minutes"
            />
          </div>
        </Card>

        <Card title="Lambda - Redaction">
          <div className="space-y-2">
            <MetricRow
              label="Currently Running"
              value={systemStatus?.aws.lambda.redaction.running || 0}
              title="Number of redaction Lambda functions currently executing"
            />
            <MetricRow
              label="Invocations (5 min)"
              value={systemStatus?.aws.lambda.redaction.invocationsLast5Min || 0}
              title="Redaction Lambda invocations in the last 5 minutes"
            />
          </div>
        </Card>

        <Card title="Rekognition">
          <div className="space-y-2">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Status</span>
              <StatusBadge status={systemStatus?.aws.rekognition.status || 'unknown'} />
            </div>
          </div>
        </Card>
      </div>

      {/* Jobs Last 24h */}
      <Card title="Video Jobs - Last 24 Hours" className="mb-6">
        {systemStatus?.jobs.last24h && <JobsChart jobs={systemStatus.jobs.last24h} />}
      </Card>

      {/* Usage Summary */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card title={`Usage Summary (${usage?.period || 'Last 30 days'})`}>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <MetricRow label="Rekognition Images" value={usage?.rekognition_images || 0} title="Images processed by AWS Rekognition" />
              <MetricRow label="Rekognition Video" value={usage?.rekognition_video_minutes || 0} unit="min" title="Video minutes analyzed by AWS Rekognition" />
              <MetricRow label="Lambda Detection" value={usage?.lambda_detection_seconds || 0} unit="sec" title="Total Lambda execution time for face detection" />
              <MetricRow label="Lambda Redaction" value={usage?.lambda_redaction_seconds || 0} unit="sec" title="Total Lambda execution time for video redaction" />
            </div>
            <div>
              <MetricRow label="S3 Upload" value={usage?.s3_upload_gb?.toFixed(3) || 0} unit="GB" title="Data uploaded to S3 (video files)" />
              <MetricRow label="S3 Download" value={usage?.s3_download_gb?.toFixed(3) || 0} unit="GB" title="Data downloaded from S3" />
              <MetricRow label="R2 Upload" value={usage?.r2_upload_gb?.toFixed(3) || 0} unit="GB" title="Data uploaded to R2 (images, documents)" />
              <MetricRow label="R2 Download" value={usage?.r2_download_gb?.toFixed(3) || 0} unit="GB" title="Data downloaded from R2" />
            </div>
          </div>
          <div className="mt-4 pt-4 border-t border-gray-700">
            <div className="flex justify-between items-center">
              <span className="text-gray-400">Estimated Cost</span>
              <span className="text-2xl font-bold text-green-400">
                ${usage?.estimated_cost_usd?.toFixed(2) || '0.00'}
              </span>
            </div>
          </div>
        </Card>

        <Card title="Daily Usage Trend (14 days)">
          <DailyUsageChart data={dailyUsage} />
        </Card>
      </div>

      {/* AWS Billing */}
      <div className="grid grid-cols-2 gap-4 mb-6">
        <Card title={`AWS Cost Explorer (${awsMetrics?.period.start} to ${awsMetrics?.period.end})`}>
          {awsMetrics?.costs && awsMetrics.costs.length > 0 ? (
            <div className="space-y-2">
              {awsMetrics.costs.map((cost) => (
                <div key={cost.service} className="flex justify-between items-center">
                  <span className="text-gray-400 text-sm">{cost.service}</span>
                  <span className="text-white font-mono">${cost.cost.toFixed(2)}</span>
                </div>
              ))}
              <div className="pt-2 border-t border-gray-700 flex justify-between items-center">
                <span className="text-gray-300 font-medium">Total</span>
                <span className="text-xl font-bold text-green-400">${awsMetrics.totalCost.toFixed(2)}</span>
              </div>
            </div>
          ) : (
            <div className="text-gray-500 text-sm">No billing data available yet</div>
          )}
        </Card>

        <Card title="AWS CloudWatch Metrics">
          <div className="space-y-3">
            <div>
              <div className="text-gray-500 text-xs mb-1">Lambda Detection</div>
              <MetricRow label="Invocations" value={awsMetrics?.lambda.detectionInvocations || 0} title="Number of detection Lambda invocations" />
              <MetricRow label="Duration" value={formatDuration(awsMetrics?.lambda.detectionDurationMs || 0)} title="Total execution time for detection Lambda" />
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">Lambda Redaction</div>
              <MetricRow label="Invocations" value={awsMetrics?.lambda.redactionInvocations || 0} title="Number of redaction Lambda invocations" />
              <MetricRow label="Duration" value={formatDuration(awsMetrics?.lambda.redactionDurationMs || 0)} title="Total execution time for redaction Lambda" />
            </div>
            <div>
              <div className="text-gray-500 text-xs mb-1">S3</div>
              <MetricRow label="Storage" value={formatBytes(awsMetrics?.s3.storageSizeBytes || 0)} title="Total S3 bucket storage used" />
              <MetricRow label="GET Requests" value={awsMetrics?.s3.getRequests || 0} title="Number of S3 read operations" />
              <MetricRow label="PUT Requests" value={awsMetrics?.s3.putRequests || 0} title="Number of S3 write operations" />
            </div>
          </div>
        </Card>
      </div>

      {/* Footer */}
      <div className="text-center text-gray-500 text-sm">
        Redact-1 System Console | Data refreshes every 10 seconds when auto-refresh is enabled
      </div>
        </>
      )}

      {/* Confirmation Modals */}
      <ConfirmModal
        isOpen={showPauseModal}
        title="Pause Processing"
        message="This will pause all new video detection and redaction jobs. Currently running jobs will continue until completion."
        confirmText="Pause Processing"
        confirmColor="bg-yellow-600 hover:bg-yellow-500"
        onConfirm={handlePause}
        onCancel={() => setShowPauseModal(false)}
      />

      <ConfirmModal
        isOpen={showTerminateModal}
        title="Emergency Stop"
        message="This will immediately cancel ALL pending and processing jobs. This action cannot be undone. Are you sure?"
        confirmText="Emergency Stop"
        confirmColor="bg-red-600 hover:bg-red-500"
        onConfirm={handleTerminate}
        onCancel={() => setShowTerminateModal(false)}
      />

      {/* List Modals */}
      <ListModal
        isOpen={showAgenciesModal}
        title="Recent Agencies (up to 100)"
        data={agencies}
        onClose={() => setShowAgenciesModal(false)}
        renderItem={(agency) => (
          <div key={agency.id} className="bg-gray-700/50 rounded p-3 flex justify-between items-center">
            <div>
              <div className="text-white font-medium">{agency.name}</div>
              <div className="text-gray-400 text-sm">Code: {agency.code}</div>
            </div>
            <div className="text-gray-500 text-xs">
              {new Date(agency.created_at * 1000).toLocaleDateString()}
            </div>
          </div>
        )}
      />

      <ListModal
        isOpen={showUsersModal}
        title="Recent Users (up to 100)"
        data={users}
        onClose={() => setShowUsersModal(false)}
        renderItem={(user) => (
          <div key={user.id} className="bg-gray-700/50 rounded p-3 flex justify-between items-center">
            <div>
              <div className="text-white font-medium">{user.name || user.email}</div>
              <div className="text-gray-400 text-sm">
                {user.email} · {user.role} · {user.agency_name || 'No agency'}
              </div>
            </div>
            <div className="text-gray-500 text-xs">
              {new Date(user.created_at * 1000).toLocaleDateString()}
            </div>
          </div>
        )}
      />

      {/* Create Agency Modal */}
      {showCreateAgencyModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 shadow-xl border border-gray-700">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-xl font-bold text-white">Create New Agency</h3>
              <button
                onClick={() => setShowCreateAgencyModal(false)}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateAgency} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Agency Code</label>
                  <input
                    type="text"
                    value={newAgencyCode}
                    onChange={(e) => setNewAgencyCode(e.target.value.toUpperCase())}
                    placeholder="e.g., DEMO, NYPD, LAPD"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Agency Name</label>
                  <input
                    type="text"
                    value={newAgencyName}
                    onChange={(e) => setNewAgencyName(e.target.value)}
                    placeholder="e.g., Demo Police Department"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Default Deadline (days)</label>
                  <input
                    type="number"
                    value={newAgencyDays}
                    onChange={(e) => setNewAgencyDays(parseInt(e.target.value) || 10)}
                    min={1}
                    max={365}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Deadline Type</label>
                  <select
                    value={newAgencyType}
                    onChange={(e) => setNewAgencyType(e.target.value as 'business_days' | 'calendar_days')}
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white"
                  >
                    <option value="business_days">Business Days</option>
                    <option value="calendar_days">Calendar Days</option>
                  </select>
                </div>
              </div>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowCreateAgencyModal(false)}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminLoading || !newAgencyCode || !newAgencyName}
                  className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
                >
                  {adminLoading ? 'Creating...' : 'Create Agency'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Create Supervisor Modal */}
      {showCreateSupervisorModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-lg mx-4 shadow-xl border border-gray-700">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-xl font-bold text-white">Add Supervisor to {selectedAgencyCode}</h3>
              <button
                onClick={() => {
                  setShowCreateSupervisorModal(false);
                  setSelectedAgencyCode('');
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <form onSubmit={handleCreateSupervisor} className="p-4 space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Email</label>
                  <input
                    type="email"
                    value={newSupervisorEmail}
                    onChange={(e) => setNewSupervisorEmail(e.target.value)}
                    placeholder="supervisor@agency.gov"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                    required
                  />
                </div>
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Name</label>
                  <input
                    type="text"
                    value={newSupervisorName}
                    onChange={(e) => setNewSupervisorName(e.target.value)}
                    placeholder="John Smith"
                    className="w-full px-3 py-2 bg-gray-700 border border-gray-600 rounded text-white placeholder-gray-500"
                    required
                  />
                </div>
              </div>
              <p className="text-xs text-gray-500">
                The supervisor will be created with "invited" status. They can then sign up at the app using this email address.
              </p>
              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowCreateSupervisorModal(false);
                    setSelectedAgencyCode('');
                  }}
                  className="px-4 py-2 bg-gray-600 hover:bg-gray-500 rounded font-medium"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={adminLoading || !newSupervisorEmail || !newSupervisorName}
                  className="px-6 py-2 bg-teal-600 hover:bg-teal-500 disabled:bg-gray-600 disabled:cursor-not-allowed rounded font-medium"
                >
                  {adminLoading ? 'Creating...' : 'Create Supervisor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Agency Users Modal */}
      {showAgencyUsersModal && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
          <div className="bg-gray-800 rounded-lg w-full max-w-2xl mx-4 shadow-xl border border-gray-700 max-h-[80vh] flex flex-col">
            <div className="flex justify-between items-center p-4 border-b border-gray-700">
              <h3 className="text-xl font-bold text-white">Users in {selectedAgencyCode}</h3>
              <button
                onClick={() => {
                  setShowAgencyUsersModal(false);
                  setSelectedAgencyCode('');
                }}
                className="text-gray-400 hover:text-white text-2xl leading-none"
              >
                &times;
              </button>
            </div>
            <div className="overflow-y-auto flex-1 p-4">
              {agencyUsers.length === 0 ? (
                <div className="text-gray-500 text-center py-8">No users found</div>
              ) : (
                <div className="space-y-2">
                  {agencyUsers.map((user) => (
                    <div key={user.id} className="bg-gray-700/50 rounded p-3 flex justify-between items-center">
                      <div>
                        <div className="text-white font-medium">{user.name || user.email}</div>
                        <div className="text-gray-400 text-sm">
                          {user.email} · {user.role}
                        </div>
                      </div>
                      <div className="text-gray-500 text-xs">
                        {new Date(user.created_at * 1000).toLocaleDateString()}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
