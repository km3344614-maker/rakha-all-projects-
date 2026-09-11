import { useState, useEffect, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';
import { useDangerConfirm } from '../components/DangerConfirm';
import ModalBackdrop from '../components/ModalBackdrop';
import { formatEgyptDateTime } from '../utils/datetime';
import {
  Trash2, Plus, X, Search, Pencil, Code2, RefreshCw,
} from 'lucide-react';

const TYPES = [
  { id: 'string', label: 'String' },
  { id: 'number', label: 'Number' },
  { id: 'boolean', label: 'Boolean' },
  { id: 'json', label: 'JSON' },
];

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]*$/;

function previewValue(value) {
  const s = String(value ?? '');
  if (!s) return '—';
  if (s.length <= 42) return s;
  return `${s.slice(0, 40)}…`;
}

function prettyJson(raw) {
  try {
    return JSON.stringify(JSON.parse(raw), null, 2);
  } catch {
    return raw || '';
  }
}

function coerceValue(nextType, prev) {
  const text = String(prev ?? '').trim();
  if (nextType === 'boolean') {
    const v = text.toLowerCase();
    return v === 'true' || v === '1' ? 'true' : 'false';
  }
  if (nextType === 'number') {
    const n = Number(text);
    return Number.isFinite(n) ? String(n) : '';
  }
  if (nextType === 'json') {
    if (!text) return '';
    try {
      JSON.parse(text);
      return prettyJson(text);
    } catch {
      return '';
    }
  }
  if (text === 'true' || text === 'false') return '';
  return String(prev ?? '');
}

function validatePayload({ name, valueType, value }) {
  const n = String(name || '').trim();
  if (!NAME_RE.test(n)) {
    return { error: 'Name must start with a letter (letters, numbers, underscore)' };
  }
  if (valueType === 'number') {
    const num = Number(String(value || '').trim());
    if (!String(value || '').trim() || !Number.isFinite(num)) {
      return { error: 'Enter a valid number' };
    }
  }
  if (valueType === 'json' && String(value || '').trim()) {
    try {
      JSON.parse(value);
    } catch {
      return { error: 'Value must be valid JSON' };
    }
  }
  return { name: n, valueType, value };
}

function VariableFormModal({ open, mode, initial, busy, onCancel, onSubmit }) {
  const [name, setName] = useState('');
  const [valueType, setValueType] = useState('string');
  const [value, setValue] = useState('');
  const [authenticated, setAuthenticated] = useState(false);

  useEffect(() => {
    if (!open) return;
    const type = initial?.valueType || 'string';
    setName(initial?.name || '');
    setValueType(type);
    setValue(type === 'json' ? prettyJson(initial?.value || '') : (initial?.value ?? ''));
    setAuthenticated(!!initial?.authenticated);
  }, [open, initial]);

  if (!open) return null;

  const isEdit = mode === 'edit';
  const pickType = (next) => {
    setValue((prev) => coerceValue(next, prev));
    setValueType(next);
  };

  const submit = (e) => {
    e.preventDefault();
    const checked = validatePayload({ name, valueType, value });
    if (checked.error) {
      toast.error(checked.error);
      return;
    }
    onSubmit?.({
      name: checked.name,
      valueType,
      value: valueType === 'boolean' ? (value === 'true' ? 'true' : 'false') : value,
      authenticated,
    });
  };

  return createPortal(
    <ModalBackdrop className="edit-lic-overlay" onDismiss={() => !busy && onCancel?.()} role="presentation">
      <div
        className="edit-lic-modal usr-create-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="var-form-title"
      >
        <button type="button" className="edit-lic-close" onClick={onCancel} disabled={busy} aria-label="Close">
          <X size={16} />
        </button>

        <div className="edit-lic-top usr-create-top">
          <div className="usr-create-icon-wrap" aria-hidden="true">
            <span className="usr-create-icon-glow" />
            {isEdit
              ? <Pencil size={28} strokeWidth={2} className="usr-create-icon" />
              : <Code2 size={28} strokeWidth={2} className="usr-create-icon" />}
          </div>
          <h2 id="var-form-title" className="edit-lic-title">
            {isEdit ? 'Edit Variable' : 'Create Variable'}
          </h2>
          <p className="usr-create-sub">
            {isEdit ? (
              <>Editing <span className="var-name-tag">{initial?.name}</span></>
            ) : (
              'Add a global application variable'
            )}
          </p>
        </div>

        <form onSubmit={submit} className="edit-lic-form usr-create-form" autoComplete="off">
          <div className="edit-lic-field">
            <label htmlFor="var-form-name">Variable Name</label>
            <input
              id="var-form-name"
              value={name}
              onChange={e => setName(e.target.value)}
              disabled={busy}
              autoFocus
              required
              maxLength={64}
              placeholder="e.g. api_url, max_users"
              autoComplete="off"
              spellCheck={false}
            />
          </div>

          <div className="edit-lic-field">
            <label>Type</label>
            <div className="var-seg" role="group" aria-label="Value type">
              {TYPES.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  className={valueType === t.id ? 'active' : ''}
                  onClick={() => pickType(t.id)}
                  disabled={busy}
                >
                  {t.label}
                </button>
              ))}
            </div>
          </div>

          <div className="edit-lic-field">
            <label htmlFor="var-form-value">Value</label>
            {valueType === 'boolean' ? (
              <div className="var-seg var-seg--2" role="group" aria-label="Boolean value">
                <button
                  type="button"
                  className={value === 'true' ? 'active' : ''}
                  onClick={() => setValue('true')}
                  disabled={busy}
                >
                  True
                </button>
                <button
                  type="button"
                  className={value !== 'true' ? 'active' : ''}
                  onClick={() => setValue('false')}
                  disabled={busy}
                >
                  False
                </button>
              </div>
            ) : valueType === 'json' ? (
              <textarea
                id="var-form-value"
                className="var-json-input"
                value={value}
                onChange={e => setValue(e.target.value)}
                disabled={busy}
                rows={6}
                placeholder={'{\n  "key": "value"\n}'}
                spellCheck={false}
              />
            ) : (
              <input
                id="var-form-value"
                type="text"
                inputMode={valueType === 'number' ? 'decimal' : 'text'}
                value={value}
                onChange={e => setValue(e.target.value)}
                disabled={busy}
                placeholder={valueType === 'number' ? 'e.g. 10' : 'Enter value…'}
                spellCheck={false}
                autoComplete="off"
              />
            )}
          </div>

          <div className="var-auth-row">
            <div>
              <div className="var-auth-title">Requires Authentication</div>
              <div className="var-auth-hint">Only signed-in clients receive this variable</div>
            </div>
            <label className="app-set-toggle">
              <input
                type="checkbox"
                checked={authenticated}
                onChange={e => setAuthenticated(e.target.checked)}
                disabled={busy}
              />
              <span className="app-set-toggle-track" />
            </label>
          </div>

          <div className="edit-lic-footer">
            <button type="button" className="edit-lic-cancel" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="edit-lic-save" disabled={busy}>
              {isEdit
                ? <Pencil size={15} strokeWidth={2.25} />
                : <Plus size={15} strokeWidth={2.25} />}
              {busy ? 'Saving…' : (isEdit ? 'Save Changes' : 'Create Variable')}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>,
    document.body
  );
}

export default function VariablesPanel({ appId }) {
  const { ask, modal: dangerModal } = useDangerConfirm();
  const [vars, setVars] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [formBusy, setFormBusy] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [selected, setSelected] = useState(() => new Set());

  const load = useCallback(() => {
    setLoading(true);
    api.get(`/apps/${appId}/variables`)
      .then(res => setVars(res.data.variables || []))
      .catch(err => toast.error(err.response?.data?.message || 'Failed to load variables'))
      .finally(() => setLoading(false));
  }, [appId]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { setSelected(new Set()); }, [vars]);

  const createVar = async (raw) => {
    setFormBusy(true);
    try {
      await api.post(`/apps/${appId}/variables`, raw);
      toast.success(`${raw.name} added`);
      setShowCreate(false);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not save the variable');
    } finally {
      setFormBusy(false);
    }
  };

  const saveEdit = async (raw) => {
    if (!editTarget?._id) return;
    setFormBusy(true);
    try {
      await api.put(`/apps/${appId}/variables/${editTarget._id}`, raw);
      toast.success('Variable updated');
      setEditTarget(null);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Could not update the variable');
    } finally {
      setFormBusy(false);
    }
  };

  const remove = (item) => {
    ask({
      title: `Delete ${item.name}?`,
      subtitle: 'Clients will stop receiving this variable',
      icon: 'warn',
      facts: [{ icon: 'key', text: 'Removed from the next login response' }],
      confirmLabel: 'Delete',
      action: async () => {
        await api.delete(`/apps/${appId}/variables/${item._id}`);
        toast.success('Deleted');
        load();
      },
    });
  };

  const q = searchInput.trim().toLowerCase();
  const visible = q
    ? vars.filter(v =>
      String(v.name || '').toLowerCase().includes(q)
      || String(v.value || '').toLowerCase().includes(q)
      || String(v.valueType || '').toLowerCase().includes(q))
    : vars;

  const allChecked = visible.length > 0 && visible.every(v => selected.has(v._id));
  const someChecked = selected.size > 0;

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(visible.map(v => v._id)));
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
      title: `Delete ${n} variable${n === 1 ? '' : 's'}?`,
      subtitle: 'Selected variables will be removed',
      icon: 'warn',
      facts: [{ icon: 'key', text: 'Clients will no longer receive these names' }],
      confirmLabel: 'Delete selected',
      action: async () => {
        const res = await api.post(`/apps/${appId}/variables/delete-selected`, {
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

      <VariableFormModal
        open={showCreate}
        mode="create"
        busy={formBusy}
        onCancel={() => !formBusy && setShowCreate(false)}
        onSubmit={createVar}
      />

      <VariableFormModal
        open={!!editTarget}
        mode="edit"
        initial={editTarget}
        busy={formBusy}
        onCancel={() => !formBusy && setEditTarget(null)}
        onSubmit={saveEdit}
      />

      <div className="lic-head">
        <div className="lic-head-left panel-page-heading">
          <h1 className="lic-title">Variables</h1>
          <p className="lic-sub">Values sent to the client after a valid login</p>
        </div>
        <div className="lic-head-right">
          {someChecked && (
            <button type="button" className="lic-btn-create lnk-btn-danger" onClick={deleteSelected}>
              <Trash2 size={15} strokeWidth={2.5} /> Delete ({selected.size})
            </button>
          )}
          <button type="button" className="lic-btn-create" onClick={() => setShowCreate(true)}>
            <Plus size={15} strokeWidth={2.5} /> Create Variable
          </button>
        </div>
      </div>

      <div className="lic-toolbar usr-toolbar">
        <div className="lic-search">
          <Search size={15} />
          <input
            placeholder="Search variables..."
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
              <col />
              <col className="var-col-type" />
              <col />
              <col className="var-col-auth" />
              <col className="var-col-date" />
              <col className="lnk-col-actions" />
            </colgroup>
            <thead>
              <tr>
                <th className="lic-check-col">
                  <input type="checkbox" checked={allChecked} onChange={toggleAll} />
                </th>
                <th>Name</th>
                <th>Type</th>
                <th>Value</th>
                <th>Auth</th>
                <th>Created</th>
                <th className="lic-actions-col" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={7} className="lic-empty">Loading...</td></tr>
              ) : visible.length === 0 ? (
                <tr>
                  <td colSpan={7} className="lic-empty">
                    {vars.length === 0 ? 'No variables yet. Create your first variable.' : 'No matching variables.'}
                  </td>
                </tr>
              ) : (
                visible.map(v => (
                  <tr key={v._id} className={selected.has(v._id) ? 'selected' : ''}>
                    <td className="lic-check-col">
                      <input
                        type="checkbox"
                        checked={selected.has(v._id)}
                        onChange={() => toggleOne(v._id)}
                      />
                    </td>
                    <td><span className="lnk-name">{v.name}</span></td>
                    <td><span className="var-type-pill">{v.valueType || 'string'}</span></td>
                    <td>
                      <span className="lnk-host" title={v.value || ''}>{previewValue(v.value)}</span>
                    </td>
                    <td>
                      <span className={`lic-status ${v.authenticated ? 'lic-status-active' : 'lic-status-unused'}`}>
                        {v.authenticated ? 'Required' : 'Public'}
                      </span>
                    </td>
                    <td className="usr-last-login" title="Egypt time (Africa/Cairo)">
                      {formatEgyptDateTime(v.createdAt)}
                    </td>
                    <td className="lic-actions-col">
                      <div className="lnk-actions">
                        <button
                          type="button"
                          className="lnk-icon-btn"
                          title="Edit"
                          onClick={() => setEditTarget(v)}
                        >
                          <Pencil size={14} />
                        </button>
                        <button
                          type="button"
                          className="lnk-icon-btn lnk-icon-btn--danger"
                          title="Delete"
                          onClick={() => remove(v)}
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
        {!loading && vars.length > 0 && (
          <div className="var-table-foot">
            Showing {visible.length} of {vars.length} variable{vars.length === 1 ? '' : 's'}
          </div>
        )}
      </div>
    </div>
  );
}
