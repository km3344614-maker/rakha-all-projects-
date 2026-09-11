import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import {
  ChevronDown, Plus, AppWindow, Loader2,
  Hexagon, ArrowRight, ArrowLeft
} from 'lucide-react';
import toast from 'react-hot-toast';
import api from '../utils/api';
import { stashAppSecretOnce } from '../utils/appSecretOnce';
import { useApps } from '../context/AppsContext';

const STEPS = [
  { id: 1, label: 'Name' },
  { id: 2, label: 'Configure' },
  { id: 3, label: 'Launch' },
];

function CreateAppPanel({ onClose, onCreated }) {
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const prefix = name
    ? name.toUpperCase().replace(/[^A-Z0-9]/g, '').substring(0, 6) || 'APP'
    : 'APP';

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!name.trim()) {
      setError('Enter an app name');
      return;
    }
    setLoading(true);
    try {
      const res = await api.post('/apps', {
        name: name.trim(),
        version: '1.0.0',
        hwidLock: true,
        keyPrefix: prefix,
        description: '',
      });
      toast.success('Application created!');
      stashAppSecretOnce(res.data.app._id, res.data.appSecretOnce);
      onCreated(res.data.app);
    } catch (err) {
      setError(err.response?.data?.message || 'Failed to create app');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    const onKey = (e) => { if (e.key === 'Escape') onClose(); };
    document.body.classList.add('sa-create-app-open');
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.classList.remove('sa-create-app-open');
      document.removeEventListener('keydown', onKey);
    };
  }, [onClose]);

  return (
    <div className="create-app-dock" role="dialog" aria-label="Create a new app">
      <div className="create-app-dock-glow" aria-hidden="true" />
      <div className="first-app-card create-app-card">
        <div className="first-app-icon-wrap" aria-hidden="true">
          <span className="first-app-icon-glow" />
          <div className="first-app-icon">
            <Hexagon size={22} strokeWidth={1.75} />
          </div>
        </div>

        <h1 className="first-app-title">Create a new app</h1>
        <p className="first-app-sub">Add another application to your account</p>

        <div className="first-app-steps" role="list" aria-label="Progress">
          {STEPS.map((s, i) => (
            <div key={s.id} className="first-app-step-wrap">
              <div role="listitem" className={`first-app-step ${s.id === 1 ? 'active' : ''}`}>
                <span className="first-app-step-num">{s.id}</span>
                <span className="first-app-step-label">{s.label}</span>
              </div>
              {i < STEPS.length - 1 && (
                <span className="first-app-step-line" aria-hidden="true" />
              )}
            </div>
          ))}
        </div>

        {error && <div className="first-app-error">{error}</div>}

        <form className="first-app-form" onSubmit={submit}>
          <label className="first-app-label" htmlFor="create-app-name">
            <span className="first-app-label-icon" aria-hidden="true">
              <Hexagon size={10} strokeWidth={2.25} />
            </span>
            App Name
          </label>
          <input
            id="create-app-name"
            className="first-app-input"
            type="text"
            placeholder="My Awesome App"
            value={name}
            onChange={e => setName(e.target.value)}
            maxLength={50}
            autoFocus
            required
          />
          <button type="submit" className="first-app-submit" disabled={loading}>
            {loading ? (
              <>
                <Loader2 size={16} className="spin" />
                Creating...
              </>
            ) : (
              <>
                Create App
                <ArrowRight size={15} />
              </>
            )}
          </button>
        </form>

        <button type="button" className="create-app-back" onClick={onClose}>
          <ArrowLeft size={14} />
          Cancel
        </button>
      </div>
    </div>
  );
}

export default function AppSwitcher() {
  const { apps, addApp, currentApp, setCurrentAppId } = useApps();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [menuPos, setMenuPos] = useState(null);
  const rootRef = useRef(null);
  const menuRef = useRef(null);

  const current = currentApp;

  const updateMenuPos = () => {
    const el = rootRef.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    setMenuPos({
      top: r.bottom + 6,
      left: r.left,
      width: r.width,
    });
  };

  useEffect(() => {
    const openCreate = () => setShowCreate(true);
    window.addEventListener('rakha:create-app', openCreate);
    return () => window.removeEventListener('rakha:create-app', openCreate);
  }, []);

  useLayoutEffect(() => {
    if (!open) return;
    updateMenuPos();
    window.addEventListener('resize', updateMenuPos);
    window.addEventListener('scroll', updateMenuPos, true);
    return () => {
      window.removeEventListener('resize', updateMenuPos);
      window.removeEventListener('scroll', updateMenuPos, true);
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e) => {
      const t = e.target;
      if (rootRef.current?.contains(t) || menuRef.current?.contains(t)) return;
      setOpen(false);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onDoc);
      document.removeEventListener('keydown', onKey);
    };
  }, [open]);

  const selectApp = (app) => {
    setOpen(false);
    setCurrentAppId(app._id);
    navigate('/dashboard');
  };

  const openCreate = () => {
    setOpen(false);
    setShowCreate(true);
  };

  const menu = open && menuPos && createPortal(
    <div
      ref={menuRef}
      className="app-switcher-menu app-switcher-menu--portal"
      role="listbox"
      style={{
        top: menuPos.top,
        left: menuPos.left,
        width: menuPos.width,
      }}
    >
      <div className="app-switcher-list">
        {apps.length === 0 ? (
          <div className="app-switcher-empty">No apps found</div>
        ) : (
          apps.map(app => (
            <button
              key={app._id}
              type="button"
              role="option"
              aria-selected={currentApp?._id === app._id}
              className={`app-switcher-item ${currentApp?._id === app._id ? 'active' : ''}`}
              onClick={() => selectApp(app)}
            >
              <AppWindow size={15} />
              <span className="app-switcher-item-text">
                <span className="app-switcher-item-name">{app.name}</span>
                <span className="app-switcher-item-ver">v{app.version || '1.0.0'}</span>
              </span>
            </button>
          ))
        )}
      </div>
      <button type="button" className="app-switcher-create" onClick={openCreate}>
        <Plus size={15} />
        Create New App
      </button>
    </div>,
    document.body
  );

  return (
    <>
      <div className={`app-switcher ${open ? 'is-open' : ''}`} ref={rootRef}>
        <button
          type="button"
          className="app-switcher-trigger"
          onClick={() => setOpen(v => !v)}
          aria-expanded={open}
          aria-haspopup="listbox"
        >
          <div className="app-switcher-icon">
            {current ? (
              <img src="/rakha.jpg?v=2" alt="" width={24} height={24} style={{ borderRadius: '50%', objectFit: 'cover' }} />
            ) : (
              <img src="/rakha.jpg?v=2" alt="" width={24} height={24} style={{ borderRadius: '50%', objectFit: 'cover' }} />
            )}
          </div>
          <div className="app-switcher-text">
            <span className="app-switcher-name">
              {current ? current.name : 'No app'}
            </span>
            <span className="app-switcher-ver">
              {current ? `v${current.version || '1.0.0'}` : 'Create one'}
            </span>
          </div>
          <ChevronDown size={16} className={`app-switcher-chevron ${open ? 'up' : ''}`} />
        </button>
      </div>

      {menu}

      {showCreate && createPortal(
        <CreateAppPanel
          onClose={() => setShowCreate(false)}
          onCreated={(app) => {
            addApp(app);
            setShowCreate(false);
            navigate('/dashboard');
          }}
        />,
        document.body
      )}
    </>
  );
}
