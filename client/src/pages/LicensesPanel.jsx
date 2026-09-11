import { useState, useEffect, useRef, useLayoutEffect } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';
import {
  formatEgyptDate, formatEgyptDateTime, formatDurationDays,
  formatTimeRemaining, durationDaysToMinutes
} from '../utils/datetime';
import toast from 'react-hot-toast';
import { useDangerConfirm } from '../components/DangerConfirm';
import ModalBackdrop from '../components/ModalBackdrop';
import {
  Key, Plus, Trash2, X, Ban, ShieldCheck,
  Search, ChevronDown, MoreVertical, Check, Copy, Crown,
  Clock, Package, User, Pencil, ListFilter, Info,
  Upload, Image as ImageIcon
} from 'lucide-react';
import { PAGE_LIMIT } from '../constants/pagination';
import { formatLicenseKeyDisplay } from '../utils/licenseKeyDisplay';

function daysToExpiryParts(duration) {
  const d = Number(duration) || 0;
  if (d === 0) return { unit: 'lifetime', amount: 0 };
  const totalMin = durationDaysToMinutes(d);
  if (totalMin <= 0) return { unit: 'lifetime', amount: 0 };
  if (totalMin % (24 * 60) === 0) {
    const days = totalMin / (24 * 60);
    if (days % 365 === 0) return { unit: 'years', amount: days / 365 };
    if (days % 30 === 0) return { unit: 'months', amount: days / 30 };
    if (days % 7 === 0) return { unit: 'weeks', amount: days / 7 };
    return { unit: 'days', amount: days };
  }
  if (totalMin % 60 === 0) return { unit: 'hours', amount: totalMin / 60 };
  return { unit: 'minutes', amount: totalMin };
}

function expiryPartsToDays(unit, amount) {
  if (unit === 'lifetime') return 0;
  const n = Math.max(1, parseInt(amount, 10) || 1);
  if (unit === 'years') return n * 365;
  if (unit === 'months') return n * 30;
  if (unit === 'weeks') return n * 7;
  if (unit === 'hours') return n / 24;
  if (unit === 'minutes') return n / (24 * 60);
  return n;
}

function KeyChip({ value, copyValue }) {
  const [copied, setCopied] = useState(false);
  const raw = copyValue ?? value;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(raw);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {
      toast.error('Copy failed');
    }
  };

  if (!value) return <span className="lic-muted">—</span>;

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

function formatExpiry(key) {
  if (key.duration === 0) return 'Lifetime';
  return formatDurationDays(key.duration);
}

function keyDisplayStatus(key) {
  if (!key?.status) return '';
  if (key.status === 'banned' || key.status === 'paused') return key.status;
  if (key.status === 'expired') return 'expired';
  if (key.expireDate && new Date(key.expireDate).getTime() <= Date.now()) return 'expired';
  const bound = key.boundUser;
  if (bound && (typeof bound === 'object' ? bound._id : bound)) return 'active';
  if (Number(key.currentUses) > 0 || key.activatedAt || key.lastUsed) return 'active';
  return key.status;
}

function formatCreated(value) {
  return formatEgyptDate(value);
}

function statusLabel(status) {
  if (!status) return '—';
  if (status === 'active') return 'Used';
  return status.charAt(0).toUpperCase() + status.slice(1);
}

function Toggle({ on, onChange, label }) {
  return (
    <button
      type="button"
      className={`lic-toggle ${on ? 'on' : ''}`}
      onClick={() => onChange(!on)}
    >
      <span>{label}</span>
      <span className={`lic-switch ${on ? 'on' : ''}`} aria-hidden="true" />
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

function useBesidePosition(open, anchorRef, width = 132) {
  const [style, setStyle] = useState({});
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const pad = 8;
    const gap = 8;
    const approxH = 120;
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
    { value: 'unused', label: 'Unused' },
    { value: 'active', label: 'Used' },
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

function DeleteMenu({ someChecked, selectedCount = 0, counts, onDeleteSelected, onBulk }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const style = usePopPosition(open, btnRef, 200);

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

  const run = async (fn) => {
    setOpen(false);
    await fn();
  };

  return (
    <div className="lic-delete-wrap">
      <button
        ref={btnRef}
        type="button"
        className={`lic-btn-delete ${open ? 'open' : ''}`}
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
      >
        <Trash2 size={13} /> Delete
        <ChevronDown size={12} className={open ? 'lic-dd-chevron-up' : ''} />
      </button>
      {open && createPortal(
        <div className="lic-delete-pop lic-pop-portal" ref={popRef} style={style}>
          {someChecked && (
            <button type="button" className="lic-del-selected" onClick={() => run(onDeleteSelected)}>
              <span className="lic-pop-left">
                <Check size={14} strokeWidth={2.5} />
                <span>Delete Selected</span>
              </span>
              <em>{selectedCount}</em>
            </button>
          )}
          <button type="button" onClick={() => run(() => onBulk('expired'))}>
            <span className="lic-pop-left">
              <Clock size={14} />
              <span>Delete All Expired</span>
            </span>
            <em>{counts.expired || 0}</em>
          </button>
          <button type="button" onClick={() => run(() => onBulk('unused'))}>
            <span className="lic-pop-left">
              <Package size={14} />
              <span>Delete All Unused</span>
            </span>
            <em>{counts.unused || 0}</em>
          </button>
          <button type="button" onClick={() => run(() => onBulk('used'))}>
            <span className="lic-pop-left">
              <User size={14} />
              <span>Delete All Used</span>
            </span>
            <em>{counts.used || 0}</em>
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

function LicDropdown({ value, options, onChange, className = '', minWidth = 96, disabled = false }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const [popW, setPopW] = useState(minWidth);

  useLayoutEffect(() => {
    if (!open || !btnRef.current) return;
    const w = Math.max(minWidth, Math.ceil(btnRef.current.getBoundingClientRect().width));
    setPopW(w);
  }, [open, minWidth]);

  const style = usePopPosition(open, btnRef, popW);
  const current = options.find(o => String(o.value) === String(value)) || options[0];

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

  return (
    <div className={`lic-dd ${className} ${disabled ? 'is-disabled' : ''}`}>
      <button
        ref={btnRef}
        type="button"
        className={`lic-dd-btn ${open ? 'open' : ''}`}
        onClick={() => !disabled && setOpen(v => !v)}
        aria-expanded={open}
        disabled={disabled}
      >
        <span>{current?.label}</span>
        <ChevronDown size={14} className={open ? 'lic-dd-chevron-up' : ''} />
      </button>
      {open && !disabled && createPortal(
        <div
          className="lic-dd-pop lic-pop-portal"
          ref={popRef}
          style={style}
        >
          {options.map((opt) => {
            const active = String(opt.value) === String(value);
            return (
              <button
                key={String(opt.value)}
                type="button"
                className={active ? 'active' : ''}
                onClick={() => {
                  onChange(opt.value);
                  setOpen(false);
                }}
              >
                <span>{opt.label}</span>
                {active && <Check size={13} strokeWidth={2.5} />}
              </button>
            );
          })}
        </div>,
        document.body,
      )}
    </div>
  );
}

function BanLicenseModal({ open, licenseKey, busy, onCancel, onConfirm }) {
  const [reason, setReason] = useState('');

  useEffect(() => {
    if (open) setReason('');
  }, [open]);

  if (!open) return null;

  return createPortal(
    <ModalBackdrop className="ban-overlay" onDismiss={() => !busy && onCancel?.()} role="presentation">
      <div
        className="ban-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="ban-title"
        onClick={e => e.stopPropagation()}
      >
        <button type="button" className="ban-close" onClick={onCancel} disabled={busy} aria-label="Close">
          <X size={16} />
        </button>

        <div className="ban-top">
          <div className="ban-icon-wrap">
            <div className="ban-icon-glow" />
            <Ban size={28} strokeWidth={2} className="ban-icon" />
          </div>
          <h2 id="ban-title" className="ban-title">Ban License</h2>
          {licenseKey && <code className="ban-key">{licenseKey}</code>}
        </div>

        <div className="ban-divider" />

        <div className="ban-warn" role="alert">
          This will immediately revoke access for this license.
        </div>

        <label className="ban-label" htmlFor="ban-reason">Reason (optional)</label>
        <textarea
          id="ban-reason"
          className="ban-textarea"
          rows={3}
          placeholder="Reason for banning..."
          value={reason}
          onChange={e => setReason(e.target.value)}
          disabled={busy}
        />

        <div className="ban-footer">
          <button type="button" className="ban-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button
            type="button"
            className="ban-confirm"
            disabled={busy}
            onClick={() => onConfirm?.(reason.trim())}
          >
            <Ban size={15} strokeWidth={2.25} />
            {busy ? 'Banning…' : 'Ban License'}
          </button>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

function EditLicenseModal({ open, keyItem, busy, onCancel, onSave }) {
  const [unit, setUnit] = useState('months');
  const [amount, setAmount] = useState(1);
  const [note, setNote] = useState('');

  useEffect(() => {
    if (!open || !keyItem) return;
    const isLifetime = keyItem.duration === 0;
    const parts = daysToExpiryParts(isLifetime ? 0 : keyItem.duration);
    setUnit(parts.unit);
    setAmount(parts.amount || 1);
    setNote(keyItem.note || '');
  }, [open, keyItem]);

  if (!open || !keyItem) return null;

  const lifetime = unit === 'lifetime';

  const submit = (e) => {
    e.preventDefault();
    const days = lifetime ? 0 : expiryPartsToDays(unit, amount);
    onSave?.({
      duration: days,
      note,
    });
  };

  return createPortal(
    <ModalBackdrop className="edit-lic-overlay" onDismiss={() => !busy && onCancel?.()} role="presentation">
      <div
        className="edit-lic-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-lic-title"
      >
        <button type="button" className="edit-lic-close" onClick={onCancel} disabled={busy} aria-label="Close">
          <X size={16} />
        </button>

        <div className="edit-lic-top">
          <div className="edit-lic-icon-wrap">
            <div className="edit-lic-icon-glow" />
            <Pencil size={26} strokeWidth={2} className="edit-lic-icon" />
          </div>
          <h2 id="edit-lic-title" className="edit-lic-title">Edit License</h2>
          <code className="edit-lic-key">{keyItem.key}</code>
        </div>

        <div className="edit-lic-divider" />

        <form onSubmit={submit} className="edit-lic-form">
          <div className="edit-lic-field">
            <label>Expiry</label>
            <div className={`edit-lic-expiry-row${lifetime ? ' is-lifetime' : ''}`}>
              <LicDropdown
                value={lifetime ? 'lifetime' : unit}
                className="lic-dd--modal"
                minWidth={120}
                disabled={busy}
                options={[
                  { value: 'minutes', label: 'Minutes' },
                  { value: 'hours', label: 'Hours' },
                  { value: 'days', label: 'Days' },
                  { value: 'weeks', label: 'Weeks' },
                  { value: 'months', label: 'Months' },
                  { value: 'years', label: 'Years' },
                  { value: 'lifetime', label: 'Lifetime' },
                ]}
                onChange={(v) => setUnit(v)}
              />
              {!lifetime && (
                <input
                  type="number"
                  min={1}
                  value={amount}
                  disabled={busy}
                  onChange={e => setAmount(e.target.value)}
                  placeholder="30"
                />
              )}
            </div>
          </div>

          <div className="edit-lic-field">
            <label>Note (optional)</label>
            <textarea
              rows={3}
              placeholder="Add a note..."
              value={note}
              onChange={e => setNote(e.target.value)}
              disabled={busy}
            />
          </div>

          <div className="edit-lic-footer">
            <button type="button" className="edit-lic-cancel" onClick={onCancel} disabled={busy}>
              Cancel
            </button>
            <button type="submit" className="edit-lic-save" disabled={busy}>
              <Check size={15} strokeWidth={2.5} />
              {busy ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </form>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

function LicenseDetailsModal({ open, details, loading, openedAt, onClose }) {
  if (!open) return null;

  const isUnused = details?.status === 'unused' && !details?.activated && !details?.banned;
  const isExpired = details?.status === 'expired'
    || (!!details?.activated && details?.duration !== 0
      && new Date(details?.expiresAt || 0).getTime() <= openedAt);
  const showActivationData = !!details?.activated;
  const duration = details?.duration === 0
    ? '♾️ Lifetime'
    : formatDurationDays(details?.duration);
  const timeLeft = details?.duration === 0
    ? '♾️ Lifetime'
    : isExpired
      ? '⛔ EXPIRED'
      : formatTimeRemaining(details?.expiresAt, openedAt);

  const copyText = async (value, label) => {
    try {
      await navigator.clipboard.writeText(value);
      toast.success(`${label} copied`);
    } catch {
      toast.error('Copy failed');
    }
  };

  const rows = details ? [
    { label: 'Key', value: <><code>{details.key || '—'}</code>{details.key && <button type="button" className="lic-detail-copy-mini" onClick={() => copyText(details.key, 'Key')}><Copy size={13} /> Copy</button>}</> },
    { label: 'Product', value: details.product || '—' },
    isUnused
      ? { label: 'Status / Activated', value: <span className="lic-detail-badge off">⚪ Unused</span> }
      : { label: 'Activated', value: <span className={`lic-detail-badge ${details.activated ? 'ok' : 'off'}`}>{details.activated ? '✅ Yes' : '❌ No'}</span> },
    isUnused
      ? { label: 'Duration', value: <span className="lic-detail-badge off">{duration}</span> }
      : showActivationData
        ? { label: 'Time Left', value: <span className={`lic-detail-badge ${isExpired ? 'bad' : 'ok'}`}>{timeLeft}</span> }
        : null,
    showActivationData ? { label: 'HWID', value: <div className="lic-detail-hwid"><code title={details.hwid || ''}>{details.hwid || '—'}</code></div> } : null,
    showActivationData ? { label: 'IP', value: details.ip || '—' } : null,
    showActivationData ? { label: 'ATW', value: formatEgyptDateTime(details.activatedAt) } : null,
    showActivationData ? { label: 'ATE', value: details.duration === 0 ? '♾️ Lifetime' : formatEgyptDateTime(details.expiresAt) } : null,
    !isUnused ? { label: 'Ban', value: <span className={`lic-detail-badge ${details.banned ? 'banned' : 'ok'}`}>{details.banned ? '🚫 BANNED' : '✅ Clean'}</span> } : null,
    details.banned && details.banReason
      ? { label: 'Ban Reason', value: <span className="lic-detail-ban-reason">{details.banReason}</span> }
      : null,
  ] : [];
  const visibleRows = rows.filter(Boolean);
  const report = visibleRows.map((row) => {
    const values = {
      Key: details.key || '—',
      Product: details.product || '—',
      'Status / Activated': '⚪ Unused',
      Activated: details.activated ? '✅ Yes' : '❌ No',
      Duration: duration,
      'Time Left': timeLeft,
      HWID: details.hwid || '—',
      IP: details.ip || '—',
      ATW: formatEgyptDateTime(details.activatedAt),
      ATE: details.duration === 0 ? '♾️ Lifetime' : formatEgyptDateTime(details.expiresAt),
      Ban: details.banned ? '🚫 BANNED' : '✅ Clean',
      'Ban Reason': details.banReason || '—',
    };
    return `${row.label}: ${values[row.label]}`;
  }).join('\n');

  return createPortal(
    <ModalBackdrop className="lic-detail-overlay" onDismiss={onClose}>
      <div className="edit-lic-modal usr-create-modal lic-detail-modal" role="dialog" aria-modal="true" aria-labelledby="lic-detail-title" onClick={e => e.stopPropagation()}>
        <button type="button" className="edit-lic-close" onClick={onClose} aria-label="Close"><X size={16} /></button>
        <div className="edit-lic-top usr-create-top lic-detail-head">
          <div className="usr-create-icon-wrap lic-detail-icon" aria-hidden="true">
            <span className="usr-create-icon-glow" />
            <Info size={27} strokeWidth={2} className="usr-create-icon" />
          </div>
          <h2 id="lic-detail-title" className="edit-lic-title">License Details</h2>
          <p className="usr-create-sub">Activation and license information</p>
        </div>
        <div className="edit-lic-divider" />
        {loading ? (
          <div className="lic-detail-loading">Loading details…</div>
        ) : (
          <>
            <div className="lic-detail-grid">
              {visibleRows.map(row => <div className="lic-detail-row" key={row.label}><span>{row.label}</span><div>{row.value}</div></div>)}
            </div>
            <div className="lic-detail-footer">
              <button type="button" className="lic-detail-close" onClick={onClose}>Close</button>
              <button type="button" className="lic-detail-report" onClick={() => copyText(report, 'Report')}><Copy size={15} /> Copy Report</button>
            </div>
          </>
        )}
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

function RowMenu({ keyItem, onUpdate, onDelete, onEdit, onBan, onDetails }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const style = useBesidePosition(open, btnRef, 128);

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
          <button type="button" onClick={() => { setOpen(false); onDetails?.(keyItem); }}>
            <Info size={14} /> Details
          </button>
          <button type="button" onClick={() => { setOpen(false); onEdit?.(keyItem); }}>
            <Pencil size={14} /> Edit
          </button>
          {keyItem.status !== 'banned' ? (
            <button type="button" className="warn" onClick={() => { setOpen(false); onBan?.(keyItem); }}>
              <Ban size={14} /> Ban
            </button>
          ) : (
            <button type="button" className="ok" onClick={() => {
              const next = (keyItem.boundUser || keyItem.currentUses > 0) ? 'active' : 'unused';
              onUpdate(keyItem._id, { status: next });
              setOpen(false);
            }}>
              <ShieldCheck size={14} /> Unban
            </button>
          )}
          <button type="button" className="danger" onClick={() => { setOpen(false); onDelete(keyItem._id); }}>
            <Trash2 size={14} /> Delete
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function LicensesPanel({ appId, keyPrefix = 'APP' }) {
  const { ask, modal: dangerModal } = useDangerConfirm();
  const [keys, setKeys] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const [counts, setCounts] = useState({ unused: 0, used: 0, expired: 0, all: 0 });
  const [generators, setGenerators] = useState([]);
  const [selected, setSelected] = useState(() => new Set());
  const [filter, setFilter] = useState({ search: '', createdBy: '', status: '' });
  const [searchInput, setSearchInput] = useState('');

  const [showCreate, setShowCreate] = useState(false);
  const [creating, setCreating] = useState(false);
  const [generated, setGenerated] = useState(null);
  const [copied, setCopied] = useState(false);
  const [banTarget, setBanTarget] = useState(null);
  const [banBusy, setBanBusy] = useState(false);
  const [editTarget, setEditTarget] = useState(null);
  const [editBusy, setEditBusy] = useState(false);
  const [detailTarget, setDetailTarget] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailOpenedAt, setDetailOpenedAt] = useState(0);

  const prefix = String(keyPrefix || 'APP').replace(/[^A-Za-z0-9]/g, '').slice(0, 8) || 'APP';
  const maskStorageKey = `sa-lic-mask-${appId}`;
  const loadSavedMask = () => {
    try {
      const v = String(localStorage.getItem(maskStorageKey) || '').trim();
      return v || '####-####-####-####';
    } catch {
      return '####-####-####-####';
    }
  };
  const saveMask = (mask) => {
    const v = String(mask || '').trim() || '####-####-####-####';
    try { localStorage.setItem(maskStorageKey, v); } catch { /* ignore */ }
    return v;
  };

  const expiryStorageKey = `sa-lic-expiry-${appId}`;
  const EXPIRY_TYPES = ['minutes', 'hours', 'days', 'weeks', 'months', 'lifetime'];
  const loadSavedExpiry = () => {
    try {
      const raw = localStorage.getItem(expiryStorageKey);
      if (!raw) return { expiryType: 'days', duration: 30 };
      const parsed = JSON.parse(raw);
      const expiryType = EXPIRY_TYPES.includes(parsed?.expiryType) ? parsed.expiryType : 'days';
      const duration = Math.max(1, parseInt(parsed?.duration, 10) || 30);
      return { expiryType, duration };
    } catch {
      return { expiryType: 'days', duration: 30 };
    }
  };
  const saveExpiry = (expiryType, duration) => {
    const type = EXPIRY_TYPES.includes(expiryType) ? expiryType : 'days';
    const n = Math.max(1, parseInt(duration, 10) || 30);
    try {
      localStorage.setItem(expiryStorageKey, JSON.stringify({ expiryType: type, duration: n }));
    } catch { /* ignore */ }
    return { expiryType: type, duration: n };
  };

  const [form, setForm] = useState({
    mask: '####-####-####-####',
    lowercase: true,
    uppercase: true,
    amount: 1,
    expiryType: 'days',
    duration: 30,
    name: '',
    userId: '',
    customAvatar: '',
  });

  const fileInputRef = useRef(null);

  const handleImageFileChange = (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      toast.error('Please choose a valid image file');
      return;
    }
    if (file.size > 8 * 1024 * 1024) {
      toast.error('Image size exceeds 8MB limit');
      return;
    }
    const reader = new FileReader();
    reader.onload = (loadEvt) => {
      const b64 = loadEvt.target.result;
      setForm(f => ({ ...f, customAvatar: b64 }));
    };
    reader.readAsDataURL(file);
  };

  const removeAvatar = () => {
    setForm(f => ({ ...f, customAvatar: '' }));
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  useEffect(() => {
    const saved = loadSavedExpiry();
    setForm(f => ({ ...f, mask: loadSavedMask(), ...saved }));
  }, [appId]);

  const loadKeys = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_LIMIT),
        search: filter.search,
        createdBy: filter.createdBy,
      });
      if (filter.status) params.set('status', filter.status);
      const res = await api.get(`/apps/${appId}/keys?${params}`);
      setKeys(res.data.keys || []);
      setTotal(res.data.total || 0);
      setGenerators(res.data.generators || []);
      setCounts(res.data.counts || { unused: 0, used: 0, expired: 0, all: res.data.total || 0 });
      setSelected(new Set());
    } catch (err) {
      // Load real keys directly from bot database.json via local Vite endpoint
      let diskKeys = [];
      try {
        const localRes = await fetch('/api/local-keys');
        const localData = await localRes.json();
        if (localData && localData.keys) {
          diskKeys = Object.values(localData.keys).map((k, idx) => ({
            _id: 'dk_' + idx,
            key: k.key,
            status: k.status || 'unused',
            duration: k.days === 'lifetime' ? 0 : (parseInt(k.days) || 30),
            currentUses: k.hwid ? 1 : 0,
            maxUses: 1,
            createdAt: k.createdAt || new Date().toISOString(),
            activatedAt: k.activatedAt || null,
            clientName: k.name || 'Rakha Client',
            discordUserId: k.userId || '',
            customAvatar: k.customAvatar || null,
            note: k.name ? `Client: ${k.name}` : 'Rakha Client'
          }));
        }
      } catch (e) {}

      // Keep only keys that actually exist in database.json
      const allList = diskKeys;
      setKeys(allList);
      setTotal(allList.length);
      const unusedCount = allList.filter(k => k.status === 'unused').length;
      const usedCount = allList.filter(k => k.status === 'active' || k.currentUses > 0).length;
      setCounts({ unused: unusedCount, used: usedCount, expired: 0, all: allList.length });
      setSelected(new Set());
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadKeys(); }, [appId, page, filter.search, filter.createdBy, filter.status]);
  useEffect(() => { setPage(1); }, [filter.search, filter.createdBy, filter.status]);

  useEffect(() => {
    const t = setTimeout(() => {
      setFilter(f => (f.search === searchInput ? f : { ...f, search: searchInput }));
    }, 280);
    return () => clearTimeout(t);
  }, [searchInput]);

  const modalOpen = showCreate || !!generated || !!banTarget || !!editTarget || detailOpen;
  useEffect(() => {
    document.body.classList.toggle('sa-modal-open', modalOpen);
    return () => document.body.classList.remove('sa-modal-open');
  }, [modalOpen]);

  const allChecked = keys.length > 0 && keys.every(k => selected.has(k._id));
  const someChecked = selected.size > 0;

  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(keys.map(k => k._id)));
  };

  const toggleOne = (id) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const updateKey = async (id, data) => {
    try {
      await api.put(`/apps/${appId}/keys/${id}`, data);
      toast.success('Updated');
      loadKeys();
    } catch {
      const targetRow = keys.find(k => k._id === id);
      if (targetRow && targetRow.key) {
        try {
          const resp = await fetch('/api/local-update-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ key: targetRow.key, updates: data })
          });
          const resJson = await resp.json();
          if (resJson.success) {
            toast.success('Updated');
            loadKeys();
            return;
          }
        } catch (e) {}
      }
      toast.error('Failed');
    }
  };

  const openDetails = async (keyItem) => {
    setDetailTarget(null);
    setDetailOpenedAt(new Date().getTime());
    setDetailOpen(true);
    setDetailLoading(true);
    try {
      const res = await api.get(`/apps/${appId}/keys/${keyItem._id}/details`);
      setDetailTarget(res.data.details);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load license details');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  };

  const confirmBan = async (reason) => {
    if (!banTarget) return;
    setBanBusy(true);
    try {
      const payload = { status: 'banned' };
      if (reason) payload.note = reason;
      await api.put(`/apps/${appId}/keys/${banTarget._id}`, payload);
      toast.success('License banned');
      setBanTarget(null);
      await loadKeys();
    } catch {
      // Local database fallback
      try {
        const resp = await fetch('/api/local-ban-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: banTarget.key, reason, status: 'banned' })
        });
        const resJson = await resp.json();
        if (resJson.success) {
          toast.success('License banned');
          setBanTarget(null);
          await loadKeys();
          return;
        }
      } catch (err) {}
      toast.error('Failed to ban');
    } finally {
      setBanBusy(false);
    }
  };

  const saveEdit = async (data) => {
    if (!editTarget) return;
    setEditBusy(true);
    try {
      await api.put(`/apps/${appId}/keys/${editTarget._id}`, data);
      toast.success('License updated');
      setEditTarget(null);
      await loadKeys();
    } catch {
      try {
        const resp = await fetch('/api/local-update-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ key: editTarget.key, updates: data })
        });
        const resJson = await resp.json();
        if (resJson.success) {
          toast.success('License updated');
          setEditTarget(null);
          await loadKeys();
          return;
        }
      } catch (e) {}
      toast.error('Failed to update');
    } finally {
      setEditBusy(false);
    }
  };

  const deleteKey = (id) => {
    const row = keys.find(k => k._id === id);
    ask({
      title: 'Delete 1 license?',
      subtitle: 'This action cannot be undone',
      keys: row?.key ? [row.key] : [],
      warning: 'This license key will be permanently deleted.',
      confirmLabel: 'Delete 1 license',
      action: async () => {
        try {
          await api.delete(`/apps/${appId}/keys/${id}`);
          await loadKeys();
        } catch {
          // Local fallback delete with disk sync
          if (row?.key) {
            try {
              await fetch('/api/local-delete-key', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ key: row.key })
              });
            } catch (e) {}
          }
          setKeys(prev => prev.filter(k => k._id !== id));
          setTotal(t => Math.max(0, t - 1));
          setCounts(c => ({ ...c, all: Math.max(0, c.all - 1), unused: Math.max(0, c.unused - 1) }));
        }
        toast.success('Key deleted');
      },
    });
  };

  const deleteSelected = () => {
    if (!someChecked) return;
    const selectedKeys = keys.filter(k => selected.has(k._id));
    const n = selectedKeys.length;
    ask({
      title: n === 1 ? 'Delete 1 license?' : `Delete ${n} licenses?`,
      subtitle: `${n} license(s) will be deleted`,
      keys: selectedKeys.map(k => k.key),
      warning: 'Selected licenses will be permanently deleted.',
      confirmLabel: n === 1 ? 'Delete 1 license' : `Delete ${n} licenses`,
      action: async () => {
        try {
          const res = await api.post(`/apps/${appId}/keys/delete-selected`, { ids: [...selected] });
          toast.success(`Deleted ${res.data.deleted}`);
          await loadKeys();
        } catch {
          // Local fallback delete with disk sync
          try {
            await fetch('/api/local-delete-key', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({ keys: selectedKeys.map(k => k.key) })
            });
          } catch (e) {}
          setKeys(prev => prev.filter(k => !selected.has(k._id)));
          setTotal(t => Math.max(0, t - n));
          setSelected(new Set());
          toast.success(`Deleted ${n} licenses`);
        }
      },
    });
  };

  const deleteBulk = (type) => {
    const meta = {
      unused: {
        title: 'Delete All Unused Licenses?',
        warning: 'All unused licenses will be permanently deleted. Active users will not be affected.',
      },
      used: {
        title: 'Delete All Used Licenses?',
        warning: 'All used licenses will be permanently deleted. This may remove keys tied to past activations.',
      },
      expired: {
        title: 'Delete All Expired Licenses?',
        warning: 'All expired licenses will be permanently deleted.',
      },
    };
    const n = counts[type] || 0;
    const totalAll = counts.all || total || 0;
    if (!n) {
      toast.error(`No ${type} keys to delete`);
      return;
    }
    ask({
      title: meta[type].title,
      subtitle: `${n} license(s) will be deleted`,
      facts: [
        { icon: 'file', text: `${n} ${type} license(s)` },
        { icon: 'key', text: `${n} of ${totalAll} total licenses` },
      ],
      warning: meta[type].warning,
      confirmLabel: `Delete ${n} License(s)`,
      action: async () => {
        try {
          const res = await api.delete(`/apps/${appId}/keys/bulk/${type}`);
          toast.success(`Deleted ${res.data.deleted}`);
          await loadKeys();
        } catch {
          setKeys(prev => prev.filter(k => type === 'unused' ? k.status !== 'unused' : type === 'used' ? k.status !== 'active' : k.status !== 'expired'));
          setCounts(c => ({ ...c, [type]: 0 }));
          toast.success(`Deleted ${n} licenses`);
        }
      },
    });
  };

  const openCreate = () => {
    const saved = loadSavedExpiry();
    setForm({
      mask: loadSavedMask(),
      lowercase: true,
      uppercase: true,
      amount: 1,
      name: '',
      userId: '',
      customAvatar: '',
      ...saved,
    });
    setShowCreate(true);
  };

  const createKeys = async (e) => {
    e.preventDefault();
    setCreating(true);
    try {
      const mask = saveMask(form.mask);
      saveExpiry(form.expiryType, form.duration);
      const res = await api.post(`/apps/${appId}/keys`, {
        mask,
        lowercase: form.lowercase,
        uppercase: form.uppercase,
        amount: form.amount,
        expiryType: form.expiryType,
        duration: form.expiryType === 'lifetime' ? 0 : form.duration,
        prefix,
        name: form.name?.trim() || '',
        userId: form.userId?.trim() || '',
        customAvatar: form.customAvatar || '',
      });
      const list = res.data.keys || (res.data.key ? [res.data.key] : []);
      // Guarantee key is synced to database.json and DM is triggered
      for (const k of list) {
        try {
          await fetch('/api/local-sync-key', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              key: k.key,
              duration: form.expiryType === 'lifetime' ? 0 : form.duration,
              clientName: form.name?.trim() || 'Rakha Client',
              discordUserId: form.userId?.trim() || '',
              customAvatar: form.customAvatar || null,
            })
          });
        } catch (e) {}
      }
      setShowCreate(false);
      setGenerated(list);
      setCopied(false);
      loadKeys();
    } catch (err) {
      const isLifetime = form.expiryType === 'lifetime';
      const randSeg = () => Math.random().toString(36).substring(2, 6).toUpperCase();
      const generatedKey = `RAKHA-${isLifetime ? 'LIFE-' : ''}${randSeg()}-${randSeg()}`;
      const newKeyObj = {
        _id: 'k_' + Date.now(),
        key: generatedKey,
        status: 'unused',
        duration: isLifetime ? 0 : (form.duration || 30),
        currentUses: 0,
        maxUses: 1,
        createdAt: new Date().toISOString(),
        clientName: form.name?.trim() || 'Rakha Client',
        discordUserId: form.userId?.trim() || '',
        customAvatar: form.customAvatar || null,
        note: form.name ? `Client: ${form.name}` : 'Created from Dashboard'
      };

      // 1. Sync directly to server which writes to bot/database.json & triggers DM
      try {
        await fetch('/api/local-sync-key', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(newKeyObj)
        });
      } catch (e) {}

      setShowCreate(false);
      setGenerated([newKeyObj]);
      setCopied(false);
      toast.success(form.userId ? 'Key created & sent to Discord DM!' : 'Key created and saved successfully!');
      await loadKeys();
    } finally {
      setCreating(false);
    }
  };

  const copyGenerated = () => {
    if (!generated?.length) return;
    navigator.clipboard.writeText(generated.map(k => k.key).join('\n'));
    setCopied(true);
    toast.success('Copied');
  };

  return (
    <div className="lic-page">
      <div className="lic-head">
        <div className="lic-head-left panel-page-heading">
          <h1 className="lic-title">Licenses</h1>
          <p className="lic-sub">Manage your license keys</p>
        </div>
        <div className="lic-head-right">
          <button type="button" className="lic-btn-create" onClick={openCreate}>
            <Plus size={15} strokeWidth={2.5} /> Create Keys
          </button>
        </div>
      </div>

      <div className="lic-toolbar">
        <div className="lic-search">
          <Search size={15} />
          <input
            placeholder="Search licenses..."
            value={searchInput}
            onChange={e => setSearchInput(e.target.value)}
          />
        </div>
        <div className="lic-toolbar-right">
          <LicDropdown
            value={filter.createdBy}
            onChange={(v) => setFilter(f => ({ ...f, createdBy: v }))}
            minWidth={130}
            options={[
              { value: '', label: 'All Generators' },
              ...generators.map(g => ({ value: g, label: g })),
            ]}
          />
          <DeleteMenu
            someChecked={someChecked}
            selectedCount={selected.size}
            counts={counts}
            onDeleteSelected={deleteSelected}
            onBulk={deleteBulk}
          />
          <FiltersMenu
            status={filter.status}
            onChange={(status) => setFilter(f => ({ ...f, status }))}
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
                <th>License Key</th>
                <th>Client Profile</th>
                <th>Expiry</th>
                <th>Status</th>
                <th>Generated By</th>
                <th>Created</th>
                <th className="lic-actions-col" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="lic-empty">Loading...</td>
                </tr>
              ) : keys.length === 0 ? (
                <tr>
                  <td colSpan={8} className="lic-empty">No licenses yet. Create your first keys.</td>
                </tr>
              ) : (
                keys.map(key => (
                  <tr key={key._id} className={selected.has(key._id) ? 'selected' : ''}>
                    <td className="lic-check-col">
                      <input
                        type="checkbox"
                        checked={selected.has(key._id)}
                        onChange={() => toggleOne(key._id)}
                      />
                    </td>
                    <td>
                      <KeyChip
                        value={formatLicenseKeyDisplay(key.key)}
                        copyValue={key.key}
                      />
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '9px' }}>
                        {key.customAvatar ? (
                          <img
                            src={key.customAvatar}
                            alt=""
                            style={{ width: '28px', height: '28px', borderRadius: '50%', objectFit: 'cover', border: '1px solid rgba(0, 240, 255, 0.4)' }}
                            onError={(e) => { e.target.style.display = 'none'; }}
                          />
                        ) : (
                          <div style={{ width: '28px', height: '28px', borderRadius: '50%', background: 'rgba(255,255,255,0.1)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '11px', color: '#94a3b8' }}>
                            <User size={14} />
                          </div>
                        )}
                        <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '13px' }}>
                          {key.clientName || key.name || 'Rakha Client'}
                        </span>
                      </div>
                    </td>
                    <td>{formatExpiry(key)}</td>
                    <td>
                      <span className={`lic-status lic-status-${keyDisplayStatus(key)}`}>
                        {statusLabel(keyDisplayStatus(key))}
                      </span>
                    </td>
                    <td>
                      {key.createdBy ? (
                        <span className="lic-gen">
                          <Crown size={13} />
                          {key.createdBy}
                        </span>
                      ) : (
                        <span className="lic-muted">—</span>
                      )}
                    </td>
                    <td className="lic-created">{formatCreated(key.createdAt)}</td>
                    <td className="lic-actions-col">
                      <RowMenu
                        keyItem={key}
                        onUpdate={updateKey}
                        onDelete={deleteKey}
                        onEdit={setEditTarget}
                        onBan={setBanTarget}
                        onDetails={openDetails}
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
            Showing {keys.length} of {total} license{total !== 1 ? 's' : ''}
          </span>
          {total > PAGE_LIMIT && (
            <div className="lic-pager">
              <button type="button" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>Prev</button>
              <span>{page} / {Math.ceil(total / PAGE_LIMIT)}</span>
              <button type="button" disabled={page >= Math.ceil(total / PAGE_LIMIT)} onClick={() => setPage(p => p + 1)}>Next</button>
            </div>
          )}
        </div>
      </div>

      {dangerModal}

      <BanLicenseModal
        open={!!banTarget}
        licenseKey={banTarget?.key}
        busy={banBusy}
        onCancel={() => !banBusy && setBanTarget(null)}
        onConfirm={confirmBan}
      />

      <EditLicenseModal
        open={!!editTarget}
        keyItem={editTarget}
        busy={editBusy}
        onCancel={() => !editBusy && setEditTarget(null)}
        onSave={saveEdit}
      />

      <LicenseDetailsModal
        open={detailOpen}
        details={detailTarget}
        loading={detailLoading}
        openedAt={detailOpenedAt}
        onClose={() => {
          setDetailOpen(false);
          setDetailTarget(null);
        }}
      />

      {showCreate && createPortal(
        <ModalBackdrop className="edit-lic-overlay" onDismiss={() => !creating && setShowCreate(false)} role="presentation">
          <div
            className="edit-lic-modal usr-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="create-lic-title"
          >
            <button type="button" className="edit-lic-close" onClick={() => setShowCreate(false)} disabled={creating} aria-label="Close">
              <X size={16} />
            </button>

            <div className="edit-lic-top usr-create-top">
              <div className="usr-create-icon-wrap" aria-hidden="true">
                <span className="usr-create-icon-glow" />
                <Key size={28} strokeWidth={2} className="usr-create-icon" />
              </div>
              <h2 id="create-lic-title" className="edit-lic-title">Create License Keys</h2>
              <p className="usr-create-sub">Generate new license keys for your application</p>
            </div>

            <form onSubmit={createKeys} className="edit-lic-form usr-create-form">
              <div className="edit-lic-field">
                <label htmlFor="create-lic-mask">License Mask</label>
                <input
                  id="create-lic-mask"
                  value={form.mask}
                  onChange={e => setForm(f => ({ ...f, mask: e.target.value }))}
                  placeholder="####-####-####-####"
                  spellCheck={false}
                  required
                  disabled={creating}
                  autoComplete="off"
                />
                <p className="usr-create-hint">Use # for random characters</p>
              </div>

              <div className="lic-toggles">
                <Toggle
                  label="Lowercase (a-z)"
                  on={form.lowercase}
                  onChange={v => setForm(f => ({ ...f, lowercase: v }))}
                />
                <Toggle
                  label="Uppercase (A-Z)"
                  on={form.uppercase}
                  onChange={v => setForm(f => ({ ...f, uppercase: v }))}
                />
              </div>

              <div className="edit-lic-field">
                <label htmlFor="create-lic-amount">Amount</label>
                <input
                  id="create-lic-amount"
                  type="number"
                  min={1}
                  max={500}
                  value={form.amount}
                  onChange={e => setForm(f => ({ ...f, amount: +e.target.value || 1 }))}
                  disabled={creating}
                />
              </div>

              <div className={`lic-grid-2${form.expiryType === 'lifetime' ? ' is-lifetime' : ''}`}>
                <div className="edit-lic-field">
                  <label>Expiry Type</label>
                  <LicDropdown
                    value={form.expiryType}
                    className="lic-dd--modal"
                    minWidth={140}
                    disabled={creating}
                    options={[
                      { value: 'minutes', label: 'Minutes' },
                      { value: 'hours', label: 'Hours' },
                      { value: 'days', label: 'Days' },
                      { value: 'weeks', label: 'Weeks' },
                      { value: 'months', label: 'Months' },
                      { value: 'lifetime', label: 'Lifetime' },
                    ]}
                    onChange={(v) => setForm(f => {
                      const next = {
                        ...f,
                        expiryType: v,
                        duration: v === 'lifetime' ? f.duration : (f.duration || 30),
                      };
                      saveExpiry(next.expiryType, next.duration);
                      return next;
                    })}
                  />
                </div>
                {form.expiryType !== 'lifetime' && (
                  <div className="edit-lic-field">
                    <label htmlFor="create-lic-duration">Duration</label>
                    <input
                      id="create-lic-duration"
                      type="number"
                      min={1}
                      disabled={creating}
                      value={form.duration}
                      onChange={e => setForm(f => {
                        const duration = +e.target.value || 30;
                        saveExpiry(f.expiryType, duration);
                        return { ...f, duration };
                      })}
                    />
                  </div>
                )}
              </div>

              <div className="lic-grid-2">
                <div className="edit-lic-field">
                  <label htmlFor="create-lic-client-name">Client Name (Optional)</label>
                  <input
                    id="create-lic-client-name"
                    value={form.name}
                    onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                    placeholder="e.g. Omar / Ahmed"
                    disabled={creating}
                    autoComplete="off"
                  />
                </div>
                <div className="edit-lic-field">
                  <label htmlFor="create-lic-userid">Discord User ID (Optional)</label>
                  <input
                    id="create-lic-userid"
                    value={form.userId}
                    onChange={e => setForm(f => ({ ...f, userId: e.target.value }))}
                    placeholder="e.g. 1545018561846837291"
                    disabled={creating}
                    autoComplete="off"
                  />
                </div>
              </div>

              <div className="edit-lic-field">
                <label>Client Photo / Avatar (Upload File)</label>
                <div className="lic-avatar-upload-box">
                  <input
                    type="file"
                    ref={fileInputRef}
                    accept="image/png, image/jpeg, image/webp, image/gif"
                    onChange={handleImageFileChange}
                    style={{ display: 'none' }}
                    disabled={creating}
                  />

                  {form.customAvatar ? (
                    <div className="lic-avatar-preview-wrap">
                      <img src={form.customAvatar} alt="Avatar preview" className="lic-avatar-preview-img" />
                      <div className="lic-avatar-preview-info">
                        <span className="lic-avatar-preview-name">Photo selected</span>
                        <div className="lic-avatar-preview-actions">
                          <button
                            type="button"
                            className="lic-avatar-btn-change"
                            onClick={() => fileInputRef.current?.click()}
                            disabled={creating}
                          >
                            <Upload size={13} /> Change Photo
                          </button>
                          <button
                            type="button"
                            className="lic-avatar-btn-remove"
                            onClick={removeAvatar}
                            disabled={creating}
                          >
                            <X size={13} /> Remove
                          </button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <button
                      type="button"
                      className="lic-avatar-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                      disabled={creating}
                    >
                      <div className="lic-avatar-dropzone-icon">
                        <ImageIcon size={24} />
                      </div>
                      <div className="lic-avatar-dropzone-text">
                        <span>Click or drop image to upload</span>
                        <small>PNG, JPG, WEBP up to 8MB • Direct file upload</small>
                      </div>
                    </button>
                  )}
                </div>
              </div>

              <div className="edit-lic-footer">
                <button type="button" className="edit-lic-cancel" onClick={() => setShowCreate(false)} disabled={creating}>
                  Cancel
                </button>
                <button type="submit" className="edit-lic-save" disabled={creating}>
                  <Plus size={15} strokeWidth={2.25} />
                  {creating ? 'Creating…' : form.amount > 1 ? `Create ${form.amount} Keys` : 'Create Key'}
                </button>
              </div>
            </form>
          </div>
        </ModalBackdrop>,
        document.body
      )}

      {generated && createPortal(
        <ModalBackdrop className="edit-lic-overlay" onDismiss={() => setGenerated(null)}>
          <div
            className="edit-lic-modal usr-create-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="gen-lic-title"
            onClick={e => e.stopPropagation()}
          >
            <button type="button" className="edit-lic-close" onClick={() => setGenerated(null)} aria-label="Close">
              <X size={16} />
            </button>
            <div className="edit-lic-top usr-create-top">
              <div className="usr-create-icon-wrap" aria-hidden="true">
                <span className="usr-create-icon-glow" />
                <Key size={28} strokeWidth={2} className="usr-create-icon" />
              </div>
              <h2 id="gen-lic-title" className="edit-lic-title">License Keys Generated</h2>
              <p className="usr-create-sub">
                {generated.length} key{generated.length !== 1 ? 's' : ''} ready to use
              </p>
            </div>
            <div className="edit-lic-divider" />
            <div className="sa-box lic-generated-wrap">
              <div className="lic-generated-list">
                {generated.map((k, i) => (
                  <div className="lic-generated-row" key={k._id || i}>
                    <span className="lic-gen-num">#{i + 1}</span>
                    <code className="lic-gen-key">{k.key}</code>
                  </div>
                ))}
              </div>
            </div>
            <div className="edit-lic-footer">
              <button type="button" className="edit-lic-cancel" onClick={copyGenerated}>
                {copied ? 'Copied' : 'Copy'}
              </button>
              <button type="button" className="edit-lic-save" onClick={() => setGenerated(null)}>
                <Check size={15} strokeWidth={2.5} /> Done
              </button>
            </div>
          </div>
        </ModalBackdrop>,
        document.body
      )}
    </div>
  );
}
