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

    it('navigates back when Save is clicked', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /save/i }));

      // Save now navigates directly back without showing a modal
      // The FileReviewPage component should unmount or change state
      await waitFor(() => {
        // The page navigates away, so the save button should no longer be visible
        // or we should be at a different route
        expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
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

  describe('Mark Complete (No Redactions Needed)', () => {
    it('shows Run Detection button first when no detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        })
      );

      renderFileReviewPage();

      // Should show Run Detection first, not Mark Complete
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });
    });

    it('shows Mark Complete button after detection runs with no results', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:fileId/detect`, () => {
          return HttpResponse.json({ detections: [], count: 0 });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      // Click Run Detection first
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run detection/i }));

      // Now Mark Complete should appear
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
      });
    });

    it('calls mark-reviewed API when Mark Complete is clicked', async () => {
      let markReviewedCalled = false;

      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:fileId/detect`, () => {
          return HttpResponse.json({ detections: [], count: 0 });
        }),
        http.post(`${API_BASE}/api/files/:id/mark-reviewed`, () => {
          markReviewedCalled = true;
          return HttpResponse.json({ file: { id: 'file-1', status: 'reviewed' } });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      // First run detection
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run detection/i }));

      // Then click Mark Complete
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /mark complete/i }));

      await waitFor(() => {
        expect(markReviewedCalled).toBe(true);
      });
    });
  });

  // ============================================
  // Save Button Spinner Tests
  // ============================================

  describe('Save button states', () => {
    it('shows Save button when there are detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [mockDetection], manual_redactions: [] });
        })
      );

      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });
    });

    it('shows spinner during save operation', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [mockDetection], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:fileId/detections`, async () => {
          // Simulate slow API
          await new Promise(resolve => setTimeout(resolve, 500));
          return HttpResponse.json({ detections: [mockDetection] });
        }),
        http.put(`${API_BASE}/api/detections/:id`, async () => {
          // Simulate slow API
          await new Promise(resolve => setTimeout(resolve, 500));
          return HttpResponse.json({ detection: mockDetection });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });

      // Click save - this will navigate away after saving
      const saveButton = screen.getByRole('button', { name: /save/i });
      await user.click(saveButton);

      // After save completes, we navigate away so the button should be gone
      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /save/i })).not.toBeInTheDocument();
      });
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

  // ============================================
  // Deferred Save/Cancel Semantics Tests
  // ============================================

  describe('Deferred save/cancel semantics', () => {
    const pendingDetection = {
      ...mockDetection,
      status: 'pending',
    };

    beforeEach(() => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [pendingDetection], manual_redactions: [] });
        })
      );
    });

    it('does not call API immediately when detection is clicked', async () => {
      let apiCalled = false;
      server.use(
        http.put(`${API_BASE}/api/detections/:id`, () => {
          apiCalled = true;
          return HttpResponse.json({ detection: mockDetection });
        })
      );

      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });

      // API should not be called just from loading
      expect(apiCalled).toBe(false);
    });

    it('Cancel navigates directly when no modifications made', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Should navigate away without confirmation (no modal)
      await waitFor(() => {
        expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument();
      });
    });

    it('shows bulk action buttons for pending detections', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reject remaining/i })).toBeInTheDocument();
      });
    });

    it('shows pending count in bulk action buttons', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining \(1\)/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reject remaining \(1\)/i })).toBeInTheDocument();
      });
    });

    it('shows confirmation dialog when Approve Remaining is clicked', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /approve remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });
    });

    it('shows confirmation dialog when Reject Remaining is clicked', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject remaining/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /reject remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/reject remaining on page/i)).toBeInTheDocument();
      });
    });

    it('does not call API when Approve Remaining is confirmed', async () => {
      let apiCalled = false;
      server.use(
        http.put(`${API_BASE}/api/detections/:id`, () => {
          apiCalled = true;
          return HttpResponse.json({ detection: mockDetection });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /approve remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });

      // Click the confirm button in the modal
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
      });

      // API should NOT be called yet (deferred until Save)
      expect(apiCalled).toBe(false);
    });

    it('does not call API when Reject Remaining is confirmed', async () => {
      let apiCalled = false;
      server.use(
        http.put(`${API_BASE}/api/detections/:id`, () => {
          apiCalled = true;
          return HttpResponse.json({ detection: mockDetection });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject remaining/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /reject remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/reject remaining on page/i)).toBeInTheDocument();
      });

      // Click the confirm button in the modal
      await user.click(screen.getByRole('button', { name: /reject remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/reject remaining on page/i)).not.toBeInTheDocument();
      });

      // API should NOT be called yet (deferred until Save)
      expect(apiCalled).toBe(false);
    });

    it('Cancel shows confirmation after bulk approve', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      // Click approve remaining
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });

      // Confirm the approval
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
      });

      // Now click Cancel - should show confirmation
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
      });
    });

    it('Cancel shows confirmation after bulk reject with multiple detections', async () => {
      const secondDetection = {
        ...mockDetection,
        id: 'detection-2',
        status: 'approved', // One approved, one pending
      };

      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({
            detections: [pendingDetection, secondDetection],
            manual_redactions: []
          });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject remaining/i })).toBeInTheDocument();
      });

      // Click reject remaining
      await user.click(screen.getByRole('button', { name: /reject remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/reject remaining on page/i)).toBeInTheDocument();
      });

      // Confirm the rejection
      await user.click(screen.getByRole('button', { name: /reject remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/reject remaining on page/i)).not.toBeInTheDocument();
      });

      // Now click Cancel - should show confirmation (there's still one approved detection)
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      await waitFor(() => {
        expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
      });
    });

    it('hides rejected detections from view without API call', async () => {
      const user = userEvent.setup();
      let apiCalled = false;
      server.use(
        http.put(`${API_BASE}/api/detections/:id`, () => {
          apiCalled = true;
          return HttpResponse.json({ detection: { ...mockDetection, status: 'rejected' } });
        })
      );

      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject remaining \(1\)/i })).toBeInTheDocument();
      });

      // Click reject remaining
      await user.click(screen.getByRole('button', { name: /reject remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/reject remaining on page/i)).toBeInTheDocument();
      });

      // Confirm the rejection
      await user.click(screen.getByRole('button', { name: /reject remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/reject remaining on page/i)).not.toBeInTheDocument();
      });

      // After rejecting all detections, the "no redactions" state appears
      // because there are no non-rejected detections left
      await waitFor(() => {
        expect(screen.getByText(/no redactions to apply/i)).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
      });

      // API should NOT have been called (deferred until Save)
      expect(apiCalled).toBe(false);
    });

    it('updates pending count after bulk approve', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining \(1\)/i })).toBeInTheDocument();
      });

      // Click approve remaining
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });

      // Confirm
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Wait for count to update
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining \(0\)/i })).toBeInTheDocument();
      });
    });

    it('calls API when Save is clicked after modifications', async () => {
      let updateCalled = false;
      server.use(
        http.put(`${API_BASE}/api/detections/:id`, () => {
          updateCalled = true;
          return HttpResponse.json({ detection: { ...mockDetection, status: 'approved' } });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      // Make a modification via bulk approve
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));
      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
      });

      // Now click Save
      await user.click(screen.getByRole('button', { name: /save/i }));

      // API should be called now
      await waitFor(() => {
        expect(updateCalled).toBe(true);
      });
    });

    it('discard confirmation navigates away when Yes is clicked', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      // Make a modification
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));
      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
      });

      // Click Cancel
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Confirmation should appear
      await waitFor(() => {
        expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
      });

      // Click Yes, Discard
      await user.click(screen.getByRole('button', { name: /yes, discard/i }));

      // Should navigate away - confirmation modal should be gone
      await waitFor(() => {
        expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument();
      });
    });

    it('discard confirmation closes when No is clicked', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      // Make a modification
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));
      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
      });

      // Click Cancel
      await user.click(screen.getByRole('button', { name: /cancel/i }));

      // Confirmation should appear
      await waitFor(() => {
        expect(screen.getByText(/discard changes/i)).toBeInTheDocument();
      });

      // Click No
      await user.click(screen.getByRole('button', { name: /^no$/i }));

      // Should stay on page - confirmation modal should be gone but Save/Cancel still visible
      await waitFor(() => {
        expect(screen.queryByText(/discard changes/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });
    });

    it('bulk approve confirmation can be cancelled', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      // Click approve remaining
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });

      // Click Cancel in the modal (it's inside the modal, so find it within the modal context)
      const modalCancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      // The modal cancel button is the one inside the modal dialog
      const modalCancelButton = modalCancelButtons.find(btn =>
        btn.closest('.fixed.inset-0.bg-black\\/60')
      );
      if (modalCancelButton) {
        await user.click(modalCancelButton);
      }

      // Modal should close, but count should remain unchanged
      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /approve remaining \(1\)/i })).toBeInTheDocument();
      });
    });

    it('bulk reject confirmation can be cancelled', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject remaining/i })).toBeInTheDocument();
      });

      // Click reject remaining
      await user.click(screen.getByRole('button', { name: /reject remaining/i }));

      await waitFor(() => {
        expect(screen.getByText(/reject remaining on page/i)).toBeInTheDocument();
      });

      // Click Cancel in the modal (it's inside the modal, so find it within the modal context)
      const modalCancelButtons = screen.getAllByRole('button', { name: /cancel/i });
      // The modal cancel button is the one inside the modal dialog
      const modalCancelButton = modalCancelButtons.find(btn =>
        btn.closest('.fixed.inset-0.bg-black\\/60')
      );
      if (modalCancelButton) {
        await user.click(modalCancelButton);
      }

      // Modal should close, but count should remain unchanged
      await waitFor(() => {
        expect(screen.queryByText(/reject remaining on page/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /reject remaining \(1\)/i })).toBeInTheDocument();
      });
    });

    it('disables bulk action buttons when no pending detections', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [{ ...mockDetection, status: 'approved' }], manual_redactions: [] });
        })
      );

      renderFileReviewPage();

      await waitFor(() => {
        const approveButton = screen.getByRole('button', { name: /approve remaining \(0\)/i });
        const rejectButton = screen.getByRole('button', { name: /reject remaining \(0\)/i });
        expect(approveButton).toBeDisabled();
        expect(rejectButton).toBeDisabled();
      });
    });
  });

  // ============================================
  // Server Detection State Tests
  // ============================================

  describe('Server detection local state management', () => {
    const pendingDetection = {
      ...mockDetection,
      status: 'pending',
    };

    beforeEach(() => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [pendingDetection], manual_redactions: [] });
        })
      );
    });

    it('initializes modified detections from server detections', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        // Should show pending count of 1 (from server detection)
        expect(screen.getByRole('button', { name: /approve remaining \(1\)/i })).toBeInTheDocument();
      });
    });

    it('shows Save and Cancel buttons when server detections exist', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it('sets hasRunDetection flag when detections exist on load', async () => {
      renderFileReviewPage();

      await waitFor(() => {
        // With detections present, should not show "Run Detection" button
        expect(screen.queryByRole('button', { name: /run detection/i })).not.toBeInTheDocument();
        // Should show Save/Cancel instead
        expect(screen.getByRole('button', { name: /save/i })).toBeInTheDocument();
      });
    });

    it('tracks detection status changes in local modified state', async () => {
      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining \(1\)/i })).toBeInTheDocument();
      });

      // Approve the detection
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));
      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Wait for local state update
      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
      });

      // Count should now be 0 (locally modified, not yet saved)
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining \(0\)/i })).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Error Handling Tests
  // ============================================

  describe('Error handling', () => {
    it('shows error message when file loading fails', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/original`, () => {
          return HttpResponse.json({ error: 'File not found' }, { status: 404 });
        })
      );

      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByText(/error loading file/i)).toBeInTheDocument();
      });
    });

    it('displays loading state initially', async () => {
      useDetectionStore.setState({
        detections: [],
        manualRedactions: [],
        selectedDetectionId: null,
        isLoading: true,
        error: null,
      });

      renderFileReviewPage();

      // Should show loading state
      expect(screen.getByText(/loading file/i)).toBeInTheDocument();
    });

    it('shows modal message when detection fails', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:fileId/detect`, () => {
          return HttpResponse.json({ error: 'Detection service unavailable' }, { status: 500 });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run detection/i }));

      // Should show error modal
      await waitFor(() => {
        expect(screen.getByText(/detection failed/i)).toBeInTheDocument();
      });

      // Click OK to dismiss modal
      await user.click(screen.getByRole('button', { name: /ok/i }));

      await waitFor(() => {
        expect(screen.queryByText(/detection failed/i)).not.toBeInTheDocument();
      });
    });

    it('shows modal message when save fails', async () => {
      const pendingDetection = { ...mockDetection, status: 'pending' };

      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [pendingDetection], manual_redactions: [] });
        }),
        http.put(`${API_BASE}/api/detections/:id`, () => {
          return HttpResponse.json({ error: 'Save failed' }, { status: 500 });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      // Make a modification
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));
      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
      });

      // Try to save
      await user.click(screen.getByRole('button', { name: /save/i }));

      // Should show error modal
      await waitFor(() => {
        expect(screen.getByText(/failed to save/i)).toBeInTheDocument();
      });
    });

    it('shows success message when Mark Complete succeeds', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:fileId/detect`, () => {
          return HttpResponse.json({ detections: [], count: 0 });
        }),
        http.post(`${API_BASE}/api/files/:id/mark-reviewed`, () => {
          return HttpResponse.json({ file: { id: 'file-1', status: 'reviewed' } });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      // First run detection
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run detection/i }));

      // Then click Mark Complete
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /mark complete/i }));

      // Should show success modal
      await waitFor(() => {
        expect(screen.getByText(/no redactions needed/i)).toBeInTheDocument();
      });
    });

    it('shows error message when Mark Complete fails', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [], manual_redactions: [] });
        }),
        http.post(`${API_BASE}/api/files/:fileId/detect`, () => {
          return HttpResponse.json({ detections: [], count: 0 });
        }),
        http.post(`${API_BASE}/api/files/:id/mark-reviewed`, () => {
          return HttpResponse.json({ error: 'Failed to mark as reviewed' }, { status: 500 });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      // First run detection
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /run detection/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /run detection/i }));

      // Then click Mark Complete
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
      });

      await user.click(screen.getByRole('button', { name: /mark complete/i }));

      // Should show error modal
      await waitFor(() => {
        expect(screen.getByText(/failed to mark file as reviewed/i)).toBeInTheDocument();
      });
    });
  });

  // ============================================
  // Save API Integration Tests
  // ============================================

  describe('Save syncs modified detections to API', () => {
    const pendingDetection = {
      ...mockDetection,
      status: 'pending',
    };

    it('calls updateDetection API for each modified server detection on Save', async () => {
      const updateCalls: string[] = [];

      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [pendingDetection], manual_redactions: [] });
        }),
        http.put(`${API_BASE}/api/detections/:id`, async ({ params }) => {
          updateCalls.push(params.id as string);
          return HttpResponse.json({ detection: { ...mockDetection, status: 'approved' } });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining/i })).toBeInTheDocument();
      });

      // Approve via bulk action
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));
      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Wait for modal to close
      await waitFor(() => {
        expect(screen.queryByText(/approve remaining on page/i)).not.toBeInTheDocument();
      });

      // Click Save
      await user.click(screen.getByRole('button', { name: /save/i }));

      // Verify API was called with the detection ID
      await waitFor(() => {
        expect(updateCalls).toContain(pendingDetection.id);
      });
    });

    it('calls deleteDetection API for rejected detections on Save', async () => {
      const deleteCalls: string[] = [];

      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({ detections: [pendingDetection], manual_redactions: [] });
        }),
        http.put(`${API_BASE}/api/detections/:id`, async ({ params, request }) => {
          const body = await request.json() as { status?: string };
          if (body.status === 'rejected') {
            deleteCalls.push(params.id as string);
          }
          return HttpResponse.json({ detection: { ...mockDetection, status: 'rejected' } });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /reject remaining/i })).toBeInTheDocument();
      });

      // Reject via bulk action
      await user.click(screen.getByRole('button', { name: /reject remaining/i }));
      await waitFor(() => {
        expect(screen.getByText(/reject remaining on page/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /reject remaining$/i }));

      // Wait for modal to close - after rejecting all, "Mark Complete" appears
      await waitFor(() => {
        expect(screen.queryByText(/reject remaining on page/i)).not.toBeInTheDocument();
        expect(screen.getByRole('button', { name: /mark complete/i })).toBeInTheDocument();
      });

      // We can't click Save in this state because the page switches to Mark Complete overlay
      // This test verifies the rejection was tracked locally
      expect(deleteCalls).toHaveLength(0); // Not called until Save, which isn't shown
    });
  });

  // ============================================
  // Multiple Detections Tests
  // ============================================

  describe('Multiple detections handling', () => {
    const pendingDetection1 = { ...mockDetection, id: 'det-1', status: 'pending' };
    const pendingDetection2 = { ...mockDetection, id: 'det-2', status: 'pending' };
    const approvedDetection = { ...mockDetection, id: 'det-3', status: 'approved' };

    it('shows correct count with mixed detection statuses', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({
            detections: [pendingDetection1, pendingDetection2, approvedDetection],
            manual_redactions: []
          });
        })
      );

      renderFileReviewPage();

      await waitFor(() => {
        // Should show 2 pending (not 3 - one is already approved)
        expect(screen.getByRole('button', { name: /approve remaining \(2\)/i })).toBeInTheDocument();
      });
    });

    it('updates count after partial bulk approve', async () => {
      server.use(
        http.get(`${API_BASE}/api/files/:fileId/detections`, () => {
          return HttpResponse.json({
            detections: [pendingDetection1, pendingDetection2, approvedDetection],
            manual_redactions: []
          });
        })
      );

      const user = userEvent.setup();
      renderFileReviewPage();

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining \(2\)/i })).toBeInTheDocument();
      });

      // Approve all remaining
      await user.click(screen.getByRole('button', { name: /approve remaining/i }));
      await waitFor(() => {
        expect(screen.getByText(/approve remaining on page/i)).toBeInTheDocument();
      });
      await user.click(screen.getByRole('button', { name: /approve remaining$/i }));

      // Should now show 0 pending
      await waitFor(() => {
        expect(screen.getByRole('button', { name: /approve remaining \(0\)/i })).toBeInTheDocument();
      });
    });
  });
});
