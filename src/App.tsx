import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { SignedIn, SignedOut, useAuth, useUser } from '@clerk/clerk-react';
import { useAuthStore } from './stores/authStore';
import { EnrollmentPage, MainPage, FileReviewPage, VideoReviewPage, ConsolePage, SignUpPage, SignInPage } from './pages';

function AuthSync({ children }: { children: React.ReactNode }) {
  const { getToken, isLoaded, isSignedIn } = useAuth();
  const { user: clerkUser } = useUser();
  const { syncWithClerk, isLoading, agency } = useAuthStore();

  useEffect(() => {
    if (isLoaded && isSignedIn && clerkUser) {
      syncWithClerk(getToken);
    }
  }, [isLoaded, isSignedIn, clerkUser, getToken, syncWithClerk]);

  if (!isLoaded || isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  // User is signed in but not enrolled in an agency
  if (isSignedIn && !agency) {
    return <EnrollmentPage />;
  }

  return <>{children}</>;
}

function App() {
  return (
    <Routes>
      <Route
        path="/sign-in"
        element={
          <SignedOut>
            <SignInPage />
          </SignedOut>
        }
      />
      <Route
        path="/sign-up"
        element={<SignUpPage />}
      />
      <Route
        path="/console"
        element={<ConsolePage />}
      />
      <Route
        path="/*"
        element={
          <>
            <SignedOut>
              <Navigate to="/sign-in" replace />
            </SignedOut>
            <SignedIn>
              <AuthSync>
                <Routes>
                  <Route path="/" element={<MainPage />} />
                  <Route path="/files/:id" element={<FileReviewPage />} />
                  <Route path="/videos/:fileId" element={<VideoReviewPage />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </AuthSync>
            </SignedIn>
          </>
        }
      />
    </Routes>
  );
}

export default App;
