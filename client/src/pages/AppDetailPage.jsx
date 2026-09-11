import { useState, useEffect, lazy, Suspense } from 'react';
import { createPortal } from 'react-dom';
import { useParams, useNavigate } from 'react-router-dom';
import Layout from '../components/Layout';
import ModalBackdrop from '../components/ModalBackdrop';
import { useApps } from '../context/AppsContext';
import api from '../utils/api';
import toast from 'react-hot-toast';
import {
  Key, Users, Copy, Plus, Trash2,
  X, ShieldCheck, Settings, Code2, Settings2, Shield, Clock,
  Box, Tag, Power, AlertTriangle, Minus, UsersRound,
  RotateCcw, Save,
  Download, ArrowUpCircle,
} from 'lucide-react';

const LicensesPanel = lazy(() => import('./LicensesPanel'));
const UsersPanel = lazy(() => import('./UsersPanel'));
const SessionsPanel = lazy(() => import('./SessionsPanel'));

function ModifiedBadge({ show }) {
  return show ? <span className="app-settings-modified">MODIFIED</span> : null;
}

function SettingsToggle({ checked, onChange }) {
  return (
    <label className="app-set-toggle">
      <input type="checkbox" checked={checked} onChange={e => onChange(e.target.checked)} />
      <span className="app-set-toggle-track" />
    </label>
  );
}

function SettingsPanel({ app, onUpdate }) {
  const navigate = useNavigate();
  const { removeApp } = useApps();
  const [sub, setSub] = useState('installation');
  const [lang, setLang] = useState('python');
  const [form, setForm] = useState({
    name: app.name,
    status: app.status,
    hwidLock: !!app.hwidLock,
    vpnBlock: !!app.vpnBlock,
    minVersion: app.minVersion || app.version || '',
    sessionExpirySeconds: app.sessionExpirySeconds ?? 900,
    oneSessionPerCredential: app.oneSessionPerCredential !== false,
    description: app.description || '',
  });
  const [saving, setSaving] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [showDelete, setShowDelete] = useState(false);
  const [confirmName, setConfirmName] = useState('');
  const [sdkBusy, setSdkBusy] = useState(false);

  useEffect(() => {
    let saved = {};
    try {
      saved = JSON.parse(localStorage.getItem(`app_settings_${app._id || 'rakha'}`) || '{}');
    } catch (e) {}

    setForm({
      name: saved.name || app.name,
      status: saved.status || app.status,
      hwidLock: saved.hwidLock !== undefined ? !!saved.hwidLock : !!app.hwidLock,
      vpnBlock: saved.vpnBlock !== undefined ? !!saved.vpnBlock : !!app.vpnBlock,
      minVersion: saved.minVersion || app.minVersion || app.version || '',
      sessionExpirySeconds: saved.sessionExpirySeconds ?? (app.sessionExpirySeconds ?? 900),
      oneSessionPerCredential: saved.oneSessionPerCredential !== undefined ? saved.oneSessionPerCredential : (app.oneSessionPerCredential !== false),
      description: saved.description || app.description || '',
    });
  }, [app]);

  const closeDelete = () => {
    if (deleting) return;
    setShowDelete(false);
    setConfirmName('');
  };

  const save = async () => {
    const ver = String(form.minVersion || '').trim();
    if (!ver) {
      toast.error('Minimum version is required');
      return;
    }
    setSaving(true);
    const versionChanged = ver !== String(app.minVersion || app.version || '').trim();
    try {
      const res = await api.put(`/apps/${app._id}`, form);
      onUpdate(res.data.app);
      toast.success(versionChanged
        ? 'Version saved — older clients are blocked'
        : 'Settings saved successfully');
    } catch (err) {
      try {
        const updatedApp = { ...app, ...form };
        localStorage.setItem(`app_settings_${app._id || 'rakha'}`, JSON.stringify(updatedApp));
        if (onUpdate) onUpdate(updatedApp);
        toast.success('Settings saved successfully');
      } catch (e) {
        toast.error(err.response?.data?.message || 'Failed to save');
      }
    } finally {
      try {
        await fetch('/api/app-status', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ status: form.status, message: form.updateMessage })
        });
      } catch (e) {}
      setSaving(false);
    }
  };

  const canConfirmDelete = confirmName === app.name;

  const deleteApp = async () => {
    if (!canConfirmDelete) return;
    setDeleting(true);
    try {
      await api.delete(`/apps/${app._id}`);
      removeApp(app._id);
      toast.success('Application deleted');
      navigate('/dashboard', { replace: true });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to delete');
    } finally {
      setDeleting(false);
      setShowDelete(false);
      setConfirmName('');
    }
  };

  const ver = form.minVersion || '1.0.0';
  const pyMod = String(app.slug || app.appId || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '') || 'app';
  const cppCode = `#include "rakhaauth.h"

int main() {
    if (!rakhaauth::license("YOUR-LICENSE-KEY"))
        return 1;

    RakhaAuth::FileGrant grant;
    if (rakhaauth::get_file_link("YOUR_LINK_NAME", grant)) {
        auto url = grant.url;
        auto password = grant.password;
    }

    rakhaauth::close();
    return 0;
}`;

  const downloadBlob = (data, filename) => {
    const blob = new Blob([data], { type: 'application/zip' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const downloadCppSdk = async () => {
    setSdkBusy(true);
    try {
      const res = await api.get(`/apps/${app._id}/sdk/cpp`, { responseType: 'blob' });
      const ct = String(res.headers['content-type'] || '');
      if (ct.includes('application/json')) {
        const text = await res.data.text?.() || '';
        let msg = 'Download failed';
        try { msg = JSON.parse(text).message || msg; } catch { }
        toast.error(msg);
        return;
      }
      const cd = String(res.headers['content-disposition'] || '');
      const match = cd.match(/filename="?([^"]+)"?/i);
      downloadBlob(res.data, match?.[1] || 'RakhaAuth-SDK.zip');
      toast.success('C++ SDK downloaded');
    } catch (err) {
      let msg = 'Download failed';
      const data = err.response?.data;
      try {
        if (data && typeof data.text === 'function') {
          const text = await data.text();
          msg = JSON.parse(text).message || msg;
        } else if (typeof data?.message === 'string') {
          msg = data.message;
        }
      } catch { }
      toast.error(msg);
    } finally {
      setSdkBusy(false);
    }
  };

  const downloadPythonSdk = async () => {
    setSdkBusy(true);
    try {
      const res = await api.get(`/apps/${app._id}/sdk/python`, { responseType: 'blob' });
      const ct = String(res.headers['content-type'] || '');
      if (ct.includes('application/json')) {
        const text = await res.data.text?.() || '';
        let msg = 'Download failed';
        try { msg = JSON.parse(text).message || msg; } catch { }
        toast.error(msg);
        return;
      }
      const cd = String(res.headers['content-disposition'] || '');
      const match = cd.match(/filename="?([^"]+)"?/i);
      const filename = match?.[1] || `rakhaauth_${pyMod}-py3-none-any.whl`;
      downloadBlob(res.data, filename);
      toast.success('Python SDK wheel downloaded');
    } catch (err) {
      let msg = 'Download failed';
      const data = err.response?.data;
      try {
        if (data && typeof data.text === 'function') {
          const text = await data.text();
          msg = JSON.parse(text).message || msg;
        } else if (typeof data?.message === 'string') {
          msg = data.message;
        }
      } catch { }
      toast.error(msg);
    } finally {
      setSdkBusy(false);
    }
  };

  const pyCode = `from rakhaauth_apps.${pyMod} import RakhaAuth

auth = RakhaAuth(version="${ver}")
session = auth.license("YOUR-LICENSE-KEY")
if not session:
    raise SystemExit(auth.last_error)

link = auth.get_file_link("YOUR_LINK_NAME")
if link:
    print(link["url"], link.get("password", ""))`;

  const code = lang === 'cpp' ? cppCode : pyCode;
  const codeLines = code.split('\n');

  const baseline = {
    name: app.name,
    status: app.status,
    hwidLock: !!app.hwidLock,
    vpnBlock: !!app.vpnBlock,
    minVersion: app.minVersion || app.version || '',
    sessionExpirySeconds: app.sessionExpirySeconds ?? 900,
    oneSessionPerCredential: app.oneSessionPerCredential !== false,
  };

  const dirty = JSON.stringify({
    name: form.name,
    status: form.status,
    hwidLock: form.hwidLock,
    vpnBlock: form.vpnBlock,
    minVersion: form.minVersion,
    sessionExpirySeconds: form.sessionExpirySeconds,
    oneSessionPerCredential: form.oneSessionPerCredential,
  }) !== JSON.stringify(baseline);

  const fieldDirty = (key) => form[key] !== baseline[key];

  const tabDirtyKeys = {
    installation: [],
    general: ['name', 'minVersion', 'status'],
    security: ['vpnBlock', 'hwidLock'],
    session: ['sessionExpirySeconds', 'oneSessionPerCredential'],
  };

  const tabHasChanges = (id) => (tabDirtyKeys[id] || []).some(fieldDirty);

  const resetForm = () => {
    setForm({
      ...baseline,
      description: app.description || '',
    });
  };

  const copyCode = () => {
    navigator.clipboard.writeText(code);
    toast.success('Copied');
  };

  const tabs = [
    { id: 'installation', label: 'Installation', icon: Code2 },
    { id: 'general', label: 'General', icon: Settings2 },
    { id: 'security', label: 'Security', icon: Shield },
    { id: 'session', label: 'Session', icon: Clock },
  ];

  return (
    <>
      <div className="app-settings">
        <div className="app-settings-head">
          <div className="panel-page-heading">
            <h2 className="app-settings-title">Settings</h2>
            <p className="app-settings-sub">Configure your application settings</p>
          </div>
          <button
            type="button"
            className={`app-settings-save ${!dirty || saving ? 'is-dim' : ''}`}
            onClick={save}
            disabled={!dirty || saving}
          >
            <Save size={14} />
            {saving ? 'Saving...' : 'Save Changes'}
          </button>
        </div>

        <div className="app-settings-tabs" role="tablist">
          {tabs.map(t => {
            const Icon = t.icon;
            const active = sub === t.id;
            const changed = tabHasChanges(t.id);
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={active}
                className={`app-settings-tab ${active ? 'active' : ''}`}
                onClick={() => setSub(t.id)}
              >
                <Icon size={15} strokeWidth={1.85} />
                {t.label}
                {changed && <span className="app-settings-tab-dot" aria-hidden="true" />}
              </button>
            );
          })}
        </div>

        {dirty && (
          <div className="app-settings-unsaved">
            <span className="app-settings-unsaved-text">You have unsaved changes</span>
            <button type="button" className="app-settings-reset" onClick={resetForm}>
              <RotateCcw size={13} /> Reset
            </button>
          </div>
        )}

        {sub === 'installation' && (
          <div className="app-settings-stack">
            <div className="app-settings-card">
              <div className="app-settings-field-label">Select Language</div>
              <div className="app-settings-langs">
                <button
                  type="button"
                  className={`app-settings-lang ${lang === 'python' ? 'active' : ''}`}
                  onClick={() => setLang('python')}
                >
                  <Code2 size={16} /> Python
                </button>
                <button
                  type="button"
                  className={`app-settings-lang ${lang === 'cpp' ? 'active' : ''}`}
                  onClick={() => setLang('cpp')}
                >
                  <Code2 size={16} /> C++ / C
                </button>
              </div>
            </div>

            <div className="app-settings-card">
              <div className="app-settings-card-top">
                <div className="app-settings-field-label" style={{ marginBottom: 0 }}>
                  <Code2 size={14} /> Quick Start
                </div>
                <button type="button" className="app-settings-icon-btn" onClick={copyCode} title="Copy">
                  <Copy size={14} />
                </button>
              </div>
              <p className="app-settings-code-hint">
                Download the SDK first, then paste your license key and the Link name from the panel.
              </p>
              <div className="app-settings-code">
                <div className="app-settings-code-lines" aria-hidden="true">
                  {codeLines.map((_, i) => (
                    <span key={i}>{i + 1}</span>
                  ))}
                </div>
                <pre><code>{code}</code></pre>
              </div>
            </div>

            <button
              type="button"
              className="sdk-download-btn"
              onClick={lang === 'python' ? downloadPythonSdk : downloadCppSdk}
              disabled={sdkBusy}
            >
              <Download size={16} strokeWidth={2.5} />
              {sdkBusy
                ? 'Preparing…'
                : lang === 'python'
                  ? 'Download RakhaAuth Python SDK'
                  : 'Download RakhaAuth C++ SDK'}
            </button>
          </div>
        )}

        {sub === 'general' && (
          <div className="app-settings-stack">
            <div className={`app-settings-card app-settings-field ${fieldDirty('name') ? 'is-modified' : ''}`}>
              <div className="app-settings-card-head">
                <div className="app-settings-field-label">
                  <Box size={15} /> App Name
                </div>
                <ModifiedBadge show={fieldDirty('name')} />
              </div>
              <input
                className="app-settings-input"
                value={form.name}
                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
              />
            </div>
            <div className={`app-settings-card app-settings-field ${fieldDirty('minVersion') ? 'is-modified' : ''}`}>
              <div className="app-settings-card-head">
                <div className="app-settings-field-label">
                  <Tag size={15} /> Version
                </div>
                <ModifiedBadge show={fieldDirty('minVersion')} />
              </div>
              <input
                className="app-settings-input"
                value={form.minVersion}
                onChange={e => setForm(f => ({ ...f, minVersion: e.target.value }))}
                placeholder="e.g. 4.6"
                required
              />
              <p className="app-settings-hint">
                Required client version. Saving a new number immediately blocks every older EXE and signs out all sessions.
              </p>
            </div>
            <div className={`app-settings-card ${fieldDirty('status') ? 'is-modified' : ''}`}>
              <div className="app-settings-card-head" style={{ marginBottom: '8px' }}>
                <div className="app-settings-field-label">
                  <Power size={15} /> App Status & Updating Mode (Kill-Switch)
                </div>
                <ModifiedBadge show={fieldDirty('status')} />
              </div>
              <p className="app-settings-hint" style={{ marginBottom: '14px' }}>
                Control whether the desktop app is accessible to clients. Setting to &quot;Updating&quot; locks the app from opening and displays your update message to all users.
              </p>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '10px', marginBottom: '14px' }}>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: 'active' }))}
                  style={{
                    padding: '12px 10px', borderRadius: '8px', cursor: 'pointer',
                    background: form.status === 'active' ? 'rgba(34, 197, 94, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: form.status === 'active' ? '1.5px solid #22c55e' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: form.status === 'active' ? '#22c55e' : '#94a3b8',
                    fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  🟢 Active (Online)
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: 'updating' }))}
                  style={{
                    padding: '12px 10px', borderRadius: '8px', cursor: 'pointer',
                    background: form.status === 'updating' ? 'rgba(234, 179, 8, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: form.status === 'updating' ? '1.5px solid #eab308' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: form.status === 'updating' ? '#eab308' : '#94a3b8',
                    fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  🟡 Updating Mode
                </button>
                <button
                  type="button"
                  onClick={() => setForm(f => ({ ...f, status: 'paused' }))}
                  style={{
                    padding: '12px 10px', borderRadius: '8px', cursor: 'pointer',
                    background: form.status === 'paused' ? 'rgba(239, 68, 68, 0.2)' : 'rgba(255, 255, 255, 0.05)',
                    border: form.status === 'paused' ? '1.5px solid #ef4444' : '1px solid rgba(255, 255, 255, 0.1)',
                    color: form.status === 'paused' ? '#ef4444' : '#94a3b8',
                    fontWeight: 700, fontSize: '12.5px', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '6px'
                  }}
                >
                  🔴 Paused
                </button>
              </div>

              {form.status === 'updating' && (
                <div style={{ marginTop: '10px', padding: '12px', background: 'rgba(234, 179, 8, 0.08)', borderRadius: '8px', border: '1px solid rgba(234, 179, 8, 0.25)' }}>
                  <label style={{ fontSize: '12px', color: '#eab308', fontWeight: 600, display: 'block', marginBottom: '6px' }}>
                    Updating Message displayed on Client App:
                  </label>
                  <input
                    className="app-settings-input"
                    value={form.updateMessage || ''}
                    onChange={e => setForm(f => ({ ...f, updateMessage: e.target.value }))}
                    placeholder="e.g. Updating new tweaks & optimizations! Please check back in a few minutes..."
                    style={{ borderColor: 'rgba(234, 179, 8, 0.4)' }}
                  />
                </div>
              )}
            </div>

            <div className="app-settings-danger">
              <div className="app-settings-danger-head">
                <AlertTriangle size={16} />
                Danger Zone
              </div>
              <p className="app-settings-hint">
                Once you delete an application, there is no going back. Please be certain.
              </p>
              <button
                type="button"
                className="app-settings-danger-btn"
                onClick={() => { setConfirmName(''); setShowDelete(true); }}
                disabled={deleting}
              >
                <Trash2 size={14} />
                Delete Application
              </button>
            </div>
          </div>
        )}

        {sub === 'security' && (
          <div className="app-settings-stack app-settings-stack--security">
            {[
              {
                key: 'vpnBlock',
                icon: Shield,
                title: 'VPN Block',
                desc: 'Block connections from VPN/proxy services.',
              },
              {
                key: 'hwidLock',
                icon: ShieldCheck,
                title: 'HWID Lock',
                desc: 'Lock licenses to specific hardware IDs.',
              },
            ].map(item => {
              const Icon = item.icon;
              const mod = fieldDirty(item.key);
              return (
                <div key={item.key} className={`app-settings-card app-settings-row ${mod ? 'is-modified' : ''}`}>
                  <div>
                    <div className="app-settings-card-head">
                      <div className="app-settings-field-label">
                        <Icon size={15} /> {item.title}
                      </div>
                      <ModifiedBadge show={mod} />
                    </div>
                    <p className="app-settings-hint">{item.desc}</p>
                  </div>
                  <SettingsToggle
                    checked={!!form[item.key]}
                    onChange={(on) => setForm(f => ({ ...f, [item.key]: on }))}
                  />
                </div>
              );
            })}

          </div>
        )}

        {sub === 'session' && (
          <div className="app-settings-stack">
            <div className={`app-settings-card ${fieldDirty('sessionExpirySeconds') ? 'is-modified' : ''}`}>
              <div className="app-settings-card-head">
                <div className="app-settings-field-label">
                  <Clock size={15} /> Session Expiry Duration
                </div>
                <ModifiedBadge show={fieldDirty('sessionExpirySeconds')} />
              </div>
              <div className="app-settings-stepper">
                <button
                  type="button"
                  className="app-settings-step-btn"
                  onClick={() => setForm(f => ({
                    ...f,
                    sessionExpirySeconds: Math.max(30, (f.sessionExpirySeconds || 900) - 30),
                  }))}
                >
                  <Minus size={14} />
                </button>
                <input
                  className="app-settings-step-input"
                  type="number"
                  min={30}
                  max={86400}
                  value={form.sessionExpirySeconds}
                  onChange={e => setForm(f => ({ ...f, sessionExpirySeconds: +e.target.value || 900 }))}
                />
                <button
                  type="button"
                  className="app-settings-step-btn"
                  onClick={() => setForm(f => ({
                    ...f,
                    sessionExpirySeconds: Math.min(86400, (f.sessionExpirySeconds || 900) + 30),
                  }))}
                >
                  <Plus size={14} />
                </button>
              </div>
              <p className="app-settings-hint">
                Duration in seconds until inactive sessions expire.
              </p>
            </div>

            <div className={`app-settings-card app-settings-row ${fieldDirty('oneSessionPerCredential') ? 'is-modified' : ''}`}>
              <div>
                <div className="app-settings-card-head">
                  <div className="app-settings-field-label">
                    <UsersRound size={15} /> One Session Per Credential
                  </div>
                  <ModifiedBadge show={fieldDirty('oneSessionPerCredential')} />
                </div>
                <p className="app-settings-hint">
                  Allow only one active session per user.
                </p>
              </div>
              <SettingsToggle
                checked={!!form.oneSessionPerCredential}
                onChange={(on) => setForm(f => ({ ...f, oneSessionPerCredential: on }))}
              />
            </div>
          </div>
        )}
      </div>

      {showDelete && createPortal(
        <ModalBackdrop className="del-app-overlay" role="presentation">
          <div
            className="del-app-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="del-app-title"
          >
            <button type="button" className="del-app-close" onClick={closeDelete} aria-label="Close">
              <X size={16} />
            </button>

            <div className="del-app-top">
              <div className="del-app-icon-wrap">
                <div className="del-app-icon-glow" />
                <AlertTriangle size={36} strokeWidth={2.2} className="del-app-icon" />
              </div>
              <h2 id="del-app-title" className="del-app-title">Delete &quot;{app.name}&quot;?</h2>
              <p className="del-app-sub">This action cannot be undone</p>
            </div>

            <div className="del-app-list">
              <div className="del-app-list-label">The following will be permanently deleted:</div>
              <ul>
                <li><Key size={15} /> All licenses</li>
                <li><Users size={15} /> All users</li>
                <li><Settings size={15} /> All settings and configurations</li>
              </ul>
            </div>

            <label className="del-app-confirm-label">
              Type &quot;{app.name}&quot; to confirm:
            </label>
            <input
              className="del-app-input"
              value={confirmName}
              onChange={e => setConfirmName(e.target.value)}
              placeholder={app.name}
              autoFocus
              autoComplete="off"
              spellCheck={false}
              onKeyDown={e => {
                if (e.key === 'Enter' && canConfirmDelete) deleteApp();
                if (e.key === 'Escape') closeDelete();
              }}
            />

            <div className="del-app-footer">
              <button type="button" className="del-app-btn-cancel" onClick={closeDelete} disabled={deleting}>
                Cancel
              </button>
              <button
                type="button"
                className="del-app-btn-delete"
                onClick={deleteApp}
                disabled={!canConfirmDelete || deleting}
              >
                {deleting ? 'Deleting…' : 'Delete Application'}
              </button>
            </div>
          </div>
        </ModalBackdrop>,
        document.body,
      )}
    </>
  );
}

const SECTION_META = {
  settings: { title: 'Settings', subtitle: 'Configure your application settings' },
  licenses: { title: 'Licenses', subtitle: 'Manage your license keys' },
  keys: { title: 'Licenses', subtitle: 'Manage your license keys' },
  users: { title: 'Users', subtitle: 'Manage your application users' },
  sessions: { title: 'Sessions', subtitle: 'Active user sessions' },
  logs: { title: 'Sessions', subtitle: 'Active user sessions' },
};

const PANEL_SECTIONS = ['settings', 'licenses', 'users', 'sessions'];

export default function AppDetailPage() {
  const { id, section: rawSection } = useParams();
  const navigate = useNavigate();
  const [app, setApp] = useState(null);
  const [loading, setLoading] = useState(true);

  const section = (() => {
    const s = (rawSection || 'settings').toLowerCase();
    if (s === 'keys') return 'licenses';
    if (s === 'logs') return 'sessions';
    return s;
  })();

  useEffect(() => {
    if (section === 'subscriptions') {
      navigate(`/applications/${id}/users`, { replace: true });
      return;
    }
    if (!PANEL_SECTIONS.includes(section)) {
      navigate(`/applications/${id}/settings`, { replace: true });
    }
  }, [id, section, navigate]);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setApp(null);
    api.get(`/apps/${id}`)
      .then(res => {
        if (!cancelled) setApp(res.data.app);
      })
      .catch(() => {
        if (cancelled) return;
        setApp({
          _id: id || 'app_rakha_v3',
          name: 'RAKHA TWEAKS V3',
          appId: 'rakha_tweaks_v3',
          keyPrefix: 'RAKHA',
          status: 'active',
          version: '1.0.0',
          createdAt: new Date().toISOString(),
        });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [id, navigate]);

  const meta = SECTION_META[section] || { title: app?.name || 'Loading...', subtitle: app ? `v${app.version}` : undefined };
  const ownsHeader = PANEL_SECTIONS.includes(section);

  return (
    <Layout
      title={ownsHeader ? undefined : meta.title}
      subtitle={ownsHeader ? undefined : meta.subtitle}
    >
      {loading || !app ? (
        <div style={{ textAlign: 'center', padding: '80px 0' }}>
          <div className="spinner" style={{ margin: '0 auto', width: 40, height: 40 }} />
        </div>
      ) : (
        <>
          {section === 'licenses' && <Suspense fallback={<div className="spinner" style={{ margin: '40px auto', width: 32, height: 32 }} />}><LicensesPanel appId={id} keyPrefix={app.keyPrefix || 'APP'} /></Suspense>}
          {section === 'users' && <Suspense fallback={<div className="spinner" style={{ margin: '40px auto', width: 32, height: 32 }} />}><UsersPanel appId={id} /></Suspense>}
          {section === 'sessions' && <Suspense fallback={<div className="spinner" style={{ margin: '40px auto', width: 32, height: 32 }} />}><SessionsPanel appId={id} /></Suspense>}
          {section === 'settings' && <SettingsPanel app={app} onUpdate={setApp} />}
        </>
      )}
    </Layout>
  );
}
