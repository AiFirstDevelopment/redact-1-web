import { useEffect } from 'react';
import { Routes, Route, Navigate } from 'react-router-dom';
import { useAuthStore } from './stores/authStore';
import { LoginPage, RequestsPage, RequestDetailPage, FileReviewPage } from './pages';

function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isAuthenticated, isLoading } = useAuthStore();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-gray-500">Loading...</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
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
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <RequestsPage />
          </ProtectedRoute>
        }
      />
      <Route
        path="/requests/:id"
        element={
          <ProtectedRoute>
            <RequestDetailPage />
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
    </Routes>
  );
}

export default App;
