import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MfaEnrollPage } from './MfaEnrollPage';

// Mock navigate
const mockNavigate = vi.fn();
vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
}));

// Mock Clerk user
const mockCreateTOTP = vi.fn();
const mockVerifyTOTP = vi.fn();
const mockCreateBackupCode = vi.fn();
let mockUser: {
  twoFactorEnabled: boolean;
  createTOTP: typeof mockCreateTOTP;
  verifyTOTP: typeof mockVerifyTOTP;
  createBackupCode: typeof mockCreateBackupCode;
} | null = null;
let mockIsLoaded = true;

vi.mock('@clerk/clerk-react', () => ({
  useUser: () => ({
    user: mockUser,
    isLoaded: mockIsLoaded,
  }),
}));

describe('MfaEnrollPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockIsLoaded = true;
    mockUser = {
      twoFactorEnabled: false,
      createTOTP: mockCreateTOTP,
      verifyTOTP: mockVerifyTOTP,
      createBackupCode: mockCreateBackupCode,
    };
  });

  describe('Loading State', () => {
    it('should show loading when Clerk is not loaded', () => {
      mockIsLoaded = false;

      render(<MfaEnrollPage />);

      expect(screen.getByText('Loading...')).toBeInTheDocument();
    });

    it('should redirect to sign-in when no user', () => {
      mockUser = null;

      render(<MfaEnrollPage />);

      expect(mockNavigate).toHaveBeenCalledWith('/sign-in');
    });

    it('should redirect to home when user has MFA enabled', () => {
      mockUser = {
        twoFactorEnabled: true,
        createTOTP: mockCreateTOTP,
        verifyTOTP: mockVerifyTOTP,
        createBackupCode: mockCreateBackupCode,
      };

      render(<MfaEnrollPage />);

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });

  describe('Setup Step', () => {
    it('should show setup screen initially', () => {
      render(<MfaEnrollPage />);

      expect(screen.getByText('Set Up Two-Factor Authentication')).toBeInTheDocument();
      expect(screen.getByText(/CJIS compliance requires/)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /set up authenticator/i })).toBeInTheDocument();
    });

    it('should call createTOTP when Set Up Authenticator is clicked', async () => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET',
        uri: 'otpauth://totp/test',
        verified: false,
      });

      const user = userEvent.setup();
      render(<MfaEnrollPage />);

      await user.click(screen.getByRole('button', { name: /set up authenticator/i }));

      await waitFor(() => {
        expect(mockCreateTOTP).toHaveBeenCalled();
      });
    });

    it('should show error when createTOTP fails', async () => {
      mockCreateTOTP.mockRejectedValue({
        errors: [{ longMessage: 'Failed to create authenticator' }],
      });

      const user = userEvent.setup();
      render(<MfaEnrollPage />);

      await user.click(screen.getByRole('button', { name: /set up authenticator/i }));

      await waitFor(() => {
        expect(screen.getByText('Failed to create authenticator')).toBeInTheDocument();
      });
    });

    it('should redirect to home if TOTP already enabled error', async () => {
      mockCreateTOTP.mockRejectedValue({
        errors: [{ longMessage: 'TOTP already enabled' }],
      });

      const user = userEvent.setup();
      render(<MfaEnrollPage />);

      await user.click(screen.getByRole('button', { name: /set up authenticator/i }));

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });
  });

  describe('Verify Step', () => {
    beforeEach(() => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET123',
        uri: 'otpauth://totp/test?secret=TESTSECRET123',
        verified: false,
      });
    });

    const navigateToVerifyStep = async (user: ReturnType<typeof userEvent.setup>) => {
      render(<MfaEnrollPage />);
      await user.click(screen.getByRole('button', { name: /set up authenticator/i }));

      await waitFor(() => {
        expect(screen.getByText('Scan QR Code')).toBeInTheDocument();
      });
    };

    it('should show QR code after createTOTP succeeds', async () => {
      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      expect(screen.getByAltText('QR Code for authenticator app')).toBeInTheDocument();
      expect(screen.getByText('TESTSECRET123')).toBeInTheDocument();
    });

    it('should show manual entry code', async () => {
      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      expect(screen.getByText('Or enter this code manually:')).toBeInTheDocument();
      expect(screen.getByText('TESTSECRET123')).toBeInTheDocument();
    });

    it('should allow entering verification code', async () => {
      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      const codeInput = screen.getByPlaceholderText('000000') as HTMLInputElement;
      await user.type(codeInput, '123456');

      expect(codeInput.value).toBe('123456');
    });

    it('should only allow numeric input', async () => {
      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      const codeInput = screen.getByPlaceholderText('000000') as HTMLInputElement;
      await user.type(codeInput, 'abc123xyz');

      expect(codeInput.value).toBe('123');
    });

    it('should limit code to 6 digits', async () => {
      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      const codeInput = screen.getByPlaceholderText('000000') as HTMLInputElement;
      await user.type(codeInput, '12345678');

      expect(codeInput.value).toBe('123456');
    });

    it('should disable verify button when code is not 6 digits', async () => {
      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '123');

      const verifyButton = screen.getByRole('button', { name: /verify/i });
      expect(verifyButton).toBeDisabled();
    });

    it('should enable verify button when code is 6 digits', async () => {
      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '123456');

      const verifyButton = screen.getByRole('button', { name: /verify/i });
      expect(verifyButton).not.toBeDisabled();
    });

    it('should call verifyTOTP when verify is clicked', async () => {
      mockVerifyTOTP.mockResolvedValue({ verified: true });
      mockCreateBackupCode.mockResolvedValue({ codes: ['code1', 'code2'] });

      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '123456');

      await user.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(mockVerifyTOTP).toHaveBeenCalledWith({ code: '123456' });
      });
    });

    it('should show error when verification fails', async () => {
      mockVerifyTOTP.mockRejectedValue({
        errors: [{ longMessage: 'Invalid code' }],
      });

      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '000000');

      await user.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid code')).toBeInTheDocument();
      });
    });

    it('should show error when verification returns not verified', async () => {
      mockVerifyTOTP.mockResolvedValue({ verified: false });

      const user = userEvent.setup();
      await navigateToVerifyStep(user);

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '123456');

      await user.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(screen.getByText('Invalid code. Please try again.')).toBeInTheDocument();
      });
    });
  });

  describe('Backup Codes Step', () => {
    beforeEach(() => {
      mockCreateTOTP.mockResolvedValue({
        id: 'totp-123',
        secret: 'TESTSECRET123',
        uri: 'otpauth://totp/test?secret=TESTSECRET123',
        verified: false,
      });
      mockVerifyTOTP.mockResolvedValue({ verified: true });
      mockCreateBackupCode.mockResolvedValue({
        codes: ['backup1', 'backup2', 'backup3', 'backup4'],
      });
    });

    const navigateToBackupStep = async (user: ReturnType<typeof userEvent.setup>) => {
      render(<MfaEnrollPage />);
      await user.click(screen.getByRole('button', { name: /set up authenticator/i }));

      await waitFor(() => {
        expect(screen.getByPlaceholderText('000000')).toBeInTheDocument();
      });

      const codeInput = screen.getByPlaceholderText('000000');
      await user.type(codeInput, '123456');
      await user.click(screen.getByRole('button', { name: /verify/i }));

      await waitFor(() => {
        expect(screen.getByText('Save Your Backup Codes')).toBeInTheDocument();
      });
    };

    it('should show backup codes after successful verification', async () => {
      const user = userEvent.setup();
      await navigateToBackupStep(user);

      expect(screen.getByText('Save Your Backup Codes')).toBeInTheDocument();
      expect(screen.getByText('backup1')).toBeInTheDocument();
      expect(screen.getByText('backup2')).toBeInTheDocument();
      expect(screen.getByText('backup3')).toBeInTheDocument();
      expect(screen.getByText('backup4')).toBeInTheDocument();
    });

    it('should have copy to clipboard button', async () => {
      const user = userEvent.setup();
      await navigateToBackupStep(user);

      expect(screen.getByRole('button', { name: /copy to clipboard/i })).toBeInTheDocument();
    });

    it('should navigate to home when continue is clicked', async () => {
      const user = userEvent.setup();
      await navigateToBackupStep(user);

      await user.click(screen.getByRole('button', { name: /i've saved my codes/i }));

      expect(mockNavigate).toHaveBeenCalledWith('/');
    });
  });
});
