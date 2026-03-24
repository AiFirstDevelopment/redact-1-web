import { useClerk } from '@clerk/clerk-react';
import { useAuthStore } from '../stores/authStore';
import { BadgeLogo } from './BadgeLogo';

type Tab = 'intake' | 'requests' | 'archived' | 'users' | 'settings';

interface LayoutProps {
  children: React.ReactNode;
  activeTab: Tab;
  onTabChange: (tab: Tab) => void;
  rightPanel?: React.ReactNode;
  intakeCount?: number;
}

export function Layout({ children, activeTab, onTabChange, rightPanel, intakeCount = 0 }: LayoutProps) {
  const { user, agency } = useAuthStore();
  const { signOut } = useClerk();
  const isSupervisor = user?.role === 'supervisor';

  const tabs: { id: Tab; label: string; supervisorOnly?: boolean }[] = [
    { id: 'intake', label: 'Intake', supervisorOnly: true },
    { id: 'requests', label: 'Requests' },
    { id: 'archived', label: 'Archived' },
    { id: 'users', label: 'Users', supervisorOnly: true },
    { id: 'settings', label: 'Settings', supervisorOnly: true },
  ];

  return (
    <div className="min-h-screen bg-gray-100 flex flex-col">
      {/* Header */}
      <header className="bg-pastel-mint shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 py-3 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <BadgeLogo className="w-8 h-8" />
            {agency && (
              <span className="text-sm text-white/90">{agency.name}</span>
            )}
          </div>
          <div className="flex items-center gap-4">
            <span className="text-white">{user?.name || user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-white/80 hover:text-white text-sm"
            >
              Sign Out
            </button>
          </div>
        </div>
      </header>

      {/* Tabs */}
      <div className="bg-pastel-cream border-b border-slate-300">
        <div className="max-w-7xl mx-auto px-4">
          <nav className="flex gap-1">
            {tabs.map((tab) => {
              if (tab.supervisorOnly && !isSupervisor) return null;
              return (
                <button
                  key={tab.id}
                  onClick={() => onTabChange(tab.id)}
                  className={`px-4 py-3 text-sm font-medium border-b-2 transition-colors flex items-center gap-2 ${
                    activeTab === tab.id
                      ? 'border-blue-600 text-blue-700'
                      : 'border-transparent text-slate-600 hover:text-slate-800'
                  }`}
                >
                  {tab.label}
                  {tab.id === 'intake' && intakeCount > 0 && activeTab !== 'intake' && (
                    <span className="bg-red-500 text-white text-xs font-bold px-1.5 py-0.5 rounded-full min-w-[20px] text-center">
                      {intakeCount}
                    </span>
                  )}
                </button>
              );
            })}
          </nav>
        </div>
      </div>

      {/* Main content with optional right panel */}
      <div className="flex-1 flex overflow-hidden">
        <main className={`flex-1 overflow-auto ${rightPanel ? 'max-w-[calc(100%-500px)]' : ''}`}>
          {children}
        </main>
        {rightPanel && (
          <aside className="w-[500px] bg-pastel-peach border-l shadow-lg overflow-auto">
            {rightPanel}
          </aside>
        )}
      </div>
    </div>
  );
}
