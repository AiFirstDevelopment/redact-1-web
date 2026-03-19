import { useState, useEffect } from 'react';
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

  const { requests, isLoading, fetchRequests } = useRequestStore();

  useEffect(() => {
    fetchRequests();
  }, [fetchRequests]);

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

  useEffect(() => {
    if (activeTab === 'archived') {
      fetchArchivedRequests();
    }
  }, [activeTab]);

  const fetchArchivedRequests = async () => {
    setArchivedLoading(true);
    try {
      const { requests } = await api.listArchivedRequests();
      setArchivedRequests(requests);
    } catch (e) {
      console.error('Failed to fetch archived requests:', e);
    } finally {
      setArchivedLoading(false);
    }
  };

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
            onRequestUpdated={fetchRequests}
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
            onRequestUpdated={fetchArchivedRequests}
            showArchived
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
