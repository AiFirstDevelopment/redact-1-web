import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { EnrollmentPage } from './EnrollmentPage';
import { useAuthStore } from '../stores/authStore';

const renderEnrollmentPage = () => {
  return render(
    <MemoryRouter initialEntries={['/enroll']}>
      <EnrollmentPage />
    </MemoryRouter>
  );
};

describe('EnrollmentPage', () => {
  beforeEach(() => {
    localStorage.clear();

    useAuthStore.setState({
      user: null,
      agency: null,
      isAuthenticated: false,
      isEnrolled: false,
      isLoading: false,
      error: null,
    });
  });

  it('renders enrollment form', () => {
    renderEnrollmentPage();

    expect(screen.getByText('Redact-1')).toBeInTheDocument();
    expect(screen.getByText('Enter your department code to get started')).toBeInTheDocument();
    expect(screen.getByPlaceholderText(/springfield/i)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /continue/i })).toBeInTheDocument();
  });

  it('disables submit button when department code is empty', () => {
    renderEnrollmentPage();

    const submitButton = screen.getByRole('button', { name: /continue/i });
    expect(submitButton).toBeDisabled();
  });

  it('enables submit button when department code is entered', async () => {
    const user = userEvent.setup();
    renderEnrollmentPage();

    const input = screen.getByPlaceholderText(/springfield/i);
    await user.type(input, 'TEST-PD');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    expect(submitButton).not.toBeDisabled();
  });

  it('converts department code to uppercase', async () => {
    const user = userEvent.setup();
    renderEnrollmentPage();

    const input = screen.getByPlaceholderText(/springfield/i);
    await user.type(input, 'test-pd');

    expect(input).toHaveValue('TEST-PD');
  });

  it('fills demo department code when demo button clicked', async () => {
    const user = userEvent.setup();
    renderEnrollmentPage();

    const demoButton = screen.getByRole('button', { name: /use demo department/i });
    await user.click(demoButton);

    const input = screen.getByPlaceholderText(/springfield/i);
    expect(input).toHaveValue('SPRINGFIELD-PD');
  });

  it('shows error for invalid department code', async () => {
    const user = userEvent.setup();
    renderEnrollmentPage();

    const input = screen.getByPlaceholderText(/springfield/i);
    await user.type(input, 'INVALID-CODE');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.getByText(/not found/i)).toBeInTheDocument();
    });
  });

  it('enrolls successfully with valid department code', async () => {
    const user = userEvent.setup();
    renderEnrollmentPage();

    const input = screen.getByPlaceholderText(/springfield/i);
    await user.type(input, 'SPRINGFIELD-PD');

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    await waitFor(() => {
      // Pre-login enrollment stores in localStorage and state
      const stored = localStorage.getItem('agency');
      expect(stored).toBeTruthy();
      expect(JSON.parse(stored!).code).toBe('SPRINGFIELD-PD');

      const state = useAuthStore.getState();
      expect(state.isEnrolled).toBe(true);
    });
  });

  it('shows loading state during enrollment', async () => {
    const user = userEvent.setup();
    renderEnrollmentPage();

    const demoButton = screen.getByRole('button', { name: /use demo department/i });
    await user.click(demoButton);

    const submitButton = screen.getByRole('button', { name: /continue/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText(/verifying/i)).not.toBeInTheDocument();
    });
  });
});
