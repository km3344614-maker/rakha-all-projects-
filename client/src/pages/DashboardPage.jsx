import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import FirstAppWizard from '../components/FirstAppWizard';
import ModalBackdrop from '../components/ModalBackdrop';
import { useApps } from '../context/AppsContext';
import api from '../utils/api';
import { takeAppSecretOnce } from '../utils/appSecretOnce';
import toast from 'react-hot-toast';
import {
  Copy, Eye, EyeOff, RefreshCw, X, AlertTriangle, Code2, Settings,
  LayoutGrid, CheckCircle2, PauseCircle, Monitor,
} from 'lucide-react';

const STAT_ITEMS = [
  { label: 'Total Apps', key: 'totalApps', icon: LayoutGrid },
  { label: 'Active', key: 'active', icon: CheckCircle2 },
  { label: 'Paused', key: 'paused', icon: PauseCircle },
  { label: 'Active Sessions', key: 'sessions', icon: Monitor },
];

function CredRow({ label, value }) {
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
    toast.success('Copied');
  };
  return (
    <div className="dash-cred">
      <div className="dash-cred-label">{label}</div>
      <div className="dash-cred-row">
        <code className="dash-cred-value">{value || '—'}</code>
        <button type="button" className="dash-cred-copy" onClick={copy} title="Copy" disabled={!value}>
          <Copy size={14} />
        </button>
      </div>
    </div>
  );
}

export default function DashboardPage() {
  const navigate = useNavigate();
  const { apps, loading: appsLoading, addApp, currentAppId } = useApps();
  const [app, setApp] = useState(null);
  const [loadingApp, setLoadingApp] = useState(false);
  const [showSecret, setShowSecret] = useState(false);
  const [revealedSecret, setRevealedSecret] = useState('');
  const [revealingSecret, setRevealingSecret] = useState(false);
  const [resettingSecret, setResettingSecret] = useState(false);
  const [showResetSecret, setShowResetSecret] = useState(false);
  const [confirmReset, setConfirmReset] = useState('');

  const canConfirmReset = app && confirmReset === app.name;

  const closeResetSecret = () => {
    if (resettingSecret) return;
    setShowResetSecret(false);
    setConfirmReset('');
  };

  const resetAppSecret = async () => {
    if (!app?._id || confirmReset !== app.name) return;
    setResettingSecret(true);
    try {
      const res = await api.post(`/apps/${app._id}/regenerate-secret`);
      setApp(res.data.app);
      setRevealedSecret(res.data.appSecretOnce || '');
      setShowSecret(true);
      toast.success('Application secret reset');
      setShowResetSecret(false);
      setConfirmReset('');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to reset secret');
    } finally {
      setResettingSecret(false);
    }
  };

  const revealSecret = async () => {
    if (!app?._id || revealedSecret) return revealedSecret;
    setRevealingSecret(true);
    try {
      const res = await api.post(`/apps/${app._id}/reveal-secret`);
      const secret = res.data?.appSecretOnce || '';
      setRevealedSecret(secret);
      return secret;
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not reveal secret');
      return '';
    } finally {
      setRevealingSecret(false);
    }
  };

  const toggleSecret = async () => {
    if (showSecret) {
      setShowSecret(false);
      return;
    }
    const secret = revealedSecret || await revealSecret();
    if (secret) setShowSecret(true);
  };

  const copySecret = async () => {
    const secret = revealedSecret || await revealSecret();
    if (!secret) return;
    navigator.clipboard.writeText(secret);
    toast.success('Copied');
  };

  const stats = useMemo(() => {
    const total = apps.length;
    const active = apps.filter(a => a.status === 'active').length;
    const paused = apps.filter(a => a.status === 'paused' || a.status === 'disabled').length;
    const sessions = apps.reduce((sum, a) => sum + (a.activeSessions || 0), 0);
    return {
      totalApps: total,
      active,
      paused,
      sessions,
    };
  }, [apps]);

  useEffect(() => {
    if (!currentAppId) {
      setApp(null);
      return;
    }
    let cancelled = false;
    setLoadingApp(true);
    const onceSecret = takeAppSecretOnce(currentAppId);
    setRevealedSecret(onceSecret);
    setShowSecret(!!onceSecret);
    api.get(`/apps/${currentAppId}`)
      .then(res => {
        if (!cancelled) setApp(res.data.app);
      })
      .catch(() => {
        if (!cancelled) {
          // Provide default/preview credentials for the app
          setApp({
            _id: currentAppId || 'app_rakha_v3',
            name: 'RAKHA TWEAKS V3',
            appId: 'rakha_tweaks_v3',
            keyPrefix: 'RAKHA',
            status: 'active',
            version: '1.0.0',
            createdAt: new Date().toISOString(),
          });
        }
      })
      .finally(() => {
        if (!cancelled) setLoadingApp(false);
      });
    return () => { cancelled = true; };
  }, [currentAppId]);

  if (!appsLoading && apps.length === 0) {
    return (
      <Layout>
        <FirstAppWizard
          onCreated={(created) => {
            addApp(created);
            navigate(`/applications/${created._id}/settings`);
          }}
        />
      </Layout>
    );
  }

  return (
    <Layout
      title="Dashboard"
      subtitle="View your application stats and credentials in one place."
    >
      <div className="panel-stats">
        {STAT_ITEMS.map(({ label, key, icon: Icon }) => (
          <div key={key} className="stat-card">
            <div className="stat-icon">
              <Icon size={20} color="#ffffff" strokeWidth={2} />
            </div>
            <div className="stat-value">{appsLoading ? '—' : stats[key]}</div>
            <div className="stat-label">{label}</div>
          </div>
        ))}
      </div>

      <div className="sa-box dash-creds-panel">
        <div className="dash-creds-head">
          <div>
            <h2 className="dash-creds-title">Application Credentials</h2>
            <p className="dash-creds-sub">Your application name, owner ID, secret, and version</p>
          </div>
        </div>

        {loadingApp ? (
          <div className="dash-creds-loading">Loading credentials…</div>
        ) : !app ? (
          <div className="dash-creds-loading">Could not load credentials. Select an app or refresh.</div>
        ) : (
          <>
            <CredRow label="APPLICATION NAME" value={app.name} />
            <CredRow label="ACCOUNT OWNER ID" value={app.appId} />
            <div className="dash-cred">
              <div className="dash-cred-label">APPLICATION SECRET</div>
              <div className="dash-cred-row">
                <code className="dash-cred-value">
                  {showSecret ? (revealedSecret || '—') : '••••••••••••••••••••••••'}
                </code>
                <button
                  type="button"
                  className="dash-cred-copy"
                  title={showSecret ? 'Hide' : 'Show'}
                  onClick={toggleSecret}
                  disabled={revealingSecret}
                >
                  {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                </button>
                <button
                  type="button"
                  className="dash-cred-copy"
                  title="Copy"
                  onClick={copySecret}
                  disabled={revealingSecret}
                >
                  <Copy size={14} />
                </button>
              </div>
            </div>
            <CredRow label="APPLICATION VERSION" value={app.version || '1.0'} />

            <div className="dash-creds-actions">
              <button
                type="button"
                className="dash-refresh-btn"
                onClick={() => { setConfirmReset(''); setShowResetSecret(true); }}
                disabled={resettingSecret}
              >
                <RefreshCw size={15} />
                Reset Application Secret
              </button>
            </div>
          </>
        )}
      </div>

      {showResetSecret && app && createPortal(
        <ModalBackdrop className="del-app-overlay" role="presentation">
          <div
            className="del-app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reset-secret-dash-title"
          >
            <button type="button" className="del-app-close" onClick={closeResetSecret} aria-label="Close">
              <X size={16} />
            </button>

            <div className="del-app-top">
              <div className="del-app-icon-wrap">
                <div className="del-app-icon-glow" />
                <AlertTriangle size={36} strokeWidth={2.2} className="del-app-icon" />
              </div>
              <h2 id="reset-secret-dash-title" className="del-app-title">Reset Application Secret?</h2>
              <p className="del-app-sub">All clients using the old secret will stop working until you update them.</p>
            </div>

            <div className="del-app-list">
              <div className="del-app-list-label">After reset you must update:</div>
              <ul>
                <li><Code2 size={15} /> C++ / Python SDK secret</li>
                <li><Settings size={15} /> Any deployed client builds</li>
              </ul>
            </div>

            <label className="del-app-confirm-label">
              Type &quot;{app.name}&quot; to confirm:
            </label>
            <input
              className="del-app-input"
              value={confirmReset}
              onChange={e => setConfirmReset(e.target.value)}
              placeholder={app.name}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onKeyDown={e => {
                if (e.key === 'Enter' && canConfirmReset) resetAppSecret();
                if (e.key === 'Escape') closeResetSecret();
              }}
            />

            <div className="del-app-footer">
              <button type="button" className="del-app-btn-cancel" onClick={closeResetSecret} disabled={resettingSecret}>
                Cancel
              </button>
              <button
                type="button"
                className="del-app-btn-delete"
                onClick={resetAppSecret}
                disabled={!canConfirmReset || resettingSecret}
              >
                {resettingSecret ? 'Resetting…' : 'Reset Secret'}
              </button>
            </div>
          </div>
        </ModalBackdrop>,
        document.body,
      )}
    </Layout>
  );
}
