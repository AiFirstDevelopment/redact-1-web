import type { User, Request, EvidenceFile, Detection, ManualRedaction, LoginResponse, AuditLog } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'https://redact-1-worker.joelstevick.workers.dev';

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
    if (token) {
      localStorage.setItem('token', token);
    } else {
      localStorage.removeItem('token');
    }
  }

  getToken(): string | null {
    if (!this.token) {
      this.token = localStorage.getItem('token');
    }
    return this.token;
  }

  private async fetch<T>(path: string, options: RequestInit = {}): Promise<T> {
    const headers: HeadersInit = {
      'Content-Type': 'application/json',
      ...options.headers,
    };

    const token = this.getToken();
    if (token) {
      (headers as Record<string, string>)['Authorization'] = `Bearer ${token}`;
    }

    const response = await fetch(`${API_BASE}${path}`, {
      ...options,
      headers,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth
  async login(email: string, password: string): Promise<LoginResponse> {
    const data = await this.fetch<LoginResponse>('/api/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    });
    this.setToken(data.token);
    return data;
  }

  async logout(): Promise<void> {
    await this.fetch('/api/auth/logout', { method: 'POST' });
    this.setToken(null);
  }

  async me(): Promise<{ user: User }> {
    return this.fetch('/api/auth/me');
  }

  // Requests
  async listRequests(params?: { search?: string; assignee?: string }): Promise<{ requests: Request[] }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.assignee) searchParams.set('assignee', params.assignee);
    const query = searchParams.toString();
    return this.fetch(`/api/requests${query ? `?${query}` : ''}`);
  }

  async getRequest(id: string): Promise<{ request: Request }> {
    return this.fetch(`/api/requests/${id}`);
  }

  async createRequest(data: Partial<Request> & { assign_to?: string }): Promise<{ request: Request }> {
    return this.fetch('/api/requests', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateRequest(id: string, data: Partial<Request>): Promise<{ request: Request }> {
    return this.fetch(`/api/requests/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async getRequestAuditLogs(requestId: string): Promise<{ audit_logs: AuditLog[] }> {
    return this.fetch(`/api/requests/${requestId}/audit`);
  }

  // Files
  async listFiles(requestId: string): Promise<{ files: EvidenceFile[] }> {
    return this.fetch(`/api/requests/${requestId}/files`);
  }

  async uploadFile(requestId: string, file: File): Promise<{ file: EvidenceFile }> {
    const formData = new FormData();
    formData.append('file', file);

    const token = this.getToken();
    const response = await fetch(`${API_BASE}/api/requests/${requestId}/files`, {
      method: 'POST',
      headers: token ? { Authorization: `Bearer ${token}` } : {},
      body: formData,
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Upload failed' }));
      throw new Error(error.error);
    }

    return response.json();
  }

  async getFileOriginal(fileId: string): Promise<Blob> {
    const token = this.getToken();
    const response = await fetch(`${API_BASE}/api/files/${fileId}/original`, {
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });

    if (!response.ok) {
      throw new Error('Failed to fetch file');
    }

    return response.blob();
  }

  async detectFaces(fileId: string, pageImageBlob?: Blob, pageNumber?: number, dryRun = true): Promise<{ detections: Detection[]; count: number }> {
    if (pageImageBlob) {
      // For PDFs, send the rendered page image
      const token = this.getToken();
      const params = new URLSearchParams();
      if (pageNumber) params.set('page', String(pageNumber));
      if (dryRun) params.set('dry_run', 'true');
      const queryString = params.toString();
      const url = `${API_BASE}/api/files/${fileId}/detect${queryString ? `?${queryString}` : ''}`;

      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': pageImageBlob.type,
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: pageImageBlob,
      });

      if (!response.ok) {
        const error = await response.json().catch(() => ({ error: 'Unknown error' }));
        throw new Error(error.error || `HTTP ${response.status}`);
      }

      return response.json();
    }
    return this.fetch(`/api/files/${fileId}/detect${dryRun ? '?dry_run=true' : ''}`, { method: 'POST' });
  }

  // Detections
  async listDetections(fileId: string): Promise<{ detections: Detection[]; manual_redactions: ManualRedaction[] }> {
    return this.fetch(`/api/files/${fileId}/detections`);
  }

  async createDetection(fileId: string, data: {
    detection_type: string;
    bbox_x: number;
    bbox_y: number;
    bbox_width: number;
    bbox_height: number;
    page_number?: number;
    status?: string;
    exemption_code?: string;
    comment?: string;
  }): Promise<{ detections: Detection[] }> {
    // API expects { detections: [...] } format
    return this.fetch(`/api/files/${fileId}/detections`, {
      method: 'POST',
      body: JSON.stringify({ detections: [data] }),
    });
  }

  async updateDetection(id: string, data: { status?: string; bbox_x?: number; bbox_y?: number; bbox_width?: number; bbox_height?: number; exemption_code?: string; comment?: string }): Promise<{ detection: Detection }> {
    return this.fetch(`/api/detections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async createManualRedaction(fileId: string, data: Partial<ManualRedaction>): Promise<{ manual_redaction: ManualRedaction }> {
    return this.fetch(`/api/files/${fileId}/manual-redactions`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async deleteManualRedaction(id: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/manual-redactions/${id}`, { method: 'DELETE' });
  }

  // Agencies
  async getAgencyByCode(code: string): Promise<{ id: string; name: string; code: string }> {
    const data = await this.fetch<{ agency: { id: string; name: string; code: string } }>(`/api/agencies/code/${code}`);
    return data.agency;
  }

  // Archived requests
  async listArchivedRequests(params?: { search?: string }): Promise<{ requests: Request[] }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    const query = searchParams.toString();
    return this.fetch(`/api/requests/archived${query ? `?${query}` : ''}`);
  }

  async archiveRequest(id: string): Promise<{ request: Request }> {
    return this.fetch(`/api/requests/${id}/archive`, { method: 'POST' });
  }

  async unarchiveRequest(id: string): Promise<{ request: Request }> {
    return this.fetch(`/api/requests/${id}/unarchive`, { method: 'POST' });
  }

  async deleteRequest(id: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/requests/${id}`, { method: 'DELETE' });
  }

  async deleteFile(id: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/files/${id}`, { method: 'DELETE' });
  }

  async markFileReviewed(id: string): Promise<{ file: EvidenceFile }> {
    return this.fetch(`/api/files/${id}/mark-reviewed`, { method: 'POST' });
  }

  // Users
  async listUsers(): Promise<{ users: User[] }> {
    return this.fetch('/api/users');
  }

  async createUser(data: { email: string; name: string; password: string; role: string }): Promise<{ user: User }> {
    return this.fetch('/api/users', {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateUser(id: string, data: Partial<User>): Promise<{ user: User }> {
    return this.fetch(`/api/users/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async deleteUser(id: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/users/${id}`, { method: 'DELETE' });
  }
}

export const api = new ApiService();
