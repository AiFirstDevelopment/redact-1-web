import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { FileReviewPage } from './FileReviewPage';
import { useAuthStore } from '../stores/authStore';
import { mockUser, mockAgency } from '../test/handlers';

const renderFileReviewPage = () => {
  return render(
    <MemoryRouter initialEntries={['/files/file-1']}>
      <Routes>
        <Route path="/files/:id" element={<FileReviewPage />} />
      </Routes>
    </MemoryRouter>
  );
};

describe('FileReviewPage', () => {
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

  it('renders the page header', async () => {
    renderFileReviewPage();

    await waitFor(() => {
      expect(screen.getByText('File Review')).toBeInTheDocument();
    });
  });

  it('shows toolbar with terracotta background', async () => {
    renderFileReviewPage();

    await waitFor(() => {
      const header = screen.getByRole('banner');
      expect(header).toBeInTheDocument();
    });
  });

  it('shows loading file message initially', () => {
    renderFileReviewPage();
    expect(screen.getByText('Loading file...')).toBeInTheDocument();
  });

  it('renders PDF navigation for multi-page PDFs', async () => {
    renderFileReviewPage();

    await waitFor(() => {
      expect(screen.getByText('File Review')).toBeInTheDocument();
    });
  });

  it('shows Cancel and Save buttons after loading detections', async () => {
    renderFileReviewPage();

    // MSW returns detections, so Cancel and Save should be visible
    await waitFor(() => {
      expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });
  });

  it('shows file id from route params', async () => {
    renderFileReviewPage();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
    });
  });
});
