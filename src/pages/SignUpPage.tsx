import { useState, useEffect } from 'react';
import { useSignUp, useUser } from '@clerk/clerk-react';
import { useNavigate, Link, useSearchParams } from 'react-router-dom';
import { api } from '../services/api';

type TOTPResource = {
  id: string;
  secret?: string;
  uri?: string;
  verified: boolean;
};

function PasswordRequirement({ met, text }: { met: boolean; text: string }) {
  return (
    <div className={`flex items-center gap-2 text-sm ${met ? 'text-green-400' : 'text-white/60'}`}>
      {met ? (
        <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg className="w-4 h-4" fill="none" viewBox="0 0 20 20" stroke="currentColor">
          <circle cx="10" cy="10" r="7" strokeWidth="2" />
        </svg>
      )}
      {text}
    </div>
  );
}

export function SignUpPage() {
  const { isLoaded, signUp, setActive } = useSignUp();
  const { user } = useUser();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();

  const emailFromUrl = searchParams.get('email') || '';
  const [email, setEmail] = useState(emailFromUrl);
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  // MFA enrollment state
  const [mfaStep, setMfaStep] = useState<'none' | 'setup' | 'verify'>('none');
  const [totp, setTotp] = useState<TOTPResource | null>(null);
  const [mfaCode, setMfaCode] = useState('');

  // Track when user visits sign-up page
  useEffect(() => {
    if (emailFromUrl) {
      api.trackSignupVisit(emailFromUrl).catch(() => {
        // Ignore errors - this is just tracking
      });
    }
  }, [emailFromUrl]);

  // Auto-create TOTP when entering MFA setup
  useEffect(() => {
    if (mfaStep === 'setup' && user && !totp) {
      // Check if already enabled
      if (user.twoFactorEnabled) {
        navigate('/');
        return;
      }
      // Create TOTP automatically
      setLoading(true);
      user.createTOTP()
        .then((totpResource) => {
          setTotp(totpResource as unknown as TOTPResource);
          setMfaStep('verify');
        })
        .catch((err: any) => {
          const message = err.errors?.[0]?.longMessage || err.message || '';
          if (message.toLowerCase().includes('already')) {
            navigate('/');
          } else {
            setError(message || 'Failed to create authenticator');
          }
        })
        .finally(() => setLoading(false));
    }
  }, [mfaStep, user, totp, navigate]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setError('');

    try {
      await signUp.create({
        emailAddress: email,
        password,
      });

      // Send email verification code
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Sign up failed');
    } finally {
      setLoading(false);
    }
  };

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!isLoaded) return;

    setLoading(true);
    setError('');

    try {
      const result = await signUp.attemptEmailAddressVerification({
        code: verificationCode,
      });

      if (result.status === 'complete') {
        await setActive({ session: result.createdSessionId });
        // Move to MFA enrollment
        setMfaStep('setup');
      } else {
        setError('Verification incomplete. Please try again.');
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateTOTP = async () => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      // Check if already enabled
      if (user.twoFactorEnabled) {
        navigate('/');
        return;
      }
      const totpResource = await user.createTOTP();
      setTotp(totpResource as unknown as TOTPResource);
      setMfaStep('verify');
    } catch (err: any) {
      const message = err.errors?.[0]?.longMessage || err.message || '';
      // If TOTP already enabled, just proceed to app
      if (message.toLowerCase().includes('already enabled') || message.toLowerCase().includes('already exists')) {
        navigate('/');
        return;
      }
      setError(message || 'Failed to create authenticator');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyTOTP = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const result = await user.verifyTOTP({ code: mfaCode });
      if (result.verified) {
        // Go directly to app after MFA setup - no backup codes screen
        navigate('/');
      } else {
        setError('Invalid code. Please try again.');
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: "url('/office-1.png')" }}>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // MFA Setup - loading while creating TOTP
  if (mfaStep === 'setup') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: "url('/office-1.png')" }}>
        <div className="bg-pastel-mint p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold text-center text-white mb-2">
            Setting Up Two-Factor Authentication
          </h1>
          <p className="text-white/80 text-center mb-6">
            Please wait...
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
              <button
                onClick={handleCreateTOTP}
                className="w-full mt-4 py-2 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-md transition-colors"
              >
                Try Again
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // MFA Setup - scan QR code and verify
  if (mfaStep === 'verify' && totp) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: "url('/office-1.png')" }}>
        <div className="bg-pastel-mint p-8 rounded-lg shadow-md w-full max-w-md">
          <h1 className="text-2xl font-bold text-center text-white mb-2">
            Scan QR Code
          </h1>
          <p className="text-white/80 text-center mb-4">
            Scan this QR code with your authenticator app
          </p>

          {error && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
              {error}
            </div>
          )}

          {totp.uri && (
            <div className="bg-white p-4 rounded-lg mb-4 flex justify-center">
              <img
                src={`https://api.qrserver.com/v1/create-qr-code/?size=200x200&data=${encodeURIComponent(totp.uri)}`}
                alt="QR Code for authenticator app"
                className="w-48 h-48"
              />
            </div>
          )}

          {totp.secret && (
            <div className="mb-4">
              <p className="text-white/60 text-sm text-center mb-1">Or enter this code manually:</p>
              <p className="bg-white/10 text-white font-mono text-center py-2 px-4 rounded select-all text-sm">
                {totp.secret}
              </p>
            </div>
          )}

          <form onSubmit={handleVerifyTOTP} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Enter the 6-digit code from your app
              </label>
              <input
                type="text"
                value={mfaCode}
                onChange={(e) => setMfaCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="000000"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-center text-2xl tracking-widest"
                required
                maxLength={6}
                autoFocus
              />
            </div>
            <button
              type="submit"
              disabled={loading || mfaCode.length !== 6}
              className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify & Continue'}
            </button>
          </form>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: "url('/office-1.png')" }}>
      <div className="bg-pastel-mint p-8 rounded-lg shadow-md w-full max-w-md">
        <h1 className="text-2xl font-bold text-center text-white mb-2">
          Set Up Your Account
        </h1>
        <p className="text-white/80 text-center mb-6">
          {pendingVerification
            ? 'Check your email for a verification code'
            : 'Create a password to complete your account setup'}
        </p>

        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
            {error}
          </div>
        )}

        {!pendingVerification ? (
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Email address
              </label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                required
                readOnly={!!emailFromUrl}
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Password
              </label>
              <div className="relative">
                <input
                  type={showPassword ? 'text' : 'password'}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="w-full px-3 py-2 pr-10 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500"
                  placeholder="At least 12 characters"
                  required
                  minLength={12}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-500 hover:text-gray-700"
                >
                  {showPassword ? (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M3.98 8.223A10.477 10.477 0 001.934 12C3.226 16.338 7.244 19.5 12 19.5c.993 0 1.953-.138 2.863-.395M6.228 6.228A10.45 10.45 0 0112 4.5c4.756 0 8.773 3.162 10.065 7.498a10.523 10.523 0 01-4.293 5.774M6.228 6.228L3 3m3.228 3.228l3.65 3.65m7.894 7.894L21 21m-3.228-3.228l-3.65-3.65m0 0a3 3 0 10-4.243-4.243m4.242 4.242L9.88 9.88" />
                    </svg>
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" strokeWidth={1.5} stroke="currentColor" className="w-5 h-5">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M2.036 12.322a1.012 1.012 0 010-.639C3.423 7.51 7.36 4.5 12 4.5c4.638 0 8.573 3.007 9.963 7.178.07.207.07.431 0 .639C20.577 16.49 16.64 19.5 12 19.5c-4.638 0-8.573-3.007-9.963-7.178z" />
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                    </svg>
                  )}
                </button>
              </div>
              {password && (
                <div className="mt-2 space-y-1">
                  <PasswordRequirement met={password.length >= 12} text="At least 12 characters" />
                  <PasswordRequirement met={/[a-z]/.test(password)} text="One lowercase letter" />
                  <PasswordRequirement met={/[A-Z]/.test(password)} text="One uppercase letter" />
                  <PasswordRequirement met={/[0-9]/.test(password)} text="One number" />
                  <PasswordRequirement met={/[!@#$%^&*(),.?":{}|<>]/.test(password)} text="One special character (!@#$%^&*)" />
                </div>
              )}
            </div>
            <button
              type="submit"
              disabled={loading || password.length < 12 || !/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[!@#$%^&*(),.?":{}|<>]/.test(password)}
              className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
            >
              {loading ? 'Creating account...' : 'Continue'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleVerify} className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-white mb-1">
                Verification code
              </label>
              <input
                type="text"
                value={verificationCode}
                onChange={(e) => setVerificationCode(e.target.value)}
                placeholder="Enter the code from your email"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-center text-2xl tracking-widest"
                required
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
            >
              {loading ? 'Verifying...' : 'Verify Email'}
            </button>
            <div className="flex gap-4">
              <button
                type="button"
                onClick={() => setPendingVerification(false)}
                className="flex-1 py-2 px-4 text-white/70 hover:text-white"
              >
                Back
              </button>
              <button
                type="button"
                onClick={async () => {
                  try {
                    await signUp?.prepareEmailAddressVerification({ strategy: 'email_code' });
                    setError('');
                  } catch (err: any) {
                    setError(err.errors?.[0]?.longMessage || 'Failed to resend code');
                  }
                }}
                className="flex-1 py-2 px-4 text-white underline hover:text-white/80"
              >
                Resend Code
              </button>
            </div>
          </form>
        )}

        <p className="mt-6 text-center text-gray-600">
          Already have an account?{' '}
          <Link to="/sign-in" className="text-white underline hover:text-white/80 font-medium">
            Sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
