import type { User, Request, RequestTimeline, EvidenceFile, Detection, ManualRedaction, AuditLog, VideoJob, VideoDetection, VideoTrack } from '../types';

const API_BASE = import.meta.env.VITE_API_URL || 'https://redact-1-worker.joelstevick.workers.dev';

class ApiService {
  private token: string | null = null;

  setToken(token: string | null) {
    this.token = token;
  }

  getToken(): string | null {
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

  // Public fetch without auth headers (for console)
  private async fetchPublic<T>(path: string): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      headers: { 'Content-Type': 'application/json' },
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  // Auth - Clerk handles sign-in, we just sync with backend
  async syncUser(): Promise<{ user: User; agency?: { id: string; code: string; name: string; default_deadline_days: number; deadline_type: 'business_days' | 'calendar_days' } }> {
    return this.fetch('/api/auth/sync', { method: 'POST' });
  }

  async me(): Promise<{ user: User; agency?: { id: string; code: string; name: string; default_deadline_days: number; deadline_type: 'business_days' | 'calendar_days' } }> {
    return this.fetch('/api/auth/me');
  }

  async enroll(code: string): Promise<{ agency: { id: string; code: string; name: string; default_deadline_days: number; deadline_type: 'business_days' | 'calendar_days' } }> {
    return this.fetch('/api/auth/enroll', {
      method: 'POST',
      body: JSON.stringify({ code }),
    });
  }

  // Requests
  async listRequests(params?: { search?: string; assignee?: string; limit?: number; offset?: number }): Promise<{ requests: Request[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.assignee) searchParams.set('assignee', params.assignee);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
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

  uploadFile(
    requestId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): { promise: Promise<{ file: EvidenceFile }>; abort: () => void } {
    const formData = new FormData();
    formData.append('file', file);
    const token = this.getToken();
    const xhr = new XMLHttpRequest();

    const promise = new Promise<{ file: EvidenceFile }>((resolve, reject) => {
      xhr.open('POST', `${API_BASE}/api/requests/${requestId}/files`);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || 'Upload failed'));
          } catch {
            reject(new Error('Upload failed'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(formData);
    });

    return { promise, abort: () => xhr.abort() };
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
  async getAgencyByCode(code: string): Promise<{ id: string; name: string; code: string; default_deadline_days?: number; deadline_type?: 'business_days' | 'calendar_days' }> {
    const data = await this.fetch<{ agency: { id: string; name: string; code: string; default_deadline_days?: number; deadline_type?: 'business_days' | 'calendar_days' } }>(`/api/agencies/code/${code}`);
    return data.agency;
  }

  async updateAgency(id: string, data: { default_deadline_days?: number; deadline_type?: string }): Promise<{ agency: { id: string } }> {
    return this.fetch(`/api/agencies/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  // Archived requests
  async listArchivedRequests(params?: { search?: string; limit?: number; offset?: number }): Promise<{ requests: Request[]; total: number; limit: number; offset: number }> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set('search', params.search);
    if (params?.limit) searchParams.set('limit', params.limit.toString());
    if (params?.offset) searchParams.set('offset', params.offset.toString());
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

  // Due date management
  async tollRequest(id: string, reason: string): Promise<{ request: Request }> {
    return this.fetch(`/api/requests/${id}/toll`, {
      method: 'POST',
      body: JSON.stringify({ reason }),
    });
  }

  async resumeRequest(id: string): Promise<{ request: Request }> {
    return this.fetch(`/api/requests/${id}/resume`, { method: 'POST' });
  }

  async extendRequest(id: string, reason: string, newDueDate: number): Promise<{ request: Request }> {
    return this.fetch(`/api/requests/${id}/extend`, {
      method: 'POST',
      body: JSON.stringify({ reason, new_due_date: newDueDate }),
    });
  }

  async getRequestTimeline(id: string): Promise<{ timeline: RequestTimeline[] }> {
    return this.fetch(`/api/requests/${id}/timeline`);
  }

  async deleteFile(id: string, hard = false): Promise<{ success: boolean }> {
    const url = hard ? `/api/files/${id}?hard=true` : `/api/files/${id}`;
    return this.fetch(url, { method: 'DELETE' });
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

  // Video methods
  uploadVideo(
    requestId: string,
    file: File,
    onProgress?: (progress: number) => void
  ): { promise: Promise<{ file: EvidenceFile }>; abort: () => void } {
    const formData = new FormData();
    formData.append('file', file);
    const token = this.getToken();
    const xhr = new XMLHttpRequest();

    const promise = new Promise<{ file: EvidenceFile }>((resolve, reject) => {
      xhr.open('POST', `${API_BASE}/api/requests/${requestId}/videos`);

      if (token) {
        xhr.setRequestHeader('Authorization', `Bearer ${token}`);
      }

      xhr.upload.onprogress = (event) => {
        if (event.lengthComputable && onProgress) {
          const progress = Math.round((event.loaded / event.total) * 100);
          onProgress(progress);
        }
      };

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          resolve(JSON.parse(xhr.responseText));
        } else {
          try {
            const error = JSON.parse(xhr.responseText);
            reject(new Error(error.error || 'Upload failed'));
          } catch {
            reject(new Error('Upload failed'));
          }
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed'));
      xhr.onabort = () => reject(new Error('Upload cancelled'));
      xhr.send(formData);
    });

    return { promise, abort: () => xhr.abort() };
  }

  async startVideoDetection(fileId: string): Promise<{ job: VideoJob }> {
    return this.fetch(`/api/files/${fileId}/video/detect`, { method: 'POST' });
  }

  async getVideoJobStatus(fileId: string): Promise<{ job: VideoJob }> {
    return this.fetch(`/api/files/${fileId}/video/job`);
  }

  async cancelVideoJob(fileId: string): Promise<{ job: VideoJob }> {
    return this.fetch(`/api/files/${fileId}/video/job/cancel`, { method: 'POST' });
  }

  async listVideoDetections(fileId: string, params?: { track_id?: string; status?: string }): Promise<{ detections: VideoDetection[]; tracks: VideoTrack[] }> {
    const searchParams = new URLSearchParams();
    if (params?.track_id) searchParams.set('track_id', params.track_id);
    if (params?.status) searchParams.set('status', params.status);
    const query = searchParams.toString();
    return this.fetch(`/api/files/${fileId}/video/detections${query ? `?${query}` : ''}`);
  }

  async createVideoDetection(fileId: string, data: {
    detection_type: 'face' | 'plate' | 'manual';
    start_time_ms: number;
    end_time_ms: number;
    bbox_x: number;
    bbox_y: number;
    bbox_width: number;
    bbox_height: number;
    track_id?: string;
    exemption_code?: string;
    comment?: string;
  }): Promise<{ detection: VideoDetection }> {
    return this.fetch(`/api/files/${fileId}/video/detections`, {
      method: 'POST',
      body: JSON.stringify(data),
    });
  }

  async updateVideoDetection(id: string, data: {
    status?: 'pending' | 'approved' | 'rejected';
    bbox_x?: number;
    bbox_y?: number;
    bbox_width?: number;
    bbox_height?: number;
    start_time_ms?: number;
    end_time_ms?: number;
    exemption_code?: string;
    comment?: string;
  }): Promise<{ detection: VideoDetection }> {
    return this.fetch(`/api/video-detections/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async bulkUpdateVideoDetections(fileId: string, data: {
    track_id?: string;
    status: 'approved' | 'rejected';
    exemption_code?: string;
    comment?: string;
  }): Promise<{ success: boolean; count: number; track_id: string | null }> {
    return this.fetch(`/api/files/${fileId}/video/detections/bulk`, {
      method: 'PUT',
      body: JSON.stringify(data),
    });
  }

  async clearVideoDetections(fileId: string): Promise<{ success: boolean }> {
    return this.fetch(`/api/files/${fileId}/video/detections`, { method: 'DELETE' });
  }

  async startVideoRedaction(fileId: string): Promise<{ job: VideoJob }> {
    return this.fetch(`/api/files/${fileId}/video/redact`, { method: 'POST' });
  }

  async getVideoStreamUrl(fileId: string): Promise<{ url: string }> {
    return this.fetch(`/api/files/${fileId}/video/stream`);
  }

  async getRedactedVideoStreamUrl(fileId: string): Promise<{ url: string }> {
    return this.fetch(`/api/files/${fileId}/video/stream/redacted`);
  }

  // Metrics
  async getSystemStatus(): Promise<{
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
  }> {
    return this.fetch('/api/metrics/status');
  }

  async getLambdaStatus(): Promise<{
    lambda: {
      detection: { running: number; invocationsLast5Min: number };
      redaction: { running: number; invocationsLast5Min: number };
    };
  }> {
    return this.fetch('/api/metrics/lambda');
  }

  async getUsageSummary(days = 30): Promise<{
    usage: {
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
    };
  }> {
    return this.fetch(`/api/metrics/usage?days=${days}`);
  }

  async getDailyUsage(days = 30): Promise<{
    daily: Array<{ date: string; metric_type: string; total: number }>;
  }> {
    return this.fetch(`/api/metrics/daily?days=${days}`);
  }

  async getAWSMetrics(days = 30): Promise<{
    aws: {
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
    };
  }> {
    return this.fetch(`/api/metrics/aws?days=${days}`);
  }

  async getSystemPause(): Promise<{
    system: { paused: boolean; terminate: boolean; reason?: string; pausedAt?: number };
  }> {
    return this.fetch('/api/system/pause');
  }

  async setSystemPause(paused: boolean, options?: { terminate?: boolean; reason?: string }): Promise<{
    system: { paused: boolean; terminate: boolean; reason?: string; pausedAt?: number };
  }> {
    return this.fetch('/api/system/pause', {
      method: 'POST',
      body: JSON.stringify({ paused, ...options }),
    });
  }

  // Console methods (public, no auth required)
  async consoleGetSystemStatus(): Promise<{
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
  }> {
    return this.fetchPublic('/api/console/status');
  }

  async consoleGetUsageSummary(days = 30): Promise<{
    usage: {
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
    };
  }> {
    return this.fetchPublic(`/api/console/usage?days=${days}`);
  }

  async consoleGetDailyUsage(days = 30): Promise<{
    daily: Array<{ date: string; metric_type: string; total: number }>;
  }> {
    return this.fetchPublic(`/api/console/daily?days=${days}`);
  }

  async consoleGetAWSMetrics(days = 30): Promise<{
    aws: {
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
    };
  }> {
    return this.fetchPublic(`/api/console/aws?days=${days}`);
  }

  async consoleGetSystemPause(): Promise<{
    system: { paused: boolean; terminate: boolean; reason?: string; pausedAt?: number };
  }> {
    return this.fetchPublic('/api/console/pause');
  }

  async consoleSetSystemPause(paused: boolean, options?: { terminate?: boolean; reason?: string }): Promise<{
    system: { paused: boolean; terminate: boolean; reason?: string; pausedAt?: number };
  }> {
    const response = await fetch(`${API_BASE}/api/console/pause`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ paused, ...options }),
    });

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: 'Unknown error' }));
      throw new Error(error.error || `HTTP ${response.status}`);
    }

    return response.json();
  }

  async consoleGetRecentAgencies(): Promise<{
    agencies: Array<{ id: string; code: string; name: string; created_at: number }>;
  }> {
    return this.fetchPublic('/api/console/agencies');
  }

  async consoleGetRecentUsers(): Promise<{
    users: Array<{ id: string; email: string; name: string; role: string; created_at: number; agency_name: string }>;
  }> {
    return this.fetchPublic('/api/console/users');
  }
}

export const api = new ApiService();
