import type { User, Request, EvidenceFile, Detection, ManualRedaction, LoginResponse } from '../types';

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
  async listRequests(): Promise<{ requests: Request[] }> {
    return this.fetch('/api/requests');
  }

  async getRequest(id: string): Promise<{ request: Request }> {
    return this.fetch(`/api/requests/${id}`);
  }

  async createRequest(data: Partial<Request>): Promise<{ request: Request }> {
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

  async detectFaces(fileId: string): Promise<{ detections: Detection[]; count: number }> {
    return this.fetch(`/api/files/${fileId}/detect`, { method: 'POST' });
  }

  // Detections
  async listDetections(fileId: string): Promise<{ detections: Detection[]; manual_redactions: ManualRedaction[] }> {
    return this.fetch(`/api/files/${fileId}/detections`);
  }

  async updateDetection(id: string, data: { status?: string; bbox_x?: number; bbox_y?: number; bbox_width?: number; bbox_height?: number }): Promise<{ detection: Detection }> {
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
}

export const api = new ApiService();
