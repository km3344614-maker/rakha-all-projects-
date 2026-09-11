import { useRef, useState } from 'react';
import Layout from '../components/Layout';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { fileToAvatarDataUrl } from '../utils/avatar';
import toast from 'react-hot-toast';
import {
  User, Shield, KeyRound, Pencil, Monitor, Lock, Copy, Check, Camera, Trash2,
} from 'lucide-react';

const TABS = [
  { id: 'account', label: 'Account', icon: User },
  { id: 'security', label: 'Security', icon: Shield },
];

function InfoRow({ icon: Icon, label, value, trailing = null, copyable = false }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    if (!value || !copyable) return;
    try {
      await navigator.clipboard.writeText(String(value));
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
      toast.success('Copied');
    } catch {
      toast.error('Copy failed');
    }
  };

  return (
    <div className={`settings-row ${copyable ? 'is-copyable' : ''}`}>
      <div className="settings-row-icon" aria-hidden="true">
        <Icon size={17} strokeWidth={2} />
      </div>
      <div className="settings-row-body">
        <div className="settings-row-label">{label}</div>
        <div className="settings-row-value" title={value || '—'}>{value || '—'}</div>
      </div>
      {trailing}
      {copyable && value ? (
        <button type="button" className="settings-row-copy" onClick={copy} title="Copy">
          {copied ? <Check size={14} strokeWidth={2.5} /> : <Copy size={14} />}
        </button>
      ) : null}
    </div>
  );
}

export default function ProfilePage() {
  const { user, logout, updateUser } = useAuth();
  const [tab, setTab] = useState('account');
  const [showPass, setShowPass] = useState(false);
  const [passForm, setPassForm] = useState({ current: '', next: '', confirm: '' });
  const [saving, setSaving] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const fileRef = useRef(null);

  const onPickAvatar = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setAvatarBusy(true);
    try {
      const image = await fileToAvatarDataUrl(file);
      const res = await api.put('/auth/avatar', { image });
      if (res.data?.user) updateUser(res.data.user);
      toast.success('Profile photo updated');
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Upload failed');
    } finally {
      setAvatarBusy(false);
    }
  };

  const removeAvatar = async () => {
    setAvatarBusy(true);
    try {
      const res = await api.delete('/auth/avatar');
      if (res.data?.user) updateUser(res.data.user);
      toast.success('Profile photo removed');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to remove photo');
    } finally {
      setAvatarBusy(false);
    }
  };

  const revokeAll = async () => {
    try {
      await api.post('/auth/logout-all');
      toast.success('All sessions revoked');
      logout();
    } catch {
      toast.error('Failed to revoke sessions');
    }
  };

  const changePassword = async (e) => {
    e.preventDefault();
    if (!passForm.current) return toast.error('Enter your current password');
    if (passForm.next !== passForm.confirm) return toast.error('Passwords do not match');
    if (passForm.next.length < 10) {
      return toast.error('Password must be 10+ characters with upper, lower, number, and symbol');
    }
    setSaving(true);
    try {
      await api.put('/auth/password', {
        currentPassword: passForm.current,
        newPassword: passForm.next,
      });
      toast.success('Password updated');
      setShowPass(false);
      setPassForm({ current: '', next: '', confirm: '' });
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to update password');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Layout
      title="Account"
      subtitle="Manage your profile, password, and sessions"
    >
      <div className="settings-page">
        <div className="settings-tabs" role="tablist">
          {TABS.map((t) => {
            const Icon = t.icon;
            return (
              <button
                key={t.id}
                type="button"
                role="tab"
                aria-selected={tab === t.id}
                className={`settings-tab ${tab === t.id ? 'active' : ''}`}
                onClick={() => setTab(t.id)}
              >
                <Icon size={15} />
                {t.label}
              </button>
            );
          })}
        </div>

        {tab === 'account' && (
          <section className="settings-section">
            <div className="settings-hero sa-box">
              <button
                type="button"
                className={`settings-hero-avatar ${user?.avatarUrl ? 'has-photo' : ''}`}
                onClick={() => fileRef.current?.click()}
                disabled={avatarBusy}
                title={user?.avatarUrl ? 'Change photo' : 'Add photo'}
                aria-label="Change profile photo"
              >
                <span className="settings-hero-glow" />
                {user?.avatarUrl ? (
                  <img src={user.avatarUrl} alt="" className="settings-hero-avatar-img" />
                ) : (
                  <User size={28} strokeWidth={2} />
                )}
                <span className="settings-hero-avatar-overlay">
                  <Camera size={16} strokeWidth={2.25} />
                </span>
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="image/jpeg,image/png,image/webp"
                className="settings-avatar-input"
                onChange={onPickAvatar}
              />
              <div className="settings-hero-text">
                <div className="settings-hero-name">{user?.username || '—'}</div>
                {user?.avatarUrl ? (
                  <button
                    type="button"
                    className="settings-avatar-link"
                    onClick={removeAvatar}
                    disabled={avatarBusy}
                  >
                    <Trash2 size={12} />
                    Remove photo
                  </button>
                ) : null}
              </div>
              <span className="settings-hero-badge">Owner</span>
            </div>

            <div className="settings-block-head">
              <h3 className="settings-block-title">Account Information</h3>
              <p className="settings-block-desc">Username and role for this account</p>
            </div>

            <div className="settings-card sa-box">
              <InfoRow icon={User} label="Username" value={user?.username} copyable />
              <InfoRow
                icon={Shield}
                label="Role"
                value={user?.role || 'admin'}
                trailing={<span className="settings-pill">Owner</span>}
              />
            </div>
          </section>
        )}

        {tab === 'security' && (
          <section className="settings-section">
            <div className="settings-block-head">
              <h3 className="settings-block-title">Security</h3>
              <p className="settings-block-desc">Update your password and review active logins</p>
            </div>

            <div className="settings-card sa-box">
              <div className="settings-row">
                <div className="settings-row-icon" aria-hidden="true">
                  <KeyRound size={17} strokeWidth={2} />
                </div>
                <div className="settings-row-body">
                  <div className="settings-row-label">Password</div>
                  <div className="settings-row-value">Change your account password</div>
                </div>
                <button
                  type="button"
                  className="settings-action-btn"
                  onClick={() => setShowPass(v => !v)}
                >
                  <Pencil size={13} />
                  {showPass ? 'Cancel' : 'Change'}
                </button>
              </div>

              {showPass && (
                <form className="settings-pass-form" onSubmit={changePassword}>
                  <input
                    className="settings-input"
                    type="password"
                    placeholder="Current password"
                    value={passForm.current}
                    onChange={e => setPassForm({ ...passForm, current: e.target.value })}
                    required
                    autoComplete="current-password"
                  />
                  <input
                    className="settings-input"
                    type="password"
                    placeholder="New password"
                    value={passForm.next}
                    onChange={e => setPassForm({ ...passForm, next: e.target.value })}
                    required
                    autoComplete="new-password"
                  />
                  <input
                    className="settings-input"
                    type="password"
                    placeholder="Confirm password"
                    value={passForm.confirm}
                    onChange={e => setPassForm({ ...passForm, confirm: e.target.value })}
                    required
                    autoComplete="new-password"
                  />
                  <button type="submit" className="settings-save-btn" disabled={saving}>
                    <Lock size={14} />
                    {saving ? 'Saving…' : 'Save Password'}
                  </button>
                </form>
              )}
            </div>

            <div className="settings-block-head settings-block-head--spaced">
              <h3 className="settings-block-title">Active Sessions</h3>
              <p className="settings-block-desc">Where you’re signed in right now</p>
            </div>

            <div className="settings-card sa-box">
              <div className="settings-row">
                <div className="settings-row-icon" aria-hidden="true">
                  <Monitor size={17} strokeWidth={2} />
                </div>
                <div className="settings-row-body">
                  <div className="settings-row-label">Current session</div>
                  <div className="settings-row-value">
                    {user?.currentIp || user?.lastLoginIp || 'Unknown IP'}
                  </div>
                </div>
                <span className="settings-pill settings-pill--ok">Active</span>
              </div>
            </div>

            <button type="button" className="settings-danger-btn" onClick={revokeAll}>
              Revoke all sessions
            </button>
          </section>
        )}
      </div>
    </Layout>
  );
}
