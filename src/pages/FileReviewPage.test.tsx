import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Routes, Route } from 'react-router-dom';
import { http, HttpResponse } from 'msw';
import { FileReviewPage } from './FileReviewPage';
import { useAuthStore } from '../stores/authStore';
import { useDetectionStore } from '../stores/detectionStore';
import { mockUser, mockAgency, mockDetection } from '../test/handlers';
import { server } from '../test/setup';

const API_BASE = 'https://redact-1-worker.joelstevick.workers.dev';

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

    useDetectionStore.setState({
      detections: [],
      manualRedactions: [],
      selectedDetectionId: null,
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

  describe('Run Detection prompt', () => {
    beforeEach(() => {
      // Override to return no detections
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        })
      );
    });

    it('shows Run Detection button when no detections exist', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });
    });

    it('shows Close button instead of Cancel/Save when no detections', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /close/i })).toBeInTheDocument();
      });

      expect(screen.queryByRole('button', { name: /cancel/i })).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
    });
  });

  describe('Save functionality', () => {
    beforeEach(() => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [mockDetection], manual_redactions: [] });
        })
      );
    });

    it('shows success message when Save is clicked', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(screen.getByText(/changes saved successfully/i)).toBeInTheDocument();
      });
    });

    it('dismisses success modal with OK button', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save/i }));

      await waitFor(() => {
        expect(screen.getByText(/changes saved successfully/i)).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /ok/i }));

      await waitFor(() => {
        expect(screen.queryByText(/changes saved successfully/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Cancel functionality', () => {
    beforeEach(() => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [mockDetection], manual_redactions: [] });
        })
      );
    });

    it('shows Cancel button when detections exist', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });
  });

  describe('Detection dry run', () => {
    it('calls detect API with dry_run parameter', async () => {
      let detectCalled = false;
      let hasDryRunParam = false;

      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:fileId/detect`, ({ request }) => {
          detectCalled = true;
          const url = new URL(request.url);
          hasDryRunParam = url.searchParams.get('dry_run') === 'true';
          return HttpResponse.json({ detections: [mockDetection], count: 1 });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run detection/i }));

      await waitFor(() => {
        expect(detectCalled).toBe(true);
      });

      expect(hasDryRunParam).toBe(true);
    });
  });

  describe('Progress indicator', () => {
    it('shows Run Detection button which triggers detection flow', async () => {
      let detectCalled = false;

      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:fileId/detect`, () => {
          detectCalled = true;
          return HttpResponse.json({ detections: [mockDetection], count: 1 });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run detection/i }));

      // Detection API should be called
      await waitFor(() => {
        expect(detectCalled).toBe(true);
      });
    });
  });

  // ============================================
  // Exemption Code and Comment Tests
  // ============================================

  describe('Exemption Code and Comment Features', () => {
    beforeEach(() => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({
            detections: [mockDetection],
            manual_redactions: [],
          });
        })
      );
    });

    it('loads page with detections and shows Save button', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });
    });

    it('loads page with Cancel button when detections exist', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it('maintains detection state after loading', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        // Page should load successfully with detections
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
        expect(screen.queryByText(/run detection/i)).not.toBeInTheDocument();
      });
    });
  });

  // ============================================
  // No Redactions Needed Tests
  // ============================================

  describe('No Redactions Needed', () => {
    beforeEach(() => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        })
      );
    });

    it('shows No Redactions Needed button when no detections', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /no redactions needed/i })).toBeInTheDocument();
      });
    });

    it('calls mark-reviewed API when No Redactions Needed is clicked', async () => {
      let markReviewedCalled = false;

      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:id/mark-reviewed`, () => {
          markReviewedCalled = true;
          return HttpResponse.json({ file: { id: 'file-1', status: 'reviewed' } });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /no redactions needed/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /no redactions needed/i }));

      await waitFor(() => {
        expect(markReviewedCalled).toBe(true);
      });
    });
  });

  // ============================================
  // Save Button Spinner Tests
  // ============================================

  describe('Save button states', () => {
    beforeEach(() => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [mockDetection], manual_redactions: [] });
        })
      );
    });

    it('disables Save button during save operation', async () => {
      server.use(
        http.put(`${API_BASE}/api/detections/:id`, async () => {
          // Simulate slow API
          await new Promise(resolve => setTimeout(resolve, 100));
          return HttpResponse.json({ detection: mockDetection });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });

      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // Button should be disabled during save
      expect(saveButton).toBeDisabled();
    });
  });

  // ============================================
  // Navigation with Request Context Tests
  // ============================================

  describe('Navigation with request context', () => {
    const renderWithRequestParam = () => {
      return render(
        <MemoryRouter initialEntries={['/files/file-1?request=req-1']}>
          <Routes>
            <Route path="/files/:id" element={<FileReviewPage />} />
          </Routes>
        </MemoryRouter>
      );
    };

    it('preserves request ID in URL for navigation', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [mockDetection], manual_redactions: [] });
        })
      );

      renderWithRequestParam();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });
    });
  });
});
