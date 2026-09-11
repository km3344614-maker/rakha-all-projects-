import { useNavigate } from 'react-router-dom';
import { LogOut, User } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useApps } from '../context/AppsContext';
import FirstAppWizard from './FirstAppWizard';

export default function OnboardingShell() {
  const navigate = useNavigate();
  const { user, logout } = useAuth();
  const { refreshApps, addApp } = useApps();

  return (
    <div className="panel-app panel-app--onboarding">

      <aside className="panel-sidebar panel-sidebar--onboarding">
        <div className="panel-brand panel-brand--onboarding">
          <div className="panel-brand-icon panel-brand-icon--round">
            <img src="/logo.png" alt="Rakha Auth" width={22} height={22} />
          </div>
        </div>

        <nav className="panel-nav panel-nav--onboarding" aria-label="Panel">
          <div className="panel-onboarding-spacer" />
        </nav>

        <div className="panel-user">
          <div className={`panel-avatar ${user?.avatarUrl ? 'has-photo' : ''}`} aria-hidden="true">
            {user?.avatarUrl ? (
              <img src={user.avatarUrl} alt="" className="panel-avatar-img" />
            ) : (
              <User size={15} strokeWidth={2.25} />
            )}
          </div>
          <div className="panel-user-name">{user?.username}</div>
          <button type="button" className="panel-logout-icon" onClick={logout} title="Logout">
            <LogOut size={15} />
          </button>
        </div>
      </aside>

      <main className="panel-main panel-main--onboarding">
        <FirstAppWizard
          onCreated={async (app) => {
            addApp(app);
            refreshApps(true);
            navigate(`/applications/${app._id}/settings`, { replace: true });
          }}
        />
      </main>
    </div>
  );
}
