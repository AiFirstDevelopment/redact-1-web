import { create } from 'zustand';
import { api } from '../services/api';
import type { Detection, ManualRedaction } from '../types';

interface DetectionState {
  detections: Detection[];
  manualRedactions: ManualRedaction[];
  selectedDetectionId: string | null;
  isLoading: boolean;
  error: string | null;
  fetchDetections: (fileId: string) => Promise<void>;
  detectFaces: (fileId: string, pageImageBlob?: Blob, pageNumber?: number) => Promise<void>;
  updateDetection: (id: string, data: { status?: string; bbox_x?: number; bbox_y?: number; bbox_width?: number; bbox_height?: number; exemption_code?: string; comment?: string }) => Promise<void>;
  deleteDetection: (id: string) => Promise<void>;
  selectDetection: (id: string | null) => void;
  createManualRedaction: (fileId: string, data: Partial<ManualRedaction>) => Promise<void>;
  deleteManualRedaction: (id: string) => Promise<void>;
}

export const useDetectionStore = create<DetectionState>((set) => ({
  detections: [],
  manualRedactions: [],
  selectedDetectionId: null,
  isLoading: false,
  error: null,

  fetchDetections: async (fileId: string) => {
    set({ isLoading: true, error: null });
    try {
      const { detections, manual_redactions } = await api.listDetections(fileId);
      set({ detections, manualRedactions: manual_redactions, isLoading: false });
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to fetch detections', isLoading: false });
    }
  },

  detectFaces: async (fileId: string, pageImageBlob?: Blob, pageNumber?: number) => {
    // Don't set isLoading for individual pages to avoid flicker
    if (!pageImageBlob) {
      set({ isLoading: true, error: null });
    }
    try {
      const { detections } = await api.detectFaces(fileId, pageImageBlob, pageNumber);
      set((state) => ({
        detections: [...state.detections, ...detections],
        isLoading: false
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Face detection failed', isLoading: false });
      throw e;
    }
  },

  updateDetection: async (id: string, data: { status?: string; bbox_x?: number; bbox_y?: number; bbox_width?: number; bbox_height?: number; exemption_code?: string; comment?: string }) => {
    try {
      const { detection } = await api.updateDetection(id, data);
      set((state) => ({
        detections: state.detections.map((d) => (d.id === id ? detection : d)),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to update detection' });
      throw e;
    }
  },

  deleteDetection: async (id: string) => {
    try {
      // Update status to 'rejected' which removes it from view
      await api.updateDetection(id, { status: 'rejected' });
      set((state) => ({
        detections: state.detections.filter((d) => d.id !== id),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete detection' });
      throw e;
    }
  },

  selectDetection: (id: string | null) => {
    set({ selectedDetectionId: id });
  },

  createManualRedaction: async (fileId: string, data: Partial<ManualRedaction>) => {
    set({ isLoading: true, error: null });
    try {
      const { manual_redaction } = await api.createManualRedaction(fileId, data);
      set((state) => ({
        manualRedactions: [...state.manualRedactions, manual_redaction],
        isLoading: false
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to create redaction', isLoading: false });
      throw e;
    }
  },

  deleteManualRedaction: async (id: string) => {
    try {
      await api.deleteManualRedaction(id);
      set((state) => ({
        manualRedactions: state.manualRedactions.filter((r) => r.id !== id),
      }));
    } catch (e) {
      set({ error: e instanceof Error ? e.message : 'Failed to delete redaction' });
      throw e;
    }
  },
}));
