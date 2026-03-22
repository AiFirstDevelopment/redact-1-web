import { useState, useEffect, useCallback, useRef } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Layout } from '../components/Layout';
import { RequestsList } from '../components/RequestsList';
import { RequestDetailPanel } from '../components/RequestDetailPanel';
import { NewRequestPanel } from '../components/NewRequestPanel';
import { SettingsPanel } from '../components/SettingsPanel';
import { UsersPanel } from '../components/UsersPanel';
import { useRequestStore } from '../stores/requestStore';
import { api } from '../services/api';
import type { Request } from '../types';

type Tab = 'intake' | 'requests' | 'archived' | 'users' | 'settings';
type RightPanel = 'detail' | 'new' | null;

export function MainPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('requests');
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [archivedRequests, setArchivedRequests] = useState<Request[]>([]);
  const [archivedTotal, setArchivedTotal] = useState(0);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [archivedLoadingMore, setArchivedLoadingMore] = useState(false);
  const [intakeRequests, setIntakeRequests] = useState<Request[]>([]);
  const [intakeTotal, setIntakeTotal] = useState(0);
  const [intakeSeenCount, setIntakeSeenCount] = useState(0); // Track last seen count for badge
  const [intakeLoading, setIntakeLoading] = useState(false);
  const [intakeLoadingMore, setIntakeLoadingMore] = useState(false);
  const [intakeSearchTerm, setIntakeSearchTerm] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [archivedSearchTerm, setArchivedSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const [refreshKey, setRefreshKey] = useState(0);
  const [archivedRefreshKey] = useState(0);
  const debounceRef = useRef<NodeJS.Timeout>();

  const { requests, total, isLoading, isLoadingMore, fetchRequests, fetchMoreRequests } = useRequestStore();

  // Debounced search for active requests
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      const params: { search?: string; assignee?: string } = {};
      if (searchTerm) params.search = searchTerm;
      if (assigneeFilter) params.assignee = assigneeFilter;
      fetchRequests(Object.keys(params).length > 0 ? params : undefined);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [fetchRequests, searchTerm, assigneeFilter]);

  // Auto-select request from URL param (when returning from file review)
  useEffect(() => {
    const requestId = searchParams.get('request');
    if (requestId && requests.length > 0) {
      const request = requests.find(r => r.id === requestId);
      if (request) {
        setSelectedRequest(request);
        setRightPanel('detail');
        // Clear the param from URL
        setSearchParams({}, { replace: true });
      }
    }
  }, [searchParams, requests, setSearchParams]);

  const fetchArchivedRequests = useCallback(async (search?: string, reset = true) => {
    if (reset) {
      setArchivedLoading(true);
      try {
        const { requests, total } = await api.listArchivedRequests({ search, offset: 0, limit: 25 });
        setArchivedRequests(requests);
        setArchivedTotal(total);
      } catch (e) {
        console.error('Failed to fetch archived requests:', e);
      } finally {
        setArchivedLoading(false);
      }
    }
  }, []);

  const fetchMoreArchivedRequests = useCallback(async () => {
    if (archivedLoadingMore || archivedRequests.length >= archivedTotal) return;
    setArchivedLoadingMore(true);
    try {
      const { requests: newRequests } = await api.listArchivedRequests({
        search: archivedSearchTerm || undefined,
        offset: archivedRequests.length,
        limit: 25,
      });
      setArchivedRequests(prev => [...prev, ...newRequests]);
    } catch (e) {
      console.error('Failed to fetch more archived requests:', e);
    } finally {
      setArchivedLoadingMore(false);
    }
  }, [archivedLoadingMore, archivedRequests.length, archivedTotal, archivedSearchTerm]);

  const fetchIntakeRequests = useCallback(async (search?: string, reset = true) => {
    if (reset) {
      setIntakeLoading(true);
      try {
        const { requests, total } = await api.listIntakeRequests({ search, offset: 0, limit: 25 });
        setIntakeRequests(requests);
        setIntakeTotal(total);
      } catch (e) {
        console.error('Failed to fetch intake requests:', e);
      } finally {
        setIntakeLoading(false);
      }
    }
  }, []);

  const fetchMoreIntakeRequests = useCallback(async () => {
    if (intakeLoadingMore || intakeRequests.length >= intakeTotal) return;
    setIntakeLoadingMore(true);
    try {
      const { requests: newRequests } = await api.listIntakeRequests({
        search: intakeSearchTerm || undefined,
        offset: intakeRequests.length,
        limit: 25,
      });
      setIntakeRequests(prev => [...prev, ...newRequests]);
    } catch (e) {
      console.error('Failed to fetch more intake requests:', e);
    } finally {
      setIntakeLoadingMore(false);
    }
  }, [intakeLoadingMore, intakeRequests.length, intakeTotal, intakeSearchTerm]);

  // Debounced search for intake requests
  useEffect(() => {
    if (activeTab === 'intake') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchIntakeRequests(intakeSearchTerm || undefined);
      }, 300);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
  }, [activeTab, intakeSearchTerm, fetchIntakeRequests]);

  // Poll intake queue every 30 seconds (always, for badge count)
  useEffect(() => {
    const fetchLatest = async () => {
      try {
        const { requests: newRequests, total: newTotal } = await api.listIntakeRequests({
          search: activeTab === 'intake' ? intakeSearchTerm || undefined : undefined,
          offset: 0,
          limit: 25,
        });
        setIntakeRequests(newRequests);
        setIntakeTotal(newTotal);
      } catch (e) {
        console.error('Failed to fetch intake requests:', e);
      }
    };

    // Fetch immediately on mount
    fetchLatest();

    // Then poll every 30 seconds
    const pollInterval = setInterval(fetchLatest, 30000);

    return () => clearInterval(pollInterval);
  }, [activeTab, intakeSearchTerm]);

  // Debounced search for archived requests
  useEffect(() => {
    if (activeTab === 'archived') {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      debounceRef.current = setTimeout(() => {
        fetchArchivedRequests(archivedSearchTerm || undefined);
      }, 300);
      return () => {
        if (debounceRef.current) clearTimeout(debounceRef.current);
      };
    }
  }, [activeTab, archivedSearchTerm, fetchArchivedRequests]);

  const handleSelectRequest = (request: Request) => {
    setSelectedRequest(request);
    setRightPanel('detail');
  };

  const handleNewRequest = () => {
    setSelectedRequest(null);
    setRightPanel('new');
  };

  const handleClosePanel = () => {
    setRightPanel(null);
    setSelectedRequest(null);
  };

  // Refresh selected request when requests change
  useEffect(() => {
    if (selectedRequest && requests.length > 0) {
      const updated = requests.find(r => r.id === selectedRequest.id);
      if (updated && JSON.stringify(updated) !== JSON.stringify(selectedRequest)) {
        setSelectedRequest(updated);
      }
    }
  }, [requests, selectedRequest]);

  const handleRequestCreated = () => {
    fetchRequests();
    handleClosePanel();
  };

  const handleArchive = async (id: string) => {
    try {
      await api.archiveRequest(id);
      // Optimistic UI - list already updated via removingIds
      if (selectedRequest?.id === id) {
        handleClosePanel();
      }
      // Don't pre-fetch - it causes re-render issues. Archived tab will fetch on navigation.
    } catch (e) {
      console.error('Failed to archive request:', e);
    }
  };

  const handleUnarchive = async (id: string) => {
    try {
      await api.unarchiveRequest(id);
      // Optimistic UI - list already updated via removingIds
      if (selectedRequest?.id === id) {
        handleClosePanel();
      }
    } catch (e) {
      console.error('Failed to unarchive request:', e);
    }
  };

  const handleRestoreRequest = async (id: string) => {
    try {
      await api.unarchiveRequest(id);
      // Fetch fresh data first
      const { requests: freshRequests, total: freshTotal } = await api.listRequests({ limit: 25, offset: 0 });
      // Update the store directly
      useRequestStore.setState({ requests: freshRequests, total: freshTotal });
      // Switch to requests tab and force component remount
      setActiveTab('requests');
      setSearchTerm('');
      setAssigneeFilter('');
      setRefreshKey(k => k + 1);
    } catch (e) {
      console.error('Failed to restore request:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteRequest(id);
      // Optimistic UI - list already updated via removingIds
      if (selectedRequest?.id === id) {
        handleClosePanel();
      }
    } catch (e) {
      console.error('Failed to delete request:', e);
    }
  };

  const handleTabChange = (tab: Tab) => {
    setActiveTab(tab);
    handleClosePanel();
    // Mark all intake requests as "seen" when viewing the tab
    if (tab === 'intake') {
      setIntakeSeenCount(intakeTotal);
    }
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
  };

  const handleArchivedSearchChange = (term: string) => {
    setArchivedSearchTerm(term);
  };

  const handleIntakeSearchChange = (term: string) => {
    setIntakeSearchTerm(term);
  };

  const handleAssignRequest = async (requestId: string, userId: string) => {
    try {
      const { request: assignedRequest } = await api.assignRequest(requestId, userId);
      // Add to requests store directly (appears at top of list)
      useRequestStore.setState(state => ({
        requests: [assignedRequest, ...state.requests],
        total: state.total + 1
      }));
      // Update intake total (the visual removal is handled by RequestsList animation)
      setIntakeTotal(prev => prev - 1);
    } catch (e) {
      console.error('Failed to assign request:', e);
    }
  };

  const handleAssigneeFilterChange = (assignee: string) => {
    setAssigneeFilter(assignee);
  };

  const handleLoadMore = useCallback(() => {
    const params: { search?: string; assignee?: string } = {};
    if (searchTerm) params.search = searchTerm;
    if (assigneeFilter) params.assignee = assigneeFilter;
    fetchMoreRequests(Object.keys(params).length > 0 ? params : undefined);
  }, [fetchMoreRequests, searchTerm, assigneeFilter]);

  const renderRightPanel = () => {
    if (rightPanel === 'detail' && selectedRequest) {
      return (
        <RequestDetailPanel
          request={selectedRequest}
          onClose={handleClosePanel}
          onRequestUpdated={fetchRequests}
        />
      );
    }
    if (rightPanel === 'new') {
      return (
        <NewRequestPanel
          onClose={handleClosePanel}
          onCreated={handleRequestCreated}
        />
      );
    }
    return null;
  };

  const renderContent = () => {
    switch (activeTab) {
      case 'intake':
        return (
          <RequestsList
            requests={intakeRequests}
            isLoading={intakeLoading}
            selectedId={selectedRequest?.id || null}
            onSelect={handleSelectRequest}
            onNewRequest={() => {}}
            onRequestUpdated={() => fetchIntakeRequests(intakeSearchTerm || undefined)}
            searchTerm={intakeSearchTerm}
            onSearchChange={handleIntakeSearchChange}
            assigneeFilter=""
            onAssigneeFilterChange={() => {}}
            total={intakeTotal}
            onLoadMore={fetchMoreIntakeRequests}
            isLoadingMore={intakeLoadingMore}
            showIntake
            onAssignRequest={handleAssignRequest}
          />
        );
      case 'requests':
        return (
          <RequestsList
            key={refreshKey}
            requests={requests}
            isLoading={isLoading}
            selectedId={selectedRequest?.id || null}
            onSelect={handleSelectRequest}
            onNewRequest={handleNewRequest}
            onArchive={handleArchive}
            onDelete={handleDelete}
            onRequestUpdated={() => {
              const params: { search?: string; assignee?: string } = {};
              if (searchTerm) params.search = searchTerm;
              if (assigneeFilter) params.assignee = assigneeFilter;
              fetchRequests(Object.keys(params).length > 0 ? params : undefined);
            }}
            searchTerm={searchTerm}
            onSearchChange={handleSearchChange}
            assigneeFilter={assigneeFilter}
            onAssigneeFilterChange={handleAssigneeFilterChange}
            total={total}
            onLoadMore={handleLoadMore}
            isLoadingMore={isLoadingMore}
          />
        );
      case 'archived':
        return (
          <RequestsList
            key={archivedRefreshKey}
            requests={archivedRequests}
            isLoading={archivedLoading}
            selectedId={selectedRequest?.id || null}
            onSelect={handleSelectRequest}
            onNewRequest={() => {}}
            onUnarchive={handleUnarchive}
            onDelete={handleDelete}
            onRequestUpdated={() => fetchRequests()}
            onSwitchToRequests={() => setActiveTab('requests')}
            onRestoreRequest={handleRestoreRequest}
            showArchived
            searchTerm={archivedSearchTerm}
            onSearchChange={handleArchivedSearchChange}
            assigneeFilter=""
            onAssigneeFilterChange={() => {}}
            total={archivedTotal}
            onLoadMore={fetchMoreArchivedRequests}
            isLoadingMore={archivedLoadingMore}
          />
        );
      case 'users':
        return <UsersPanel />;
      case 'settings':
        return <SettingsPanel />;
      default:
        return null;
    }
  };

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={handleTabChange}
      rightPanel={renderRightPanel()}
      intakeCount={Math.max(0, intakeTotal - intakeSeenCount)}
    >
      {renderContent()}
    </Layout>
  );
}
