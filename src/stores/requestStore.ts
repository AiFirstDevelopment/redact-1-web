import { create } from 'zustand';
import { api } from '../services/api';
import type { Request, EvidenceFile } from '../types';

interface RequestState {
  requests: Request[];
  currentRequest: Request | null;
  files: EvidenceFile[];
  isLoading: boolean;
  error: string | null;
  fetchRequests: () => Promise<void>;
  fetchRequest: (id: string) => Promise<void>;
  fetchFiles: (requestId: string) => Promise<void>;
  createRequest: (data: Partial<Request>) => Promise<Request>;
  uploadFile: (requestId: string, file: File) => Promise<EvidenceFile>;
}

export const useRequestStore = create<RequestState>((set) => ({
  requests: [],
  currentRequest: null,
  files: [],
  isLoading: false,
  error: null,

  fetchRequests: async () => {
    set({ isLoading: true, error: null });
    try {
      const { requests } = await api.listRequests();
      set({ requests, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch requests', isLoading: false });
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

  createRequest: async (data: Partial<Request>) => {
    set({ isLoading: true, error: null });
    try {
      const { request } = await api.createRequest(data);
      set((state) => ({ requests: [request, ...state.requests], isLoading: false }));
      return request;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to create request', isLoading: false });
      throw e;
    }
  },

  uploadFile: async (requestId: string, file: File) => {
    set({ isLoading: true, error: null });
    try {
      const { file: uploadedFile } = await api.uploadFile(requestId, file);
      set((state) => ({ files: [...state.files, uploadedFile], isLoading: false }));
      return uploadedFile;
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to upload file', isLoading: false });
      throw e;
    }
  },
}));
