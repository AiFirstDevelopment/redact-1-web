import { create } from 'zustand';
import { api } from '../services/api';
import type { Request, EvidenceFile } from '../types';

interface RequestState {
  requests: Request[];
  total: number;
  currentRequest: Request | null;
  files: EvidenceFile[];
  isLoading: boolean;
  isLoadingMore: boolean;
  error: string | null;
  fetchRequests: (params?: { search?: string; assignee?: string; limit?: number }) => Promise<void>;
  fetchMoreRequests: (params?: { search?: string; assignee?: string }) => Promise<void>;
  fetchRequest: (id: string) => Promise<void>;
  fetchFiles: (requestId: string) => Promise<void>;
  createRequest: (data: Partial<Request> & { assign_to?: string }) => Promise<Request>;
  uploadFile: (requestId: string, file: File) => Promise<EvidenceFile>;
  deleteFile: (fileId: string) => Promise<void>;
}

export const useRequestStore = create<RequestState>((set, get) => ({
  requests: [],
  total: 0,
  currentRequest: null,
  files: [],
  isLoading: false,
  isLoadingMore: false,
  error: null,

  fetchRequests: async (params?: { search?: string; assignee?: string; limit?: number }) => {
    set({ isLoading: true, error: null });
    try {
      const { requests, total } = await api.listRequests({ ...params, limit: params?.limit ?? 25, offset: 0 });
      set({ requests, total, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch requests', isLoading: false });
    }
  },

  fetchMoreRequests: async (params?: { search?: string; assignee?: string }) => {
    const { requests: currentRequests, total, isLoadingMore } = get();
    if (isLoadingMore || currentRequests.length >= total) return;

    set({ isLoadingMore: true });
    try {
      const { requests: newRequests } = await api.listRequests({
        ...params,
        limit: 25,
        offset: currentRequests.length,
      });
      set((state) => ({
        requests: [...state.requests, ...newRequests],
        isLoadingMore: false,
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch more requests', isLoadingMore: false });
    }
  },

  fetchRequest: async (id: string) => {
    set({ isLoading: true, error: null });
    try {
      const { request } = await api.getRequest(id);
      set({ currentRequest: request, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch request', isLoading: false });
    }
  },

  fetchFiles: async (requestId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { files } = await api.listFiles(requestId);
      set({ files, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch files', isLoading: false });
    }
  },

  createRequest: async (data: Partial<Request> & { assign_to?: string }) => {
    set({ isLoading: true, error: null });
    try {
      const { request } = await api.createRequest(data);
      set((state) => ({ requests: [request, ...state.requests], total: state.total + 1, isLoading: false }));
      return request;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to create request', isLoading: false });
      throw e;
    }
  },

  uploadFile: async (requestId: string, file: File) => {
    set({ isLoading: true, error: null });
    try {
      // Check if this is a video file
      const isVideo = file.type.startsWith('video/') ||
        ['.mp4', '.mov', '.webm', '.avi'].some(ext => file.name.toLowerCase().endsWith(ext));

      const { file: uploadedFile } = isVideo
        ? await api.uploadVideo(requestId, file)
        : await api.uploadFile(requestId, file);
      set((state) => ({ files: [...state.files, uploadedFile], isLoading: false }));
      return uploadedFile;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to upload file', isLoading: false });
      throw e;
    }
  },

  deleteFile: async (fileId: string) => {
    set({ isLoading: true, error: null });
    try {
      await api.deleteFile(fileId);
      set((state) => ({ files: state.files.filter((f) => f.id !== fileId), isLoading: false }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete file', isLoading: false });
      throw e;
    }
  },
}));
