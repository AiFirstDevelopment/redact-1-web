import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { BrowserRouter } from 'react-router-dom';
import { RequestDetailPanel } from './RequestDetailPanel';
import { useAuthStore } from '../stores/authStore';
import { mockRequest, mockUser, mockAgency } from '../test/handlers';

const renderPanel = (props = {}) => {
  const defaultProps = {
    request: mockRequest,
    onClose: vi.fn(),
    ...props,
  };

  return render(
    <BrowserRouter>
      <RequestDetailPanel {...defaultProps} />
    </BrowserRouter>
  );
};

describe('RequestDetailPanel', () => {
  beforeEach(() => {
    localStorage.setItem('token', 'mock-token');
    localStorage.setItem('agency', JSON.stringify(mockAgency));

    useAuthStore.setState({
      user: mockUser,
      agency: mockAgency,
      isAuthenticated: true,
      isEnrolled: true,
      isLoading: false,
      error: null,
    });
  });

  it('renders the panel header with request number', () => {
    renderPanel();
    expect(screen.getByText('RR-20260318-001')).toBeInTheDocument();
    expect(screen.getByText('Request Details')).toBeInTheDocument();
  });

  it('displays request title', () => {
    renderPanel();
    expect(screen.getByText('Test Request')).toBeInTheDocument();
  });

  it('displays request status', () => {
    renderPanel();
    expect(screen.getByText('new')).toBeInTheDocument();
  });

  it('displays request date', () => {
    renderPanel();
    expect(screen.getByText(/request date/i)).toBeInTheDocument();
  });

  it('renders File section', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('File')).toBeInTheDocument();
    });
  });

  it('displays files from API', async () => {
    renderPanel();

    // Files are fetched via MSW
    await waitFor(() => {
      expect(screen.getByText('test.pdf')).toBeInTheDocument();
    });
  });

  it('shows file size', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/1.*KB/i)).toBeInTheDocument();
    });
  });

  it('displays notes if present', () => {
    const requestWithNotes = { ...mockRequest, notes: 'Some important notes' };
    renderPanel({ request: requestWithNotes });
    expect(screen.getByText('Some important notes')).toBeInTheDocument();
  });
});
