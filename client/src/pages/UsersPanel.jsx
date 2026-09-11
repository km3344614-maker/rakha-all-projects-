import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';
import { formatEgyptDateTimeShort } from '../utils/datetime';
import toast from 'react-hot-toast';
import { useDangerConfirm } from '../components/DangerConfirm';
import ModalBackdrop from '../components/ModalBackdrop';
import {
  Plus, Trash2, X, Ban, ShieldCheck, Search, ChevronDown,
  MoreVertical, Check, RotateCcw, ListFilter, UserPlus, User,
  CreditCard, Eye, EyeOff, Copy,
} from 'lucide-react';
import { PAGE_LIMIT } from '../constants/pagination';
import { formatLicenseKeyDisplay } from '../utils/licenseKeyDisplay';

function statusLabel(status) {
  if (!status) return '—';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function displayIp(ip) {
  const v = String(ip || '').trim();
  if (!v) return '—';
  if (v === '::1') return '127.0.0.1';
  return v.replace(/^::ffff:/i, '');
}

function userKeyRaw(u) {
  return u?.licenseKey?.key || u?.username || '';
}

function userKey(u) {
  return formatLicenseKeyDisplay(userKeyRaw(u));
}

function userPcName(u) {
  return String(u?.pcName || '').trim();
}

function shortHwid(value) {
  const s = String(value || '');
  if (!s) return 'N/A';
  if (s.length <= 16) return s;
  return `${s.slice(0, 8)}…${s.slice(-4)}`;
}

function HwidChip({ value }) {
  const [copied, setCopied] = useState(false);
  if (!value) return <span className="lic-muted">N/A</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error('Copy failed');
    }
  };
  return (
    <button
      type="button"
      className={`usr-hwid-pill usr-hwid-chip ${copied ? 'is-copied' : ''}`}
      onClick={copy}
      title={copied ? 'Copied' : value}
    >
      <span aria-hidden={copied}>{copied ? 'Copied' : shortHwid(value)}</span>
    </button>
  );
}

function KeyChip({ value, copyValue }) {
  const [copied, setCopied] = useState(false);
  const raw = copyValue ?? value;
  if (!value) return <span className="lic-muted">—</span>;
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1200);
    } catch {
      toast.error('Copy failed');
    }
  };
  return (
    <button
      type="button"
      className={`lic-key-chip ${copied ? 'is-copied' : ''}`}
      onClick={copy}
      title={copied ? 'Copied' : raw}
    >
      <span className="lic-key-chip-label" aria-hidden={copied}>{value}</span>
      {copied && <span className="lic-key-chip-copied">Copied</span>}
    </button>
  );
}

function usePopPosition(open, anchorRef, width = 220) {
  const [style, setStyle] = useState({});
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const pad = 8;
    const w = typeof width === 'number' ? width : (rect.width || 220);
    let left = rect.right - w;
    if (left < pad) left = pad;
    if (left + w > window.innerWidth - pad) left = window.innerWidth - w - pad;
    let top = rect.bottom + 6;
    const approxH = 180;
    if (top + approxH > window.innerHeight - pad) {
      top = Math.max(pad, rect.top - approxH - 6);
    }
    setStyle({ position: 'fixed', top, left, width: w, zIndex: 12000 });
  }, [open, anchorRef, width]);
  return style;
}

function useBesidePosition(open, anchorRef, width = 148) {
  const [style, setStyle] = useState({});
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const pad = 8;
    const gap = 8;
    const approxH = 140;
    let left = rect.left - width - gap;
    if (left < pad) left = rect.right + gap;
    if (left + width > window.innerWidth - pad) left = Math.max(pad, window.innerWidth - width - pad);
    let top = rect.top;
    if (top + approxH > window.innerHeight - pad) {
      top = Math.max(pad, window.innerHeight - approxH - pad);
    }
    if (top < pad) top = pad;
    setStyle({ position: 'fixed', top, left, width, zIndex: 12000 });
  }, [open, anchorRef, width]);
  return style;
}

function FiltersMenu({ status, onChange }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const style = usePopPosition(open, btnRef, 168);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  useEffect(() => {
    document.body.classList.toggle('sa-dd-open', open);
    return () => document.body.classList.remove('sa-dd-open');
  }, [open]);

  const options = [
    { value: '', label: 'All statuses' },
    { value: 'active', label: 'Active' },
    { value: 'banned', label: 'Banned' },
    { value: 'expired', label: 'Expired' },
  ];

  return (
    <div className="lic-delete-wrap">
      <button
        ref={btnRef}
        type="button"
        className={`lic-btn-filters ${open || status ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <ListFilter size={13} />
        Filters
        {status ? <em className="lic-filters-badge">1</em> : null}
        <ChevronDown size={12} className={open ? 'lic-dd-chevron-up' : ''} />
      </button>
      {open && createPortal(
        <div className="lic-dd-pop lic-filters-pop lic-pop-portal" ref={popRef} style={style}>
          {options.map(opt => (
            <button
              key={opt.value || 'all'}
              type="button"
              className={status === opt.value ? 'active' : ''}
              onClick={() => {
                onChange(opt.value);
                setOpen(false);
              }}
            >
              <span>{opt.label}</span>
              {status === opt.value && <Check size={13} strokeWidth={2.5} />}
            </button>
          ))}
        </div>,
        document.body,
      )}
    </div>
  );
}

function RowMenu({ user, onResetHwid, onBan, onUnban, onDelete }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const style = useBesidePosition(open, btnRef, 160);

  useEffect(() => {
    if (!open) return;
    const close = (e) => {
      if (btnRef.current?.contains(e.target) || popRef.current?.contains(e.target)) return;
      setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  return (
    <div className="lic-row-menu">
      <button
        ref={btnRef}
        type="button"
        className={`lic-dots ${open ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-label="Actions"
        aria-expanded={open}
      >
        <MoreVertical size={15} />
      </button>
      {open && createPortal(
        <div className="lic-menu-pop lic-pop-portal" ref={popRef} style={style}>
          <button type="button" onClick={() => { setOpen(false); onResetHwid(user._id); }}>
            <RotateCcw size={14} /> Reset HWID
          </button>
          {user.status !== 'banned' ? (
            <button type="button" className="warn" onClick={() => { setOpen(false); onBan(user._id); }}>
              <Ban size={14} /> Ban
            </button>
          ) : (
            <button type="button" className="ok" onClick={() => { setOpen(false); onUnban(user._id); }}>
              <ShieldCheck size={14} /> Unban
            </button>
          )}
          <button type="button" className="danger" onClick={() => { setOpen(false); onDelete(user._id); }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function isStrongPassword(password) {
  if (!password || password.length < 10) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

const PASSWORD_HINT = 'Password must be 10+ chars with upper, lower, number, and symbol';

function CreateUserModal({ open, busy, onCancel, onCreate }) {
  const [accountType, setAccountType] = useState('standard');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);

  useEffect(() => {
    if (!open) return;
    setAccountType('standard');
    setUsername('');
    setPassword('');
    setShowPass(false);
  }, [open]);

  if (!open) return null;

  const submit = (e) => {
    e.preventDefault();
    if (accountType === 'standard' && !isStrongPassword(password)) {
      toast.error(PASSWORD_HINT);
      return;
    }
    onCreate?.({
      accountType,
      username: username.trim(),
      password: accountType === 'license' ? '' : password,
    });
  };

  return createPortal(
    <ModalBackdrop className="edit-lic-overlay" onDismiss={() => !busy && onCancel?.()} role="presentation">
      <div
        className="edit-lic-modal usr-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-user-title"
      >
        <button type="button" className="edit-lic-close" onClick={onCancel} disabled={busy} aria-label="Close">
          <X size={16} />
        </button>

        <div className="edit-lic-top usr-create-top">
          <div className="usr-create-icon-wrap" aria-hidden="true">
            <span className="usr-create-icon-glow" />
            <UserPlus size={28} strokeWidth={2} className="usr-create-icon" />
          </div>
          <h2 id="create-user-title" className="edit-lic-title">Create User</h2>
          <p className="usr-create-sub">Add a new user to your application</p>
        </div>

        <form onSubmit={submit} className="edit-lic-form usr-create-form" autoComplete="off">
          <div className="usr-create-section">
            <div className="usr-create-section-label">
              <User size={14} /> Account Type
            </div>
            <div className="usr-acct-toggle" role="group" aria-label="Account type">
              <button
                type="button"
                className={`usr-acct-btn ${accountType === 'standard' ? 'active' : ''}`}
                onClick={() => setAccountType('standard')}
                disabled={busy}
              >
                <User size={15} />
                Standard User
              </button>
              <button
                type="button"
                className={`usr-acct-btn ${accountType === 'license' ? 'active' : ''}`}
                onClick={() => setAccountType('license')}
                disabled={busy}
              >
                <CreditCard size={15} />
                License User
              </button>
            </div>
            <p className="usr-create-hint">
              {accountType === 'license'
                ? 'Creates a bound license key. Client logs in with that key (key as username and password).'
                : 'Standard users log in with username and password'}
            </p>
          </div>

          <div className="edit-lic-field">
            <label htmlFor="create-user-name">Username</label>
            <input
              id="create-user-name"
              name="sa-create-username"
              value={username}
              onChange={e => setUsername(e.target.value)}
              disabled={busy}
              autoFocus
              required
              minLength={2}
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {accountType === 'standard' && (
            <div className="edit-lic-field">
              <label htmlFor="create-user-pass">Password</label>
              <div className="usr-pass-wrap">
                <input
                  id="create-user-pass"
                  name="sa-create-password"
                  type={showPass ? 'text' : 'password'}
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={busy}
                  required
                  minLength={10}
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="usr-pass-eye"
                  onClick={() => setShowPass(v => !v)}
                  tabIndex={-1}
                  aria-label={showPass ? 'Hide password' : 'Show password'}
                >
                  {showPass ? <EyeOff size={16} /> : <Eye size={16} />}
                </button>
              </div>
              <p className="usr-create-hint">{PASSWORD_HINT}</p>
            </div>
          )}

          <div className="edit-lic-footer">
            <button type="button" className="edit-lic-cancel" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="edit-lic-save" disabled={busy}>
              <UserPlus size={15} strokeWidth={2.25} />
              {busy ? 'Creating…' : 'Create User'}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

export default function UsersPanel({ appId }) {
  const { ask, modal: dangerModal } = useDangerConfirm();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [status, setStatus] = useState('');
  const [selected, setSelected] = useState(() => new Set());
  const [showCreate, setShowCreate] = useState(false);
  const [createBusy, setCreateBusy] = useState(false);

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim());
      setPage(1);
    }, 280);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  useEffect(() => { setPage(1); }, [status]);

  const load = () => {
    setLoading(true);
    const q = new URLSearchParams({ page: String(page), limit: String(PAGE_LIMIT) });
    if (search) q.set('search', search);
    if (status) q.set('status', status);
    api.get(`/apps/${appId}/users?${q}`)
      .then(res => {
        setUsers(res.data.users || []);
        setTotal(res.data.total || 0);
        setSelected(new Set());
      })
      .catch(() => {
        setUsers([]);
        setTotal(0);
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(); }, [appId, page, search, status]);

  const allChecked = users.length > 0 && users.every(u => selected.has(u._id));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(users.map(u => u._id)));
  };
  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const createUser = async (payload) => {
    setCreateBusy(true);
    try {
      const res = await api.post(`/apps/${appId}/users`, payload);
      const key = res.data?.licenseKey || res.data?.user?.licenseKey?.key;
      if (key) {
        try {
          await navigator.clipboard.writeText(key);
          toast.success(`User created — license key copied`);
        } catch {
          toast.success(`User created — key: ${key}`);
        }
      } else {
        toast.success('User created');
      }
      setShowCreate(false);
      setPage(1);
      await load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create');
    } finally {
      setCreateBusy(false);
    }
  };

  const updateUser = async (id, data) => {
    try {
      await api.put(`/apps/${appId}/users/${id}`, data);
      toast.success('Updated');
      load();
    } catch {
      toast.error('Failed');
    }
  };

  const resetHwid = (id) => {
    const user = users.find(u => u._id === id);
    ask({
      title: 'Reset HWID?',
      subtitle: userKey(user) ? `Key: ${userKey(user)}` : 'This action cannot be undone',
      icon: 'warn',
      facts: [
        { icon: 'key', text: 'Bound and pending hardware IDs will be cleared' },
        { icon: 'file', text: 'Active session will be killed immediately' },
      ],
      warning: 'Close the old program first. The next login on a new device will bind a new HWID. Expiry time is unchanged.',
      confirmLabel: 'Reset HWID',
      action: async () => {
        await api.post(`/apps/${appId}/users/${id}/reset-hwid`);
        setUsers(prev => prev.map(u => (u._id === id ? { ...u, hwid: null } : u)));
        toast.success(userKey(user) ? `HWID reset for ${userKey(user)}` : 'HWID reset');
        await load();
      },
    });
  };

  const banUser = (id) => {
    const user = users.find(u => u._id === id);
    ask({
      title: 'Ban this user?',
      subtitle: userKey(user) ? `Key: ${userKey(user)}` : 'Access will be blocked',
      icon: 'warn',
      facts: [{ icon: 'file', text: 'User will lose access immediately' }],
      warning: 'Banned users cannot authenticate until you unban them.',
      confirmLabel: 'Ban user',
      action: async () => {
        await api.put(`/apps/${appId}/users/${id}`, { status: 'banned' });
        toast.success('User banned');
        load();
      },
    });
  };

  const deleteUser = (id) => {
    const user = users.find(u => u._id === id);
    ask({
      title: 'Delete this user?',
      subtitle: 'This action cannot be undone',
      keys: userKeyRaw(user) ? [userKey(user)] : [],
      warning: 'The user account and related session data will be permanently deleted.',
      confirmLabel: 'Delete user',
      action: async () => {
        await api.delete(`/apps/${appId}/users/${id}`);
        toast.success('User deleted');
        load();
      },
    });
  };

  const someChecked = selected.size > 0;
  const deleteSelected = () => {
    if (!someChecked) return;
    const n = selected.size;
    ask({
      title: n === 1 ? 'Delete 1 user?' : `Delete ${n} users?`,
      subtitle: 'This action cannot be undone',
      warning: 'Selected accounts and their sessions will be permanently deleted.',
      confirmLabel: n === 1 ? 'Delete 1 user' : `Delete ${n} users`,
      action: async () => {
        const res = await api.post(`/apps/${appId}/users/delete-selected`, {
          ids: Array.from(selected),
        });
        toast.success(`Deleted ${res.data.deleted}`);
        load();
      },
    });
  };

  return (
    <div className="lic-page usr-page">
      {dangerModal}

      <CreateUserModal
        open={showCreate}
        busy={createBusy}
        onCancel={() => !createBusy && setShowCreate(false)}
        onCreate={createUser}
      />

      <div className="lic-head">
        <div className="lic-head-left panel-page-heading">
          <h1 className="lic-title">Users</h1>
          <p className="lic-sub">Manage your application users</p>
        </div>
        <div className="lic-head-right">
          <button type="button" className="lic-btn-create" onClick={() => setShowCreate(true)}>
            <Plus size={15} strokeWidth={2.5} /> Create User
          </button>
        </div>
      </div>

      <div className="lic-toolbar usr-toolbar">
        <div className="lic-search">
          <Search size={15} />
          <input
            placeholder="Search by key, PC name, IP, HWID..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <div className="lic-toolbar-right">
          {someChecked && (
            <button type="button" className="lic-btn-delete" onClick={deleteSelected}>
              <Trash2 size={13} /> Delete
            </button>
          )}
          <FiltersMenu
            status={status}
            onChange={setStatus}
          />
        </div>
      </div>

      <div className="sa-box lic-table-card">
        <div className="lic-table-scroll">
          <table className="lic-table">
            <thead>
              <tr>
                <th className="lic-check-col">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </th>
                <th>Key</th>
                <th>PC Name</th>
                <th>IP Address</th>
                <th>HWID</th>
                <th>Last Login</th>
                <th>Status</th>
                <th className="lic-actions-col" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="lic-empty">Loading...</td>
                </tr>
              ) : users.length === 0 ? (
                <tr>
                  <td colSpan={8} className="lic-empty">No users yet. Create your first user.</td>
                </tr>
              ) : (
                users.map(u => (
                  <tr key={u._id} className={selected.has(u._id) ? 'selected' : ''}>
                    <td className="lic-check-col">
                      <input
                        type="checkbox"
                        checked={selected.has(u._id)}
                        onChange={() => toggleOne(u._id)}
                      />
                    </td>
                    <td>
                      <KeyChip value={userKey(u)} copyValue={userKeyRaw(u)} />
                    </td>
                    <td>
                      {userPcName(u) ? (
                        <span className="usr-name-plain">{userPcName(u)}</span>
                      ) : (
                        <span className="lic-muted">—</span>
                      )}
                    </td>
                    <td className="lic-muted">{displayIp(u.lastIp || u.ip)}</td>
                    <td>
                      <HwidChip value={u.hwid} />
                    </td>
                    <td className="usr-last-login" title="Egypt time (Africa/Cairo)">
                      {formatEgyptDateTimeShort(u.lastLogin)}
                    </td>
                    <td>
                      <span className={`lic-status lic-status-${u.status}`}>
                        {statusLabel(u.status)}
                      </span>
                    </td>
                    <td className="lic-actions-col">
                      <RowMenu
                        user={u}
                        onResetHwid={resetHwid}
                        onBan={banUser}
                        onUnban={(id) => updateUser(id, { status: 'active' })}
                        onDelete={deleteUser}
                      />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="lic-footer">
          <span>
            Showing {users.length} of {total} user{total !== 1 ? 's' : ''}
          </span>
          {total > PAGE_LIMIT && (
            <div className="lic-pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>{page} / {Math.ceil(total / PAGE_LIMIT)}</span>
              <button
                type="button"
                disabled={page >= Math.ceil(total / PAGE_LIMIT)}
                onClick={() => setPage(p => p + 1)}
              >
                Next
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
