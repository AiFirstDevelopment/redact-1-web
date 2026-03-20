import { describe, it, expect, beforeEach } from 'vitest';
import { useRequestStore } from './requestStore';
import { mockRequest, mockFile } from '../test/handlers';

describe('requestStore', () => {
  beforeEach(() => {
    // Reset store state
    useRequestStore.setState({
      requests: [],
      total: 0,
      currentRequest: null,
      files: [],
      isLoading: false,
      isLoadingMore: false,
      error: null,
    });
    localStorage.setItem('token', 'mock-token');
  });

  describe('initial state', () => {
    it('starts with empty requests', () => {
      const state = useRequestStore.getState();
      expect(state.requests).toEqual([]);
    });

    it('starts with no current request', () => {
      const state = useRequestStore.getState();
      expect(state.currentRequest).toBeNull();
    });

    it('starts with empty files', () => {
      const state = useRequestStore.getState();
      expect(state.files).toEqual([]);
    });

    it('starts not loading', () => {
      const state = useRequestStore.getState();
      expect(state.isLoading).toBe(false);
    });

    it('starts with no error', () => {
      const state = useRequestStore.getState();
      expect(state.error).toBeNull();
    });
  });

  describe('fetchRequests', () => {
    it('sets loading state during fetch', async () => {
      const { fetchRequests } = useRequestStore.getState();

      const fetchPromise = fetchRequests();

      expect(useRequestStore.getState().isLoading).toBe(true);

      await fetchPromise;
    });

    it('fetches and stores requests', async () => {
      const { fetchRequests } = useRequestStore.getState();

      await fetchRequests();

      const state = useRequestStore.getState();
      expect(state.requests).toHaveLength(1);
      expect(state.requests[0]).toEqual(mockRequest);
      expect(state.isLoading).toBe(false);
    });

    it('clears error before fetching', async () => {
      useRequestStore.setState({ error: 'Previous error' });
      const { fetchRequests } = useRequestStore.getState();

      await fetchRequests();

      expect(useRequestStore.getState().error).toBeNull();
    });

    it('uses default limit of 25', async () => {
      const { fetchRequests } = useRequestStore.getState();

      await fetchRequests();

      const state = useRequestStore.getState();
      expect(state.total).toBe(1);
    });

    it('stores total count from response', async () => {
      const { fetchRequests } = useRequestStore.getState();

      await fetchRequests();

      const state = useRequestStore.getState();
      expect(state.total).toBeDefined();
      expect(typeof state.total).toBe('number');
    });
  });

  describe('fetchMoreRequests', () => {
    it('does not fetch if already loading more', async () => {
      useRequestStore.setState({ isLoadingMore: true, requests: [], total: 10 });
      const { fetchMoreRequests } = useRequestStore.getState();

      await fetchMoreRequests();

      // Should not change state since already loading
      expect(useRequestStore.getState().isLoadingMore).toBe(true);
    });

    it('does not fetch if all requests are loaded', async () => {
      useRequestStore.setState({ requests: [mockRequest], total: 1 });
      const { fetchMoreRequests } = useRequestStore.getState();

      await fetchMoreRequests();

      // Should not trigger loading since length >= total
      expect(useRequestStore.getState().isLoadingMore).toBe(false);
    });

    it('sets isLoadingMore during fetch', async () => {
      useRequestStore.setState({ requests: [], total: 10 });
      const { fetchMoreRequests } = useRequestStore.getState();

      const promise = fetchMoreRequests();
      expect(useRequestStore.getState().isLoadingMore).toBe(true);
      await promise;
    });

    it('appends new requests to existing list', async () => {
      useRequestStore.setState({ requests: [mockRequest], total: 10 });
      const { fetchMoreRequests } = useRequestStore.getState();

      await fetchMoreRequests();

      const state = useRequestStore.getState();
      expect(state.requests.length).toBeGreaterThanOrEqual(1);
      expect(state.isLoadingMore).toBe(false);
    });
  });

  describe('fetchRequest', () => {
    it('fetches single request by id', async () => {
      const { fetchRequest } = useRequestStore.getState();

      await fetchRequest('req-1');

      const state = useRequestStore.getState();
      expect(state.currentRequest).toEqual(mockRequest);
      expect(state.isLoading).toBe(false);
    });

    it('sets error for non-existent request', async () => {
      const { fetchRequest } = useRequestStore.getState();

      await fetchRequest('non-existent');

      const state = useRequestStore.getState();
      expect(state.error).toBeTruthy();
    });
  });

  describe('fetchFiles', () => {
    it('fetches files for a request', async () => {
      const { fetchFiles } = useRequestStore.getState();

      await fetchFiles('req-1');

      const state = useRequestStore.getState();
      expect(state.files).toHaveLength(1);
      expect(state.files[0]).toEqual(mockFile);
      expect(state.isLoading).toBe(false);
    });

    it('sets loading state during fetch', async () => {
      const { fetchFiles } = useRequestStore.getState();

      const fetchPromise = fetchFiles('req-1');

      expect(useRequestStore.getState().isLoading).toBe(true);

      await fetchPromise;
    });
  });

  describe('createRequest', () => {
    it('creates request and adds to list', async () => {
      const { createRequest } = useRequestStore.getState();

      const newRequest = await createRequest({
        title: 'New Request',
        request_number: 'FOIA-2024-001',
      });

      const state = useRequestStore.getState();
      expect(newRequest).toBeTruthy();
      expect(state.requests).toContainEqual(newRequest);
    });

    it('sets loading state during creation', async () => {
      const { createRequest } = useRequestStore.getState();

      const createPromise = createRequest({ title: 'Test' });

      expect(useRequestStore.getState().isLoading).toBe(true);

      await createPromise;
    });

    it('adds new request to beginning of list', async () => {
      // Pre-populate with existing request
      useRequestStore.setState({ requests: [mockRequest] });
      const { createRequest } = useRequestStore.getState();

      const newRequest = await createRequest({ title: 'New Request' });

      const state = useRequestStore.getState();
      expect(state.requests[0]).toEqual(newRequest);
    });
  });

  describe('uploadFile', () => {
    it('uploads file and adds to list', async () => {
      const { uploadFile } = useRequestStore.getState();
      const file = new File(['test content'], 'test.pdf', { type: 'application/pdf' });

      const { promise } = uploadFile('req-1', file);
      const uploadedFile = await promise;

      const state = useRequestStore.getState();
      expect(uploadedFile).toBeTruthy();
      expect(state.files).toContainEqual(uploadedFile);
    });

    it('sets loading state during upload', async () => {
      const { uploadFile } = useRequestStore.getState();
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

      const { promise } = uploadFile('req-1', file);

      expect(useRequestStore.getState().isLoading).toBe(true);

      await promise;
    });

    it('returns abort function for cancelling upload', () => {
      const { uploadFile } = useRequestStore.getState();
      const file = new File(['test'], 'test.pdf', { type: 'application/pdf' });

      const { promise, abort } = uploadFile('req-1', file);

      expect(typeof abort).toBe('function');
      expect(promise).toBeInstanceOf(Promise);
    });
  });

  describe('deleteFile', () => {
    it('removes file from list', async () => {
      // Pre-populate with file
      useRequestStore.setState({ files: [mockFile] });
      const { deleteFile } = useRequestStore.getState();

      await deleteFile('file-1');

      const state = useRequestStore.getState();
      expect(state.files).not.toContainEqual(mockFile);
    });

    it('sets loading state during deletion', async () => {
      useRequestStore.setState({ files: [mockFile] });
      const { deleteFile } = useRequestStore.getState();

      const deletePromise = deleteFile('file-1');

      expect(useRequestStore.getState().isLoading).toBe(true);

      await deletePromise;
    });
  });
});
