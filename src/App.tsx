import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { EnrollmentPage, LoginPage, MainPage, FileReviewPage, VideoReviewPage } from './pages';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isEnrolled, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!isEnrolled) {
    return <Navigate to="/enroll" replace />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}

function PublicRoute({ children, requireEnrolled = false }: { children: React.ReactNode; requireEnrolled?: boolean }) {
  const { isAuthenticated, isEnrolled, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (requireEnrolled && !isEnrolled) {
    return <Navigate to="/enroll" replace />;
  }

  if (isAuthenticated && isEnrolled) {
    return <Navigate to="/" replace />;
  }

  return <>{children}</>;
}

function App() {
  const { checkAuth } = useAuthStore();

  useEffect(() => {
    checkAuth();
  }, [checkAuth]);

  return (
    <Routes>
      <Route
        path="/enroll"
        element={
          <PublicRoute>
            <EnrollmentPage />
          </PublicRoute>
        }
      />
      <Route
        path="/login"
        element={
          <PublicRoute requireEnrolled>
            <LoginPage />
          </PublicRoute>
        }
      />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <MainPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/files/:id"
        element={
          <ProtectedRoute>
            <FileReviewPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/videos/:fileId"
        element={
          <ProtectedRoute>
            <VideoReviewPage />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;
