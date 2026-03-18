import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { RequestsList } from './RequestsList';
import { mockRequest } from '../test/handlers';

const renderRequestsList = (props = {}) => {
  const defaultProps = {
    requests: [mockRequest],
    isLoading: false,
    selectedId: null,
    onSelect: vi.fn(),
    onNewRequest: vi.fn(),
    onArchive: vi.fn(),
    onDelete: vi.fn(),
    ...props,
  };

  return render(
    <BrowserRouter>
      <RequestsList {...defaultProps} />
    </BrowserRouter>
  );
};

describe('RequestsList', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('renders the header and New Request button', () => {
    renderRequestsList();

    expect(screen.getByText('Records Requests')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /new request/i })).toBeInTheDocument();
  });

  it('renders search input', () => {
    renderRequestsList();

    expect(screen.getByPlaceholderText(/search requests/i)).toBeInTheDocument();
  });

  it('displays requests in the list', () => {
    renderRequestsList();

    expect(screen.getByText('RR-20260318-001')).toBeInTheDocument();
    expect(screen.getByText('Test Request')).toBeInTheDocument();
  });

  it('shows loading state', () => {
    renderRequestsList({ isLoading: true, requests: [] });

    expect(screen.getByText(/loading/i)).toBeInTheDocument();
  });

  it('shows empty state when no requests', () => {
    renderRequestsList({ requests: [], isLoading: false });

    expect(screen.getByText(/no requests yet/i)).toBeInTheDocument();
  });

  it('calls onSelect when request is clicked', async () => {
    const user = userEvent.setup();
    const onSelect = vi.fn();
    renderRequestsList({ onSelect });

    const requestItem = screen.getByText('Test Request');
    await user.click(requestItem);

    expect(onSelect).toHaveBeenCalledWith(mockRequest);
  });

  it('calls onNewRequest when New Request button clicked', async () => {
    const user = userEvent.setup();
    const onNewRequest = vi.fn();
    renderRequestsList({ onNewRequest });

    const newRequestBtn = screen.getByRole('button', { name: /new request/i });
    await user.click(newRequestBtn);

    expect(onNewRequest).toHaveBeenCalled();
  });

  it('highlights selected request', () => {
    renderRequestsList({ selectedId: 'req-1' });

    const requestItem = screen.getByText('Test Request').closest('div[class*="border"]');
    expect(requestItem?.className).toContain('border-blue-500');
  });

  it('filters requests by search term', async () => {
    const user = userEvent.setup();
    const requests = [
      mockRequest,
      { ...mockRequest, id: 'req-2', request_number: 'RR-20260318-002', title: 'Another Request' },
    ];
    renderRequestsList({ requests });

    const searchInput = screen.getByPlaceholderText(/search requests/i);
    await user.type(searchInput, 'Another');

    expect(screen.queryByText('Test Request')).not.toBeInTheDocument();
    expect(screen.getByText('Another Request')).toBeInTheDocument();
  });

  it('shows archive button for each request', () => {
    renderRequestsList();

    const archiveButtons = screen.getAllByTitle(/archive/i);
    expect(archiveButtons.length).toBeGreaterThan(0);
  });

  it('shows delete button for each request', () => {
    renderRequestsList();

    const deleteButtons = screen.getAllByTitle(/delete/i);
    expect(deleteButtons.length).toBeGreaterThan(0);
  });

  it('shows restore button in archived view', () => {
    const archivedRequest = { ...mockRequest, archived_at: Date.now() };
    renderRequestsList({
      requests: [archivedRequest],
      showArchived: true,
      onUnarchive: vi.fn(),
    });

    const restoreButtons = screen.getAllByTitle(/restore/i);
    expect(restoreButtons.length).toBeGreaterThan(0);
  });

  it('hides New Request button in archived view', () => {
    renderRequestsList({ showArchived: true });

    const newRequestBtn = screen.queryByRole('button', { name: /new request/i });
    expect(newRequestBtn).not.toBeInTheDocument();
  });

  it('displays request status badge', () => {
    renderRequestsList();

    expect(screen.getByText('new')).toBeInTheDocument();
  });
});
