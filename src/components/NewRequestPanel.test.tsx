import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { BrowserRouter } from 'react-router-dom';
import { NewRequestPanel } from './NewRequestPanel';
import { useAuthStore } from '../stores/authStore';
import { mockUser, mockAgency } from '../test/handlers';

const renderNewRequestPanel = (props = {}) => {
  const defaultProps = {
    onClose: vi.fn(),
    onCreated: vi.fn(),
    ...props,
  };

  return render(
    <BrowserRouter>
      <NewRequestPanel {...defaultProps} />
    </BrowserRouter>
  );
};

describe('NewRequestPanel', () => {
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

  it('renders the panel header', () => {
    renderNewRequestPanel();
    expect(screen.getByText('New Request')).toBeInTheDocument();
  });

  it('renders close button', () => {
    renderNewRequestPanel();
    const buttons = screen.getAllByRole('button');
    expect(buttons.length).toBeGreaterThan(0);
  });

  it('renders title input field with optional placeholder', () => {
    renderNewRequestPanel();
    expect(screen.getByPlaceholderText(/optional/i)).toBeInTheDocument();
  });

  it('renders request date input field', () => {
    renderNewRequestPanel();
    expect(screen.getByDisplayValue(/2026/)).toBeInTheDocument();
  });

  it('renders notes textarea', () => {
    renderNewRequestPanel();
    expect(screen.getByPlaceholderText(/additional notes/i)).toBeInTheDocument();
  });

  it('renders Create Request button', () => {
    renderNewRequestPanel();
    expect(screen.getByRole('button', { name: /create request/i })).toBeInTheDocument();
  });

  it('allows entering title', async () => {
    const user = userEvent.setup();
    renderNewRequestPanel();

    const titleInput = screen.getByPlaceholderText(/optional/i);
    await user.type(titleInput, 'My New Request');

    expect(titleInput).toHaveValue('My New Request');
  });

  it('allows entering notes', async () => {
    const user = userEvent.setup();
    renderNewRequestPanel();

    const notesInput = screen.getByPlaceholderText(/additional notes/i);
    await user.type(notesInput, 'Some notes here');

    expect(notesInput).toHaveValue('Some notes here');
  });

  it('calls onClose when close button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderNewRequestPanel({ onClose });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);
    expect(onClose).toHaveBeenCalled();
  });

  it('creates request and calls onCreated without requiring title', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    renderNewRequestPanel({ onCreated });

    // Title is optional - can create without it
    const createButton = screen.getByRole('button', { name: /create request/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it('creates request with optional title', async () => {
    const user = userEvent.setup();
    const onCreated = vi.fn();
    renderNewRequestPanel({ onCreated });

    const titleInput = screen.getByPlaceholderText(/optional/i);
    await user.type(titleInput, 'New Test Request');

    const createButton = screen.getByRole('button', { name: /create request/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(onCreated).toHaveBeenCalled();
    });
  });

  it('disables create button while creating', async () => {
    const user = userEvent.setup();
    renderNewRequestPanel();

    const createButton = screen.getByRole('button', { name: /create request/i });
    await user.click(createButton);

    await waitFor(() => {
      expect(createButton).not.toBeDisabled();
    });
  });

  it('renders cancel button', () => {
    renderNewRequestPanel();
    expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
  });

  it('calls onClose when cancel button clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    renderNewRequestPanel({ onClose });

    const cancelButton = screen.getByRole('button', { name: /cancel/i });
    await user.click(cancelButton);

    expect(onClose).toHaveBeenCalled();
  });

  // ============================================
  // Auto-Generated Request Number Tests
  // ============================================

  describe('auto-generated request number', () => {
    it('does not have request number input field', () => {
      renderNewRequestPanel();

      // Should not have request number input
      expect(screen.queryByPlaceholderText(/foia/i)).not.toBeInTheDocument();
    });

    it('title field is optional (no required attribute)', () => {
      renderNewRequestPanel();

      const titleInput = screen.getByPlaceholderText(/optional/i);
      expect(titleInput).not.toHaveAttribute('required');
    });

    it('form can be submitted without title', async () => {
      const user = userEvent.setup();
      const onCreated = vi.fn();
      renderNewRequestPanel({ onCreated });

      // Don't fill in title - it's optional
      const createButton = screen.getByRole('button', { name: /create request/i });
      await user.click(createButton);

      await waitFor(() => {
        expect(onCreated).toHaveBeenCalled();
      });
    });
  });
});
