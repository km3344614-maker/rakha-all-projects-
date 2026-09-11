import { memo, useEffect } from 'react';
import { Link, useLocation, useParams } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useApps } from '../context/AppsContext';
import AppSwitcher from './AppSwitcher';
import {
  Settings, Key, LogOut, LayoutDashboard, User, Users,
  Clock
} from 'lucide-react';

function appGroups(appId) {
  const base = `/applications/${appId}`;
  return [
    {
      label: 'Management',
      items: [
        { label: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', key: 'dashboard' },
        { label: 'Settings', icon: Settings, path: `${base}/settings`, key: 'settings' },
        { label: 'Licenses', icon: Key, path: `${base}/licenses`, key: 'licenses' },
        { label: 'Users', icon: Users, path: `${base}/users`, key: 'users' },
        { label: 'Sessions', icon: Clock, path: `${base}/sessions`, key: 'sessions' },
      ],
    },
  ];
}

function resolveActive(pathname, section) {
  if (pathname.startsWith('/dashboard')) return 'dashboard';
  if (pathname.startsWith('/profile')) return 'profile';
  if (section === 'keys') return 'licenses';
  if (section === 'logs') return 'sessions';
  return section || null;
}

function Layout({ children, title, subtitle, actions }) {
  const { user, logout } = useAuth();
  const { currentAppId, setCurrentAppId } = useApps();
  const location = useLocation();
  const { id: routeAppId, section } = useParams();

  useEffect(() => {
    if (routeAppId) setCurrentAppId(routeAppId);
  }, [routeAppId, setCurrentAppId]);

  const appId = routeAppId || currentAppId;
  const groups = appId ? appGroups(appId) : [];
  const active = resolveActive(location.pathname, section);

  return (
    <div className="panel-app panel-app--top-layout">
      {/* Top Navbar: AppSwitcher Left | Navigation Tabs Center | User Profile Right */}
      <header className="panel-top-navbar">
        <div className="panel-top-nav-left">
          <AppSwitcher />
        </div>

        <nav className="panel-top-nav-center" aria-label="Main Navigation">
          {groups.flatMap(g => g.items).map(item => {
            const Icon = item.icon;
            return (
              <Link
                key={item.label}
                to={item.path}
                className={`panel-top-pill-link ${active === item.key ? 'active' : ''}`}
              >
                <Icon size={15} strokeWidth={2} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>

        <div className="panel-top-nav-right">
          <Link to="/profile" className="panel-top-user" title="Account">
            <span className="panel-avatar has-photo" aria-hidden="true">
              <img 
                src={
                  user?.username?.toLowerCase()?.includes('mohamed')
                    ? '/mohamed.png'
                    : '/rakha.jpg?v=2'
                } 
                alt="" 
                className="panel-avatar-img" 
              />
            </span>
            <span className="panel-top-username">{user?.username}</span>
          </Link>
          <button type="button" className="panel-logout-icon" onClick={logout} title="Logout">
            <LogOut size={16} />
          </button>
        </div>
      </header>

      {/* Main Content Area (Full width below top navbar) */}
      <main className="panel-main-full">
        {(title || actions) && (
          <div className="panel-content-header">
            <div className="panel-page-heading">
              {title && <h1 className="panel-title">{title}</h1>}
              {subtitle && <p className="panel-subtitle">{subtitle}</p>}
            </div>
            {actions && <div className="panel-header-actions">{actions}</div>}
          </div>
        )}
        <div key={location.pathname} className="panel-body panel-page-anim">{children}</div>
      </main>
    </div>
  );
}

export default memo(Layout);
