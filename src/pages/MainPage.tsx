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

type Tab = 'requests' | 'archived' | 'users' | 'settings';
type RightPanel = 'detail' | 'new' | null;

export function MainPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const [activeTab, setActiveTab] = useState<Tab>('requests');
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [selectedRequest, setSelectedRequest] = useState<Request | null>(null);
  const [archivedRequests, setArchivedRequests] = useState<Request[]>([]);
  const [archivedLoading, setArchivedLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [archivedSearchTerm, setArchivedSearchTerm] = useState('');
  const [assigneeFilter, setAssigneeFilter] = useState('');
  const debounceRef = useRef<NodeJS.Timeout>();

  const { requests, isLoading, fetchRequests } = useRequestStore();

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

  const fetchArchivedRequests = useCallback(async (search?: string) => {
    setArchivedLoading(true);
    try {
      const { requests } = await api.listArchivedRequests(search ? { search } : undefined);
      setArchivedRequests(requests);
    } catch (e) {
      console.error('Failed to fetch archived requests:', e);
    } finally {
      setArchivedLoading(false);
    }
  }, []);

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

  const handleRequestCreated = (requestId: string) => {
    fetchRequests();
    const newRequest = requests.find(r => r.id === requestId);
    if (newRequest) {
      setSelectedRequest(newRequest);
      setRightPanel('detail');
    } else {
      handleClosePanel();
    }
  };

  const handleArchive = async (id: string) => {
    try {
      await api.archiveRequest(id);
      fetchRequests();
      if (selectedRequest?.id === id) {
        handleClosePanel();
      }
    } catch (e) {
      console.error('Failed to archive request:', e);
    }
  };

  const handleUnarchive = async (id: string) => {
    try {
      await api.unarchiveRequest(id);
      fetchArchivedRequests();
      fetchRequests();
      if (selectedRequest?.id === id) {
        handleClosePanel();
      }
    } catch (e) {
      console.error('Failed to unarchive request:', e);
    }
  };

  const handleDelete = async (id: string) => {
    try {
      await api.deleteRequest(id);
      if (activeTab === 'archived') {
        fetchArchivedRequests();
      } else {
        fetchRequests();
      }
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
  };

  const handleSearchChange = (term: string) => {
    setSearchTerm(term);
  };

  const handleArchivedSearchChange = (term: string) => {
    setArchivedSearchTerm(term);
  };

  const handleAssigneeFilterChange = (assignee: string) => {
    setAssigneeFilter(assignee);
  };

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
      case 'requests':
        return (
          <RequestsList
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
          />
        );
      case 'archived':
        return (
          <RequestsList
            requests={archivedRequests}
            isLoading={archivedLoading}
            selectedId={selectedRequest?.id || null}
            onSelect={handleSelectRequest}
            onNewRequest={() => {}}
            onUnarchive={handleUnarchive}
            onDelete={handleDelete}
            onRequestUpdated={() => fetchArchivedRequests(archivedSearchTerm || undefined)}
            showArchived
            searchTerm={archivedSearchTerm}
            onSearchChange={handleArchivedSearchChange}
            assigneeFilter=""
            onAssigneeFilterChange={() => {}}
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
    >
      {renderContent()}
    </Layout>
  );
}
