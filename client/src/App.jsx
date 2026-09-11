import { lazy, Suspense } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useParams } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { AppsProvider } from './context/AppsContext';
import OnboardingGate from './components/OnboardingGate';
import AuthBackground from './components/AuthBackground';
import AppToaster from './components/AppToaster';
import './index.css';
import './premium-effects.css';
import './panel.css';
import './brand-theme.css';

const LoginPage = lazy(() => import('./pages/LoginPage'));
const DashboardPage = lazy(() => import('./pages/DashboardPage'));
const ProfilePage = lazy(() => import('./pages/ProfilePage'));
const AppDetailPage = lazy(() => import('./pages/AppDetailPage'));

const LoadingScreen = () => (
  <div className="pro-loading" aria-busy="true" aria-label="Loading">
    <div className="pro-loading-spinner" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="pro-loading-dot" style={{ '--i': i }} />
      ))}
    </div>
  </div>
);

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return user ? children : <Navigate to="/login" replace />;
};

const AppSectionRedirect = () => {
  const { id } = useParams();
  return <Navigate to={`/applications/${id}/settings`} replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return <LoadingScreen />;
  return !user ? children : <Navigate to="/dashboard" replace />;
};

function PanelRoutes() {
  const { loading } = useAuth();
  if (loading) return <LoadingScreen />;

  return (
    <AppsProvider>
      <Suspense fallback={<LoadingScreen />}>
        <Routes>
          <Route path="/" element={<Navigate to="/dashboard" replace />} />
          <Route path="/login" element={<PublicRoute><LoginPage /></PublicRoute>} />

          <Route element={<ProtectedRoute><OnboardingGate /></ProtectedRoute>}>
            <Route path="/profile" element={<ProfilePage />} />
            <Route path="/dashboard" element={<DashboardPage />} />
            <Route path="/applications" element={<Navigate to="/dashboard" replace />} />
            <Route path="/applications/:id" element={<AppSectionRedirect />} />
            <Route path="/applications/:id/:section" element={<AppDetailPage />} />
          </Route>

          <Route path="*" element={<Navigate to="/dashboard" replace />} />
        </Routes>
      </Suspense>
    </AppsProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <div className="app-shell">
          <AuthBackground />
          <div className="app-shell-content">
            <AppToaster />
            <PanelRoutes />
          </div>
        </div>
      </BrowserRouter>
    </AuthProvider>
  );
}
