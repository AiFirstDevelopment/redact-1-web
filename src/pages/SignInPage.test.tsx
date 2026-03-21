import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { SignInPage } from './SignInPage';

// Mock useNavigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock Clerk signIn
const mockCreate = vi.fn();
const mockAttemptFirstFactor = vi.fn();
const mockSetActive = vi.fn();

vi.mock('@clerk/clerk-react', () => ({
  useSignIn: () => ({
    isLoaded: true,
    signIn: {
      create: mockCreate,
      attemptFirstFactor: mockAttemptFirstFactor,
    },
    setActive: mockSetActive,
  }),
}));

// Helper to get inputs by their type since labels aren't properly associated
const getEmailInput = () => screen.getByRole('textbox') as HTMLInputElement;
const getPasswordInput = () => document.querySelector('input[type="password"]') as HTMLInputElement;

describe('SignInPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Sign In Form', () => {
    it('renders sign in form with email and password fields', () => {
      render(<SignInPage />);

      expect(screen.getByText('Sign in to Redact-1')).toBeInTheDocument();
      expect(screen.getByText('Welcome back! Please sign in to continue')).toBeInTheDocument();
      expect(screen.getByText('Email address')).toBeInTheDocument();
      expect(screen.getByText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByText(/forgot password\?/i)).toBeInTheDocument();
    });

    it('allows entering email and password', () => {
      render(<SignInPage />);

      const emailInput = getEmailInput();
      const passwordInput = getPasswordInput();

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'secretpassword' } });

      expect(emailInput.value).toBe('test@example.com');
      expect(passwordInput.value).toBe('secretpassword');
    });

    it('password visibility toggle works', () => {
      render(<SignInPage />);

      const passwordInput = getPasswordInput();
      expect(passwordInput.type).toBe('password');

      // Find the toggle button (it's a button inside the password field container)
      const toggleButton = passwordInput.parentElement?.querySelector('button');
      expect(toggleButton).toBeInTheDocument();

      fireEvent.click(toggleButton!);
      expect(passwordInput.type).toBe('text');

      fireEvent.click(toggleButton!);
      expect(passwordInput.type).toBe('password');
    });

    it('shows error message on failed sign in', async () => {
      mockCreate.mockRejectedValue({
        errors: [{ longMessage: 'Invalid credentials' }],
      });

      render(<SignInPage />);

      const emailInput = getEmailInput();
      const passwordInput = getPasswordInput();
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid credentials')).toBeInTheDocument();
      });
    });

    it('shows generic error message when no specific error provided', async () => {
      mockCreate.mockRejectedValue({
        message: 'Sign in failed',
      });

      render(<SignInPage />);

      const emailInput = getEmailInput();
      const passwordInput = getPasswordInput();
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'wrongpassword' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Sign in failed')).toBeInTheDocument();
      });
    });

    it('shows incomplete sign in error when status is not complete', async () => {
      mockCreate.mockResolvedValue({
        status: 'needs_second_factor',
        createdSessionId: null,
      });

      render(<SignInPage />);

      const emailInput = getEmailInput();
      const passwordInput = getPasswordInput();
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Sign in incomplete. Please try again.')).toBeInTheDocument();
      });
    });

    it('successful sign in navigates to home', async () => {
      mockCreate.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'session_123',
      });
      mockSetActive.mockResolvedValue(undefined);

      render(<SignInPage />);

      const emailInput = getEmailInput();
      const passwordInput = getPasswordInput();
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'correctpassword' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(mockSetActive).toHaveBeenCalledWith({ session: 'session_123' });
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('shows loading state during sign in', async () => {
      let resolveSignIn: (value: unknown) => void;
      mockCreate.mockImplementation(() => new Promise((resolve) => {
        resolveSignIn = resolve;
      }));

      render(<SignInPage />);

      const emailInput = getEmailInput();
      const passwordInput = getPasswordInput();
      const signInButton = screen.getByRole('button', { name: /sign in/i });

      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.change(passwordInput, { target: { value: 'password123' } });
      fireEvent.click(signInButton);

      await waitFor(() => {
        expect(screen.getByText('Signing in...')).toBeInTheDocument();
      });

      // Resolve to complete the test
      resolveSignIn!({ status: 'complete', createdSessionId: 'session_123' });
    });
  });

  describe('Forgot Password Flow', () => {
    it('clicking "Forgot password?" shows reset email form', () => {
      render(<SignInPage />);

      const forgotPasswordLink = screen.getByText(/forgot password\?/i);
      fireEvent.click(forgotPasswordLink);

      expect(screen.getByText('Reset Password')).toBeInTheDocument();
      expect(screen.getByText('Enter your email to receive a reset code')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /send reset code/i })).toBeInTheDocument();
      expect(screen.getByText(/back to sign in/i)).toBeInTheDocument();
    });

    it('back button returns to sign in form from reset email form', () => {
      render(<SignInPage />);

      // Go to forgot password
      fireEvent.click(screen.getByText(/forgot password\?/i));
      expect(screen.getByText('Enter your email to receive a reset code')).toBeInTheDocument();

      // Go back
      fireEvent.click(screen.getByText(/back to sign in/i));
      expect(screen.getByText('Sign in to Redact-1')).toBeInTheDocument();
    });

    it('shows reset code form after sending reset email', async () => {
      mockCreate.mockResolvedValue({});

      render(<SignInPage />);

      // Go to forgot password
      fireEvent.click(screen.getByText(/forgot password\?/i));

      // Enter email and submit
      const emailInput = getEmailInput();
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

      await waitFor(() => {
        expect(screen.getByText('Enter the code from your email and your new password')).toBeInTheDocument();
        expect(screen.getByText('Reset code')).toBeInTheDocument();
        expect(screen.getByText('New password')).toBeInTheDocument();
      });
    });

    it('shows error when sending reset email fails', async () => {
      mockCreate.mockRejectedValue({
        errors: [{ longMessage: 'Email not found' }],
      });

      render(<SignInPage />);

      // Go to forgot password
      fireEvent.click(screen.getByText(/forgot password\?/i));

      // Enter email and submit
      const emailInput = getEmailInput();
      fireEvent.change(emailInput, { target: { value: 'nonexistent@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

      await waitFor(() => {
        expect(screen.getByText('Email not found')).toBeInTheDocument();
      });
    });

    it('shows loading state when sending reset email', async () => {
      let resolveReset: (value: unknown) => void;
      mockCreate.mockImplementation(() => new Promise((resolve) => {
        resolveReset = resolve;
      }));

      render(<SignInPage />);

      fireEvent.click(screen.getByText(/forgot password\?/i));

      const emailInput = getEmailInput();
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

      await waitFor(() => {
        expect(screen.getByText('Sending...')).toBeInTheDocument();
      });

      resolveReset!({});
    });
  });

  describe('Reset Password Form', () => {
    beforeEach(async () => {
      mockCreate.mockResolvedValue({});
    });

    const navigateToResetForm = async () => {
      render(<SignInPage />);

      // Go to forgot password
      fireEvent.click(screen.getByText(/forgot password\?/i));

      // Enter email and submit
      const emailInput = getEmailInput();
      fireEvent.change(emailInput, { target: { value: 'test@example.com' } });
      fireEvent.click(screen.getByRole('button', { name: /send reset code/i }));

      await waitFor(() => {
        expect(screen.getByText('Reset code')).toBeInTheDocument();
      });
    };

    // Helper to get inputs in reset form
    const getResetCodeInput = () => screen.getByPlaceholderText('Enter code from email') as HTMLInputElement;
    const getNewPasswordInput = () => screen.getByPlaceholderText('At least 12 characters') as HTMLInputElement;

    it('password requirements displayed for new password', async () => {
      await navigateToResetForm();

      const newPasswordInput = getNewPasswordInput();
      fireEvent.change(newPasswordInput, { target: { value: 'a' } });

      expect(screen.getByText('At least 12 characters')).toBeInTheDocument();
      expect(screen.getByText('One lowercase letter')).toBeInTheDocument();
      expect(screen.getByText('One uppercase letter')).toBeInTheDocument();
      expect(screen.getByText('One number')).toBeInTheDocument();
      expect(screen.getByText('One special character (!@#$%^&*)')).toBeInTheDocument();
    });

    it('password requirements are validated correctly', async () => {
      await navigateToResetForm();

      const newPasswordInput = getNewPasswordInput();

      // Start with a weak password
      fireEvent.change(newPasswordInput, { target: { value: 'a' } });

      // The reset button should be disabled with weak password
      const resetButton = screen.getByRole('button', { name: /reset password/i });
      expect(resetButton).toBeDisabled();

      // Add a strong password
      fireEvent.change(newPasswordInput, { target: { value: 'StrongPass123!' } });

      // Button should now be enabled
      await waitFor(() => {
        expect(resetButton).not.toBeDisabled();
      });
    });

    it('password requirements show correct status for each requirement', async () => {
      await navigateToResetForm();

      const newPasswordInput = getNewPasswordInput();

      // Test each requirement
      fireEvent.change(newPasswordInput, { target: { value: 'short' } });

      // Find requirement elements and check their classes/states
      const requirements = screen.getAllByText(/at least 12 characters|one lowercase|one uppercase|one number|one special/i);
      expect(requirements.length).toBe(5);

      // With "short" - has lowercase, nothing else
      // The text is directly inside the div with the class, so we get the closest div
      const lowercaseReq = screen.getByText('One lowercase letter').closest('div');
      expect(lowercaseReq).toHaveClass('text-green-400');

      const lengthReq = screen.getByText('At least 12 characters').closest('div');
      expect(lengthReq).toHaveClass('text-white/60');

      // Now test with a password that meets more requirements
      fireEvent.change(newPasswordInput, { target: { value: 'Short1234567!' } });

      await waitFor(() => {
        expect(screen.getByText('At least 12 characters').closest('div')).toHaveClass('text-green-400');
        expect(screen.getByText('One lowercase letter').closest('div')).toHaveClass('text-green-400');
        expect(screen.getByText('One uppercase letter').closest('div')).toHaveClass('text-green-400');
        expect(screen.getByText('One number').closest('div')).toHaveClass('text-green-400');
        expect(screen.getByText('One special character (!@#$%^&*)').closest('div')).toHaveClass('text-green-400');
      });
    });

    it('new password visibility toggle works', async () => {
      await navigateToResetForm();

      const newPasswordInput = getNewPasswordInput();
      expect(newPasswordInput.type).toBe('password');

      // Find the toggle button
      const toggleButton = newPasswordInput.parentElement?.querySelector('button');
      expect(toggleButton).toBeInTheDocument();

      fireEvent.click(toggleButton!);
      expect(newPasswordInput.type).toBe('text');

      fireEvent.click(toggleButton!);
      expect(newPasswordInput.type).toBe('password');
    });

    it('back button returns to sign in form from reset form', async () => {
      await navigateToResetForm();

      fireEvent.click(screen.getByText(/back to sign in/i));

      expect(screen.getByText('Sign in to Redact-1')).toBeInTheDocument();
      expect(screen.queryByText('Reset code')).not.toBeInTheDocument();
    });

    it('successful password reset navigates to home', async () => {
      mockAttemptFirstFactor.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'session_456',
      });
      mockSetActive.mockResolvedValue(undefined);

      await navigateToResetForm();

      const codeInput = getResetCodeInput();
      const newPasswordInput = getNewPasswordInput();

      fireEvent.change(codeInput, { target: { value: '123456' } });
      fireEvent.change(newPasswordInput, { target: { value: 'NewPassword123!' } });

      fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(mockAttemptFirstFactor).toHaveBeenCalledWith({
          strategy: 'reset_password_email_code',
          code: '123456',
          password: 'NewPassword123!',
        });
        expect(mockSetActive).toHaveBeenCalledWith({ session: 'session_456' });
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('shows error on failed password reset', async () => {
      mockAttemptFirstFactor.mockRejectedValue({
        errors: [{ longMessage: 'Invalid reset code' }],
      });

      await navigateToResetForm();

      const codeInput = getResetCodeInput();
      const newPasswordInput = getNewPasswordInput();

      fireEvent.change(codeInput, { target: { value: 'wrong' } });
      fireEvent.change(newPasswordInput, { target: { value: 'NewPassword123!' } });

      fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid reset code')).toBeInTheDocument();
      });
    });

    it('shows incomplete reset error when status is not complete', async () => {
      mockAttemptFirstFactor.mockResolvedValue({
        status: 'needs_identifier',
        createdSessionId: null,
      });

      await navigateToResetForm();

      const codeInput = getResetCodeInput();
      const newPasswordInput = getNewPasswordInput();

      fireEvent.change(codeInput, { target: { value: '123456' } });
      fireEvent.change(newPasswordInput, { target: { value: 'NewPassword123!' } });

      fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByText('Password reset incomplete. Please try again.')).toBeInTheDocument();
      });
    });

    it('shows loading state during password reset', async () => {
      let resolveReset: (value: unknown) => void;
      mockAttemptFirstFactor.mockImplementation(() => new Promise((resolve) => {
        resolveReset = resolve;
      }));

      await navigateToResetForm();

      const codeInput = getResetCodeInput();
      const newPasswordInput = getNewPasswordInput();

      fireEvent.change(codeInput, { target: { value: '123456' } });
      fireEvent.change(newPasswordInput, { target: { value: 'NewPassword123!' } });

      fireEvent.click(screen.getByRole('button', { name: /reset password/i }));

      await waitFor(() => {
        expect(screen.getByText('Resetting...')).toBeInTheDocument();
      });

      resolveReset!({ status: 'complete', createdSessionId: 'session_789' });
    });

    it('clears state when returning to sign in from reset form', async () => {
      await navigateToResetForm();

      // Enter some data
      const codeInput = getResetCodeInput();
      const newPasswordInput = getNewPasswordInput();
      fireEvent.change(codeInput, { target: { value: '123456' } });
      fireEvent.change(newPasswordInput, { target: { value: 'Password123!' } });

      // Go back
      fireEvent.click(screen.getByText(/back to sign in/i));

      // Verify we're on sign in page
      expect(screen.getByText('Sign in to Redact-1')).toBeInTheDocument();

      // Go to forgot password again
      fireEvent.click(screen.getByText(/forgot password\?/i));

      // Should be on email form, not reset code form
      expect(screen.getByText('Enter your email to receive a reset code')).toBeInTheDocument();
      expect(screen.queryByText('Reset code')).not.toBeInTheDocument();
    });
  });

  describe('Loading State', () => {
    it('shows loading state when Clerk is not loaded', () => {
      // This test is handled in the separate describe block below
      // due to module mocking limitations
    });
  });
});

describe('SignInPage - Clerk Not Loaded', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('shows loading state when Clerk is not loaded', async () => {
    // Reset all mocks
    vi.resetModules();

    // Mock with isLoaded = false
    vi.doMock('@clerk/clerk-react', () => ({
      useSignIn: () => ({
        isLoaded: false,
        signIn: null,
        setActive: null,
      }),
    }));

    vi.doMock('react-router-dom', () => ({
      useNavigate: () => vi.fn(),
    }));

    // Dynamically import the component
    const { SignInPage: UnloadedSignInPage } = await import('./SignInPage');

    render(<UnloadedSignInPage />);

    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });
});
