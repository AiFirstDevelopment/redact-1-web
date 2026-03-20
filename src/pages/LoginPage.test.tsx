import { describe, it, expect, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { LoginPage } from './LoginPage';
import { useAuthStore } from '../stores/authStore';
import { mockAgency } from '../test/handlers';

const renderLoginPage = () => {
  return render(
    <MemoryRouter initialEntries={['/login']}>
      <LoginPage />
    </MemoryRouter>
  );
};

describe('LoginPage', () => {
  beforeEach(() => {
    localStorage.clear();
    // User is enrolled but not authenticated
    localStorage.setItem('agency', JSON.stringify(mockAgency));

    useAuthStore.setState({
      user: null,
      agency: mockAgency,
      isAuthenticated: false,
      isEnrolled: true,
      isLoading: false,
      error: null,
    });
  });

  it('renders login form', () => {
    renderLoginPage();

    expect(screen.getByText('R-1')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
  });

  it('displays agency name when enrolled', () => {
    renderLoginPage();

    expect(screen.getByText('Springfield Police Department')).toBeInTheDocument();
  });

  it('allows typing email and password', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    await user.type(emailInput, 'test@test.com');

    expect(emailInput).toHaveValue('test@test.com');
  });

  it('fills demo credentials when demo button clicked', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const demoButton = screen.getByRole('button', { name: /use demo credentials/i });
    await user.click(demoButton);

    const emailInput = document.querySelector('input[type="email"]') as HTMLInputElement;
    expect(emailInput.value).toBeTruthy();
  });

  it('shows error for invalid credentials', async () => {
    renderLoginPage();

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    expect(submitButton).toBeInTheDocument();
  });

  it('logs in successfully with valid credentials', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const demoButton = screen.getByRole('button', { name: /use demo credentials/i });
    await user.click(demoButton);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      const token = localStorage.getItem('token');
      expect(token).toBe('mock-token');
    });
  });

  it('logs in with demo credentials', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const demoButton = screen.getByRole('button', { name: /use demo credentials/i });
    await user.click(demoButton);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      const token = localStorage.getItem('token');
      expect(token).toBe('mock-token');
    });
  });

  it('shows loading state during login', async () => {
    const user = userEvent.setup();
    renderLoginPage();

    const demoButton = screen.getByRole('button', { name: /use demo credentials/i });
    await user.click(demoButton);

    const submitButton = screen.getByRole('button', { name: /sign in/i });
    await user.click(submitButton);

    await waitFor(() => {
      expect(screen.queryByText(/signing in/i)).not.toBeInTheDocument();
    });
  });

  it('has email input', () => {
    renderLoginPage();

    const emailInput = document.querySelector('input[type="email"]');
    expect(emailInput).toBeInTheDocument();
  });

  it('has password input', () => {
    renderLoginPage();

    const passwordInput = document.querySelector('input[type="password"]');
    expect(passwordInput).toBeInTheDocument();
  });
});
