import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { SignUpPage } from './SignUpPage';
import { BrowserRouter } from 'react-router-dom';

// Mock the API
vi.mock('../services/api', () => ({
  api: {
    trackSignupVisit: vi.fn().mockResolvedValue({ success: true, updated: true }),
  },
}));

import { api } from '../services/api';

// Mock Clerk's useSignUp hook
const mockSignUp = {
  create: vi.fn(),
  prepareEmailAddressVerification: vi.fn(),
  attemptEmailAddressVerification: vi.fn(),
};
const mockSetActive = vi.fn();
let mockIsLoaded = true;

// Mock user for MFA enrollment - use object wrapper so mutations are visible
const mockCreateTOTP = vi.fn();
const mockVerifyTOTP = vi.fn();
const mockState = {
  user: null as { twoFactorEnabled: boolean; createTOTP: typeof mockCreateTOTP; verifyTOTP: typeof mockVerifyTOTP } | null,
};

vi.mock('@clerk/clerk-react', () => ({
  useSignUp: () => ({
    isLoaded: mockIsLoaded,
    signUp: mockSignUp,
    setActive: mockSetActive,
  }),
  useUser: () => ({
    user: mockState.user,
  }),
}));

// Mock react-router-dom hooks
const mockNavigate = vi.fn();
let mockSearchParamsValue = '';

vi.mock('react-router-dom', async () => {
  const actual = await vi.importActual('react-router-dom');
  return {
    ...actual,
    useNavigate: () => mockNavigate,
    useSearchParams: () => [new URLSearchParams(mockSearchParamsValue)],
  };
});

const renderSignUpPage = () => {
  return render(
    <BrowserRouter>
      <SignUpPage />
    </BrowserRouter>
  );
};

describe('SignUpPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockSearchParamsValue = '';
    mockIsLoaded = true;
    mockState.user = null;
    mockSignUp.create.mockReset();
    mockSignUp.prepareEmailAddressVerification.mockReset();
    mockSignUp.attemptEmailAddressVerification.mockReset();
    mockCreateTOTP.mockReset();
    mockVerifyTOTP.mockReset();
    (api.trackSignupVisit as ReturnType<typeof vi.fn>).mockResolvedValue({ success: true, updated: true });
  });

  describe('Initial Render', () => {
    it('should render sign up form with email and password fields', () => {
      renderSignUpPage();

      expect(screen.getByText('Set Up Your Account')).toBeInTheDocument();
      expect(screen.getByText('Create a password to complete your account setup')).toBeInTheDocument();
      expect(screen.getByText('Email address')).toBeInTheDocument();
      expect(screen.getByText('Password')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Continue' })).toBeInTheDocument();
    });

    it('should have email field editable when no email param in URL', () => {
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox') as HTMLInputElement;
      expect(emailInput.readOnly).toBe(false);
      expect(emailInput.value).toBe('');
    });

    it('should show "Already have an account?" link to sign-in', () => {
      renderSignUpPage();

      expect(screen.getByText('Already have an account?')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: 'Sign in' })).toHaveAttribute('href', '/sign-in');
    });
  });

  describe('Email from URL', () => {
    beforeEach(() => {
      mockSearchParamsValue = 'email=test@example.com';
    });

    it('should pre-fill email when provided via URL param', () => {
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox') as HTMLInputElement;
      expect(emailInput.value).toBe('test@example.com');
    });

    it('should make email read-only when provided via URL param', () => {
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox') as HTMLInputElement;
      expect(emailInput.readOnly).toBe(true);
    });

    it('should call trackSignupVisit when email is in URL', async () => {
      renderSignUpPage();

      await waitFor(() => {
        expect(api.trackSignupVisit).toHaveBeenCalledWith('test@example.com');
      });
    });

    it('should not throw error when trackSignupVisit fails', async () => {
      (api.trackSignupVisit as ReturnType<typeof vi.fn>).mockRejectedValue(new Error('Network error'));

      // Should not throw - errors are caught silently
      renderSignUpPage();

      await waitFor(() => {
        expect(api.trackSignupVisit).toHaveBeenCalled();
      });

      // Component should still be rendered
      expect(screen.getByText('Set Up Your Account')).toBeInTheDocument();
    });
  });

  describe('Password Visibility Toggle', () => {
    it('should show password as hidden by default', () => {
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters') as HTMLInputElement;
      expect(passwordInput.type).toBe('password');
    });

    it('should toggle password visibility when toggle button is clicked', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters') as HTMLInputElement;
      // The toggle button is inside the password field's relative container
      const buttons = screen.getAllByRole('button');
      const toggleButton = buttons.find(btn => {
        const parent = btn.closest('.relative');
        return parent && parent.querySelector('input[type="password"], input[type="text"]');
      });

      expect(passwordInput.type).toBe('password');

      await user.click(toggleButton!);
      expect(passwordInput.type).toBe('text');

      await user.click(toggleButton!);
      expect(passwordInput.type).toBe('password');
    });
  });

  describe('Password Requirements', () => {
    it('should not show requirements when password is empty', () => {
      renderSignUpPage();

      expect(screen.queryByText('At least 12 characters')).not.toBeInTheDocument();
      expect(screen.queryByText('One lowercase letter')).not.toBeInTheDocument();
      expect(screen.queryByText('One uppercase letter')).not.toBeInTheDocument();
      expect(screen.queryByText('One number')).not.toBeInTheDocument();
      expect(screen.queryByText('One special character (!@#$%^&*)')).not.toBeInTheDocument();
    });

    it('should show password requirements when password has input', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'a');

      expect(screen.getByText('At least 12 characters')).toBeInTheDocument();
      expect(screen.getByText('One lowercase letter')).toBeInTheDocument();
      expect(screen.getByText('One uppercase letter')).toBeInTheDocument();
      expect(screen.getByText('One number')).toBeInTheDocument();
      expect(screen.getByText('One special character (!@#$%^&*)')).toBeInTheDocument();
    });

    it('should show 12+ chars requirement as met when password is long enough', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, '123456789012');

      const requirement = screen.getByText('At least 12 characters');
      expect(requirement.closest('div')).toHaveClass('text-green-400');
    });

    it('should show lowercase requirement as met when password has lowercase', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'a');

      const requirement = screen.getByText('One lowercase letter');
      expect(requirement.closest('div')).toHaveClass('text-green-400');
    });

    it('should show uppercase requirement as met when password has uppercase', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'A');

      const requirement = screen.getByText('One uppercase letter');
      expect(requirement.closest('div')).toHaveClass('text-green-400');
    });

    it('should show number requirement as met when password has number', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, '1');

      const requirement = screen.getByText('One number');
      expect(requirement.closest('div')).toHaveClass('text-green-400');
    });

    it('should show special char requirement as met when password has special char', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, '!');

      const requirement = screen.getByText('One special character (!@#$%^&*)');
      expect(requirement.closest('div')).toHaveClass('text-green-400');
    });
  });

  describe('Continue Button State', () => {
    it('should disable Continue button when password does not meet requirements', () => {
      renderSignUpPage();

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).toBeDisabled();
    });

    it('should disable Continue button when password is too short', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'aA1!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).toBeDisabled();
    });

    it('should disable Continue button when password is missing lowercase', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'AAAAAAA12345!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).toBeDisabled();
    });

    it('should disable Continue button when password is missing uppercase', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'aaaaaaa12345!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).toBeDisabled();
    });

    it('should disable Continue button when password is missing number', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'aaaaaAAAAAAA!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).toBeDisabled();
    });

    it('should disable Continue button when password is missing special char', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'aaaaaAAAAAAA1');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).toBeDisabled();
    });

    it('should enable Continue button when all password requirements are met', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      expect(continueButton).not.toBeDisabled();
    });
  });

  describe('Password Submission and Verification Step', () => {
    beforeEach(() => {
      mockSignUp.create.mockResolvedValue({});
      mockSignUp.prepareEmailAddressVerification.mockResolvedValue({});
    });

    it('should show verification code form after successful password submission', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText('Check your email for a verification code')).toBeInTheDocument();
      });

      expect(screen.getByPlaceholderText('Enter the code from your email')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Verify Email' })).toBeInTheDocument();
    });

    it('should call signUp.create with email and password', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(mockSignUp.create).toHaveBeenCalledWith({
          emailAddress: 'test@example.com',
          password: 'ValidPass123!',
        });
      });
    });

    it('should call prepareEmailAddressVerification after create', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(mockSignUp.prepareEmailAddressVerification).toHaveBeenCalledWith({ strategy: 'email_code' });
      });
    });

    it('should show error message when sign up fails', async () => {
      mockSignUp.create.mockRejectedValue({
        errors: [{ longMessage: 'Email already in use' }],
      });

      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByText('Email already in use')).toBeInTheDocument();
      });
    });

    it('should show "Creating account..." while loading', async () => {
      // Make the promise never resolve to keep loading state
      mockSignUp.create.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Creating account...' })).toBeInTheDocument();
      });
    });
  });

  describe('Verification Code Step', () => {
    beforeEach(() => {
      mockSignUp.create.mockResolvedValue({});
      mockSignUp.prepareEmailAddressVerification.mockResolvedValue({});
    });

    const navigateToVerificationStep = async (user: ReturnType<typeof userEvent.setup>) => {
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter the code from your email')).toBeInTheDocument();
      });
    };

    it('should have Resend Code button on verification step', async () => {
      const user = userEvent.setup();
      await navigateToVerificationStep(user);

      expect(screen.getByRole('button', { name: 'Resend Code' })).toBeInTheDocument();
    });

    it('should call prepareEmailAddressVerification when Resend Code is clicked', async () => {
      const user = userEvent.setup();
      await navigateToVerificationStep(user);

      mockSignUp.prepareEmailAddressVerification.mockClear();

      const resendButton = screen.getByRole('button', { name: 'Resend Code' });
      await user.click(resendButton);

      await waitFor(() => {
        expect(mockSignUp.prepareEmailAddressVerification).toHaveBeenCalledWith({ strategy: 'email_code' });
      });
    });

    it('should show error when Resend Code fails', async () => {
      const user = userEvent.setup();
      await navigateToVerificationStep(user);

      mockSignUp.prepareEmailAddressVerification.mockRejectedValueOnce({
        errors: [{ longMessage: 'Too many requests' }],
      });

      const resendButton = screen.getByRole('button', { name: 'Resend Code' });
      await user.click(resendButton);

      await waitFor(() => {
        expect(screen.getByText('Too many requests')).toBeInTheDocument();
      });
    });

    it('should have Back button on verification step', async () => {
      const user = userEvent.setup();
      await navigateToVerificationStep(user);

      expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
    });

    it('should return to password form when Back button is clicked', async () => {
      const user = userEvent.setup();
      await navigateToVerificationStep(user);

      const backButton = screen.getByRole('button', { name: 'Back' });
      await user.click(backButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('At least 12 characters')).toBeInTheDocument();
      });

      expect(screen.queryByPlaceholderText('Enter the code from your email')).not.toBeInTheDocument();
    });

    it('should allow entering verification code', async () => {
      const user = userEvent.setup();
      await navigateToVerificationStep(user);

      const codeInput = screen.getByPlaceholderText('Enter the code from your email') as HTMLInputElement;
      await user.type(codeInput, '123456');

      expect(codeInput.value).toBe('123456');
    });
  });

  describe('Successful Verification', () => {
    beforeEach(() => {
      mockSignUp.create.mockResolvedValue({});
      mockSignUp.prepareEmailAddressVerification.mockResolvedValue({});
      mockSignUp.attemptEmailAddressVerification.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'session-123',
      });
      mockSetActive.mockResolvedValue({});
    });

    it('should show MFA setup screen after successful verification', async () => {
      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter the code from your email')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('Enter the code from your email');
      await user.type(codeInput, '123456');

      const verifyButton = screen.getByRole('button', { name: 'Verify Email' });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockSignUp.attemptEmailAddressVerification).toHaveBeenCalledWith({ code: '123456' });
      });

      await waitFor(() => {
        expect(mockSetActive).toHaveBeenCalledWith({ session: 'session-123' });
      });

      // Should show MFA setup loading screen
      await waitFor(() => {
        expect(screen.getByText('Setting Up Two-Factor Authentication')).toBeInTheDocument();
      });
    });

    it('should show error when verification status is not complete', async () => {
      mockSignUp.attemptEmailAddressVerification.mockResolvedValue({
        status: 'pending',
      });

      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter the code from your email')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('Enter the code from your email');
      await user.type(codeInput, '123456');

      const verifyButton = screen.getByRole('button', { name: 'Verify Email' });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Verification incomplete. Please try again.')).toBeInTheDocument();
      });
    });

    it('should show error when verification fails', async () => {
      mockSignUp.attemptEmailAddressVerification.mockRejectedValue({
        errors: [{ longMessage: 'Invalid verification code' }],
      });

      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter the code from your email')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('Enter the code from your email');
      await user.type(codeInput, 'wrong');

      const verifyButton = screen.getByRole('button', { name: 'Verify Email' });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid verification code')).toBeInTheDocument();
      });
    });

    it('should show "Verifying..." while loading', async () => {
      mockSignUp.attemptEmailAddressVerification.mockImplementation(() => new Promise(() => {}));

      const user = userEvent.setup();
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      const continueButton = screen.getByRole('button', { name: 'Continue' });
      await user.click(continueButton);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter the code from your email')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('Enter the code from your email');
      await user.type(codeInput, '123456');

      const verifyButton = screen.getByRole('button', { name: 'Verify Email' });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByRole('button', { name: 'Verifying...' })).toBeInTheDocument();
      });
    });
  });

  // Note: MFA enrollment UI is tested in MfaEnrollPage.test.tsx
  // These tests verify the transition from sign-up to MFA setup
  describe.skip('MFA Enrollment Flow', () => {
    beforeEach(() => {
      mockSignUp.create.mockResolvedValue({});
      mockSignUp.prepareEmailAddressVerification.mockResolvedValue({});
      mockSignUp.attemptEmailAddressVerification.mockResolvedValue({
        status: 'complete',
        createdSessionId: 'session-123',
      });
      mockSetActive.mockResolvedValue({});
      // Set up default user mock for MFA enrollment tests
      mockState.user = {
        twoFactorEnabled: false,
        createTOTP: mockCreateTOTP,
        verifyTOTP: mockVerifyTOTP,
      };
    });

    const navigateToMfaSetup = async (user: ReturnType<typeof userEvent.setup>) => {
      renderSignUpPage();

      const emailInput = screen.getByRole('textbox');
      await user.type(emailInput, 'test@example.com');

      const passwordInput = screen.getByPlaceholderText('At least 12 characters');
      await user.type(passwordInput, 'ValidPass123!');

      await user.click(screen.getByRole('button', { name: 'Continue' }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('Enter the code from your email')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('Enter the code from your email');
      await user.type(codeInput, '123456');

      await user.click(screen.getByRole('button', { name: 'Verify Email' }));

      await waitFor(() => {
        expect(screen.getByText('Setting Up Two-Factor Authentication')).toBeInTheDocument();
      });
    };

    it('should show MFA setup screen after email verification', async () => {
      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      expect(screen.getByText('Setting Up Two-Factor Authentication')).toBeInTheDocument();
      expect(screen.getByText('Please wait...')).toBeInTheDocument();
    });

    it('should show QR code screen after TOTP creation', async () => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET123',
        uri: 'otpauth://totp/test?secret=TESTSECRET123',
        verified: false,
      });

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(screen.getByText('Scan QR Code')).toBeInTheDocument();
      });

      expect(screen.getByText('TESTSECRET123')).toBeInTheDocument();
      expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
    });

    it('should navigate to home if user already has MFA enabled', async () => {
      mockState.user!.twoFactorEnabled = true;

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should show error when TOTP creation fails', async () => {
      mockCreateTOTP.mockRejectedValue({
        errors: [{ longMessage: 'Failed to create TOTP' }],
      });

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(screen.getByText('Failed to create TOTP')).toBeInTheDocument();
      });
    });

    it('should navigate to home when TOTP is already enabled error', async () => {
      mockCreateTOTP.mockRejectedValue({
        errors: [{ longMessage: 'TOTP is already enabled on your account' }],
      });

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should allow entering TOTP verification code', async () => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET123',
        uri: 'otpauth://totp/test?secret=TESTSECRET123',
        verified: false,
      });

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('000000') as HTMLInputElement;
      await user.type(codeInput, '123456');

      expect(codeInput.value).toBe('123456');
    });

    it('should only allow numeric input for TOTP code', async () => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET123',
        uri: 'otpauth://totp/test?secret=TESTSECRET123',
        verified: false,
      });

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('000000') as HTMLInputElement;
      await user.type(codeInput, 'abc123def');

      expect(codeInput.value).toBe('123');
    });

    it('should navigate to home after successful TOTP verification', async () => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET123',
        uri: 'otpauth://totp/test?secret=TESTSECRET123',
        verified: false,
      });
      mockVerifyTOTP.mockResolvedValue({ verified: true });

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '123456');

      const verifyButton = screen.getByRole('button', { name: /verify/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(mockVerifyTOTP).toHaveBeenCalledWith({ code: '123456' });
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('should show error when TOTP verification fails', async () => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET123',
        uri: 'otpauth://totp/test?secret=TESTSECRET123',
        verified: false,
      });
      mockVerifyTOTP.mockRejectedValue({
        errors: [{ longMessage: 'Invalid verification code' }],
      });

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '000000');

      const verifyButton = screen.getByRole('button', { name: /verify/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid verification code')).toBeInTheDocument();
      });
    });

    it('should show error when TOTP verification returns not verified', async () => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET123',
        uri: 'otpauth://totp/test?secret=TESTSECRET123',
        verified: false,
      });
      mockVerifyTOTP.mockResolvedValue({ verified: false });

      const user = userEvent.setup();
      await navigateToMfaSetup(user);

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '123456');

      const verifyButton = screen.getByRole('button', { name: /verify/i });
      await user.click(verifyButton);

      await waitFor(() => {
        expect(screen.getByText('Invalid code. Please try again.')).toBeInTheDocument();
      });
    });
  });
});
