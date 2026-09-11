import { Outlet } from 'react-router-dom';
import { useApps } from '../context/AppsContext';
import OnboardingShell from './OnboardingShell';

const LoadingScreen = () => (
  <div className="pro-loading" aria-busy="true" aria-label="Loading">
    <div className="pro-loading-spinner" aria-hidden="true">
      {Array.from({ length: 8 }, (_, i) => (
        <span key={i} className="pro-loading-dot" style={{ '--i': i }} />
      ))}
    </div>
  </div>
);

function LoadError({ message, onRetry }) {
  return (
    <div className="panel-app" style={{ alignItems: 'center', justifyContent: 'center' }}>
      <div className="panel-main" style={{ maxWidth: 420, padding: 28, textAlign: 'center' }}>
        <h1 className="panel-title" style={{ marginBottom: 8 }}>Couldn’t load apps</h1>
        <p className="panel-subtitle" style={{ marginBottom: 20 }}>{message}</p>
        <button type="button" className="panel-btn panel-btn-solid" onClick={onRetry}>
          Try again
        </button>
      </div>
    </div>
  );
}

export default function OnboardingGate() {
  const { loading, hasApps, error, loadedOnce, refreshApps } = useApps();

  if (loading && !loadedOnce) return <LoadingScreen />;
  if (error && !hasApps) {
    return <LoadError message={error} onRetry={() => refreshApps()} />;
  }
  if (loadedOnce && !hasApps) return <OnboardingShell />;
  if (!loadedOnce) return <LoadingScreen />;

  return <Outlet />;
}
