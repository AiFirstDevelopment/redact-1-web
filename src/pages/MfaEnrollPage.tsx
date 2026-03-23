import { useState, useEffect } from 'react';
import { useUser } from '@clerk/clerk-react';
import { useNavigate } from 'react-router-dom';

type TOTPResource = {
  id: string;
  secret?: string;
  uri?: string;
  verified: boolean;
  backupCodes?: string[];
};

export function MfaEnrollPage() {
  const { user, isLoaded } = useUser();
  const navigate = useNavigate();

  const [totp, setTotp] = useState<TOTPResource | null>(null);
  const [verificationCode, setVerificationCode] = useState('');
  const [backupCodes, setBackupCodes] = useState<string[]>([]);
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [step, setStep] = useState<'setup' | 'verify' | 'backup' | 'complete'>('setup');

  useEffect(() => {
    if (isLoaded && user) {
      // Check if user already has MFA enabled
      const hasTOTP = user.twoFactorEnabled;
      if (hasTOTP) {
        navigate('/');
      }
    }
  }, [isLoaded, user, navigate]);

  const handleCreateTOTP = async () => {
    if (!user) return;

    setLoading(true);
    setError('');

    try {
      const totpResource = await user.createTOTP();
      setTotp(totpResource as unknown as TOTPResource);
      setStep('verify');
    } catch (err: any) {
      const message = err.errors?.[0]?.longMessage || err.message || '';
      // If TOTP already enabled, just proceed to app
      if (message.toLowerCase().includes('already')) {
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
      const result = await user.verifyTOTP({ code: verificationCode });
      if (result.verified) {
        // Get backup codes
        const codes = await user.createBackupCode();
        setBackupCodes(codes.codes || []);
        setStep('backup');
      } else {
        setError('Invalid code. Please try again.');
      }
    } catch (err: any) {
      setError(err.errors?.[0]?.longMessage || err.message || 'Verification failed');
    } finally {
      setLoading(false);
    }
  };

  const handleComplete = () => {
    navigate('/');
  };

  if (!isLoaded) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: "url('/office-1.png')" }}>
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!user) {
    navigate('/sign-in');
    return null;
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-cover bg-center" style={{ backgroundImage: "url('/office-1.png')" }}>
      <div className="bg-pastel-mint p-8 rounded-lg shadow-md w-full max-w-md">
        {step === 'setup' && (
          <>
            <h1 className="text-2xl font-bold text-center text-white mb-2">
              Set Up Two-Factor Authentication
            </h1>
            <p className="text-white/80 text-center mb-6">
              CJIS compliance requires two-factor authentication. You'll need an authenticator app like Google Authenticator or Authy.
            </p>

            {error && (
              <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded mb-4">
                {error}
              </div>
            )}

            <button
              onClick={handleCreateTOTP}
              disabled={loading}
              className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
            >
              {loading ? 'Setting up...' : 'Set Up Authenticator'}
            </button>
          </>
        )}

        {step === 'verify' && totp && (
          <>
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
                <p className="bg-white/10 text-white font-mono text-center py-2 px-4 rounded select-all">
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
                  value={verificationCode}
                  onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="000000"
                  className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-teal-500 text-center text-2xl tracking-widest"
                  required
                  maxLength={6}
                  autoFocus
                />
              </div>
              <button
                type="submit"
                disabled={loading || verificationCode.length !== 6}
                className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 disabled:bg-gray-400 text-white font-medium rounded-md transition-colors"
              >
                {loading ? 'Verifying...' : 'Verify & Continue'}
              </button>
            </form>
          </>
        )}

        {step === 'backup' && (
          <>
            <h1 className="text-2xl font-bold text-center text-white mb-2">
              Save Your Backup Codes
            </h1>
            <p className="text-white/80 text-center mb-4">
              Save these codes in a secure location. You can use them to sign in if you lose access to your authenticator app.
            </p>

            <div className="bg-white/10 p-4 rounded-lg mb-4">
              <div className="grid grid-cols-2 gap-2">
                {backupCodes.map((code, index) => (
                  <div key={index} className="font-mono text-white text-center py-1">
                    {code}
                  </div>
                ))}
              </div>
            </div>

            <button
              onClick={() => {
                navigator.clipboard.writeText(backupCodes.join('\n'));
              }}
              className="w-full py-2 px-4 mb-2 bg-white/20 hover:bg-white/30 text-white font-medium rounded-md transition-colors"
            >
              Copy to Clipboard
            </button>

            <button
              onClick={handleComplete}
              className="w-full py-2 px-4 bg-teal-600 hover:bg-teal-700 text-white font-medium rounded-md transition-colors"
            >
              I've Saved My Codes - Continue
            </button>
          </>
        )}
      </div>
    </div>
  );
}
