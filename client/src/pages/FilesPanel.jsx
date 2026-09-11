import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useDangerConfirm } from '../components/DangerConfirm';
import ModalBackdrop from '../components/ModalBackdrop';
import {
  Trash2, RefreshCw, Ban, ShieldCheck, Link2, Plus, X, Search, Pencil,
} from 'lucide-react';

function isStrongPassword(password) {
  if (!password || password.length < 10) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
}

function LinkFormModal({ open, mode, initial, busy, envManaged, onCancel, onSubmit }) {
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [password, setPassword] = useState('');

  useEffect(() => {
    if (!open) return;
    setName(initial?.name || '');
    setUrl('');
    setPassword('');
  }, [open, initial]);

  if (!open) return null;

  const isEdit = mode === 'edit';
  const submit = (e) => {
    e.preventDefault();
    onSubmit?.({
      name: name.trim(),
      url: url.trim(),
      password,
    });
  };

  return createPortal(
    <ModalBackdrop className="edit-lic-overlay" onDismiss={() => !busy && onCancel?.()} role="presentation">
      <div
        className="edit-lic-modal usr-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="link-form-title"
      >
        <button type="button" className="edit-lic-close" onClick={onCancel} disabled={busy} aria-label="Close">
          <X size={16} />
        </button>

        <div className="edit-lic-top usr-create-top">
          <div className="usr-create-icon-wrap" aria-hidden="true">
            <span className="usr-create-icon-glow" />
            {isEdit
              ? <Pencil size={28} strokeWidth={2} className="usr-create-icon" />
              : <Link2 size={28} strokeWidth={2} className="usr-create-icon" />}
          </div>
          <h2 id="link-form-title" className="edit-lic-title">
            {isEdit ? 'Edit Link' : 'Create Link'}
          </h2>
          <p className="usr-create-sub">
            {envManaged
              ? 'Link and archive password are set in Render — not here'
              : (isEdit
                ? 'Update name, link, or archive password'
                : 'Add a download link for signed-in clients')}
          </p>
        </div>

        <form onSubmit={submit} className="edit-lic-form usr-create-form" autoComplete="off">
          <div className="edit-lic-field">
            <label htmlFor="link-form-name">Name</label>
            <input
              id="link-form-name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={busy}
              autoFocus
              required
              maxLength={64}
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          {!envManaged && (
            <>
              <div className="edit-lic-field">
                <label htmlFor="link-form-url">Link{isEdit ? ' (leave empty to keep)' : ''}</label>
                <input
                  id="link-form-url"
                  value={url}
                  onChange={e => setUrl(e.target.value)}
                  disabled={busy}
                  required={!isEdit}
                  autoComplete="off"
                  spellCheck={false}
                />
              </div>

              <div className="edit-lic-field">
                <label htmlFor="link-form-pass">Password{isEdit ? ' (leave empty to keep)' : ''}</label>
                <input
                  id="link-form-pass"
                  type="password"
                  value={password}
                  onChange={e => setPassword(e.target.value)}
                  disabled={busy}
                  required={!isEdit}
                  minLength={isEdit ? undefined : 10}
                  autoComplete="new-password"
                />
              </div>
            </>
          )}

          <div className="edit-lic-footer">
            <button type="button" className="edit-lic-cancel" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="edit-lic-save" disabled={busy}>
              {isEdit
                ? <Pencil size={15} strokeWidth={2.25} />
                : <Plus size={15} strokeWidth={2.25} />}
              {busy ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Link')}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>,
    document.body
  );
}

export default function FilesPanel({ appId }) {
  const { ask, modal: dangerModal } = useDangerConfirm();
  const [files, setFiles] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [envPackManaged, setEnvPackManaged] = useState(false);
  const [envPackHost, setEnvPackHost] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/apps/${appId}/files`)
      .then(res => {
        setFiles(res.data.files || []);
        setEnvPackManaged(Boolean(res.data.envPackManaged));
        setEnvPackHost(String(res.data.envPackHost || ''));
      })
      .catch(err => toast.error(err.response?.data?.message || 'Failed to load links'))
      .finally(() => setLoading(false));
  }, [appId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [files]);

  const validatePayload = ({ name, url, password }, { requireUrl, requirePassword }) => {
    const logicalName = String(name || '').replace(/[^A-Za-z0-9._-]/g, '');
    if (!logicalName) {
      toast.error('Give the link a name using letters, numbers, dot, dash or underscore');
      return null;
    }
    if (requireUrl || url) {
      if (!url || !/^https:\/\//i.test(url)) {
        toast.error('The download link must start with https://');
        return null;
      }
    }
    if (requirePassword || password) {
      if (!isStrongPassword(password)) {
        toast.error('Archive password must be 10+ chars with upper, lower, number, symbol');
        return null;
      }
    }
    return { name: logicalName, url, password };
  };

  const createLink = async (raw) => {
    const payload = validatePayload(raw, { requireUrl: true, requirePassword: true });
    if (!payload) return;
    setFormBusy(true);
    try {
      const res = await api.post(`/apps/${appId}/files/link`, payload);
      toast.success(res.data.replaced ? `${payload.name} updated` : `${payload.name} added`);
      setShowCreate(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save the link');
    } finally {
      setFormBusy(false);
    }
  };

  const saveEdit = async (raw) => {
    if (!editTarget?._id) return;
    const payload = validatePayload(raw, {
      requireUrl: false,
      requirePassword: false,
    });
    if (!payload) return;

    const body = { name: payload.name };
    if (payload.url) body.url = payload.url;
    if (payload.password) body.password = payload.password;

    setFormBusy(true);
    try {
      await api.put(`/apps/${appId}/files/${editTarget._id}`, body);
      toast.success('Link updated');
      setEditTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update the link');
    } finally {
      setFormBusy(false);
    }
  };

  const toggleStatus = async (file) => {
    const next = file.status === 'active' ? 'disabled' : 'active';
    try {
      await api.put(`/apps/${appId}/files/${file._id}`, { status: next });
      toast.success(next === 'active' ? 'Enabled' : 'Disabled');
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Update failed');
    }
  };

  const remove = (file) => {
    ask({
      title: `Delete ${file.name}?`,
      subtitle: 'Clients will stop receiving this link',
      icon: 'warn',
      facts: [
        { icon: 'key', text: 'The link and password are removed from the server' },
        { icon: 'file', text: 'Any client asking for it will get a not-found error' },
      ],
      confirmLabel: 'Delete',
      action: async () => {
        await api.delete(`/apps/${appId}/files/${file._id}`);
        toast.success('Deleted');
        load();
      },
    });
  };

  const q = searchInput.trim().toLowerCase();
  const visible = q
    ? files.filter(f =>
      String(f.name || '').toLowerCase().includes(q)
      || String(f.remoteHost || '').toLowerCase().includes(q))
    : files;

  const allChecked = visible.length > 0 && visible.every(f => selected.has(f._id));
  const someChecked = selected.size > 0;

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(visible.map(f => f._id)));
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const deleteSelected = () => {
    const n = selected.size;
    if (!n) return;
    ask({
      title: `Delete ${n} link${n === 1 ? '' : 's'}?`,
      subtitle: 'Selected links will be removed',
      icon: 'warn',
      facts: [
        { icon: 'key', text: 'Links and passwords are removed from the server' },
        { icon: 'file', text: 'Clients will no longer receive these names' },
      ],
      confirmLabel: 'Delete selected',
      action: async () => {
        const res = await api.post(`/apps/${appId}/files/delete-selected`, {
          ids: Array.from(selected),
        });
        toast.success(`Deleted ${res.data.deleted || n}`);
        setSelected(new Set());
        load();
      },
    });
  };

  return (
    <div className="lic-page usr-page">
      {dangerModal}

      <LinkFormModal
        open={showCreate}
        mode="create"
        envManaged={envPackManaged}
        busy={formBusy}
        onCancel={() => !formBusy && setShowCreate(false)}
        onSubmit={createLink}
      />

      <LinkFormModal
        open={!!editTarget}
        mode="edit"
        initial={editTarget}
        envManaged={envPackManaged}
        busy={formBusy}
        onCancel={() => !formBusy && setEditTarget(null)}
        onSubmit={saveEdit}
      />

      <div className="lic-head">
        <div className="lic-head-left panel-page-heading">
          <h1 className="lic-title">Links</h1>
          <p className="lic-sub">
            {envPackManaged
              ? `Package URL is in Render (${envPackHost || 'REMOTE_PACKAGE_*'})`
              : 'Download links released after a valid key'}
          </p>
        </div>
        <div className="lic-head-right">
          {someChecked && (
            <button type="button" className="lic-btn-create lnk-btn-danger" onClick={deleteSelected}>
              <Trash2 size={15} strokeWidth={2.5} /> Delete ({selected.size})
            </button>
          )}
          {!envPackManaged && (
            <button type="button" className="lic-btn-create" onClick={() => setShowCreate(true)}>
              <Plus size={15} strokeWidth={2.5} /> Create Link
            </button>
          )}
        </div>
      </div>

      <div className="lic-toolbar usr-toolbar">
        <div className="lic-search">
          <Search size={15} />
          <input
            placeholder="Search links..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <div className="lic-toolbar-right">
          <button type="button" className="lnk-refresh-btn" onClick={load} disabled={loading}>
            <RefreshCw size={14} /> Refresh
          </button>
        </div>
      </div>

      <div className="sa-box lic-table-card">
        <div className="lic-table-scroll">
          <table className="lic-table lnk-table">
            <colgroup>
              <col className="lnk-col-check" />
              <col className="lnk-col-name" />
              <col className="lnk-col-host" />
              <col className="lnk-col-dl" />
              <col className="lnk-col-status" />
              <col className="lnk-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="lic-check-col">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </th>
                <th>Name</th>
                <th>Host</th>
                <th>Downloads</th>
                <th>Status</th>
                <th className="lic-actions-col" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} className="lic-empty">Loading...</td></tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={6} className="lic-empty">
                    {files.length === 0 ? 'No links yet. Create your first link.' : 'No matching links.'}
                  </td>
                </tr>
              ) : (
                visible.map(f => (
                  <tr
                    key={f._id}
                    className={`${f.status === 'disabled' ? 'is-muted' : ''} ${selected.has(f._id) ? 'selected' : ''}`}
                  >
                    <td className="lic-check-col">
                      <input
                        type="checkbox"
                        checked={selected.has(f._id)}
                        onChange={() => toggleOne(f._id)}
                      />
                    </td>
                    <td>
                      <span className="lnk-name">{f.name}</span>
                    </td>
                    <td>
                      <span className="lnk-host" title={envPackManaged ? envPackHost : (f.remoteHost || '')}>
                        {envPackManaged ? (envPackHost || 'Render') : (f.remoteHost || '—')}
                      </span>
                    </td>
                    <td className="lnk-dl">{f.downloads || 0}</td>
                    <td>
                      <span className={`lic-status lnk-status ${f.status === 'active' ? 'lic-status-active' : 'lic-status-banned'}`}>
                        {f.status === 'active' ? 'Active' : 'Disabled'}
                      </span>
                    </td>
                    <td className="lic-actions-col">
                      <div className="lnk-actions">
                        <button
                          type="button"
                          className="lnk-icon-btn"
                          title="Edit"
                          onClick={() => setEditTarget(f)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="lnk-icon-btn"
                          title={f.status === 'active' ? 'Disable' : 'Enable'}
                          onClick={() => toggleStatus(f)}
                        >
                          {f.status === 'active' ? <Ban size={14} /> : <ShieldCheck size={14} />}
                        </button>
                        <button
                          type="button"
                          className="lnk-icon-btn lnk-icon-btn--danger"
                          title="Delete"
                          onClick={() => remove(f)}
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
