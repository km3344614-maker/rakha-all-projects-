import { useState, useEffect, useRef, useLayoutEffect, useMemo, useCallback } from 'react';
import { createPortal } from 'react-dom';
import api from '../utils/api';
import { formatEgyptDateTimeShort } from '../utils/datetime';
import toast from 'react-hot-toast';
import { useDangerConfirm } from '../components/DangerConfirm';
import {
  Search, MoreVertical, RefreshCw, Trash2,
} from 'lucide-react';
import { PAGE_LIMIT } from '../constants/pagination';

const AUTO_REFRESH_SECONDS = 30;

function shortId(id) {
  const s = String(id || '');
  if (s.length <= 18) return s;
  return `${s.slice(0, 16)}…`;
}

function displayIp(ip) {
  const v = String(ip || '').trim();
  if (!v) return '—';
  if (v === '::1') return '127.0.0.1';
  return v.replace(/^::ffff:/i, '');
}

function rowId(session) {
  return String(session?.sessionId || session?._id || '');
}

function formatLeft(sec) {
  const n = Math.max(0, Math.floor(Number(sec) || 0));
  if (n < 60) return `${n}s`;
  const m = Math.floor(n / 60);
  if (m < 60) return `${m}m`;
  return `${Math.floor(m / 60)}h`;
}

function useBesidePosition(open, anchorRef, width = 148) {
  const [style, setStyle] = useState({});
  useLayoutEffect(() => {
    if (!open || !anchorRef.current) return;
    const rect = anchorRef.current.getBoundingClientRect();
    const pad = 8;
    const gap = 8;
    const approxH = 100;
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

function SessionIdChip({ value }) {
  const [copied, setCopied] = useState(false);
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
      className={`lic-key-chip ${copied ? 'is-copied' : ''}`}
      onClick={copy}
      title={copied ? 'Copied' : value}
    >
      <span className="lic-key-chip-label" aria-hidden={copied}>{shortId(value)}</span>
      {copied && <span className="lic-key-chip-copied">Copied</span>}
    </button>
  );
}

function RowMenu({ session, onEnd }) {
  const [open, setOpen] = useState(false);
  const btnRef = useRef(null);
  const popRef = useRef(null);
  const style = useBesidePosition(open, btnRef, 140);

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
          <button
            type="button"
            className="danger"
            onClick={() => {
              setOpen(false);
              onEnd(session);
            }}
          >
            <Trash2 size={14} /> End Session
          </button>
        </div>,
        document.body,
      )}
    </div>
  );
}

export default function SessionsPanel({ appId }) {
  const { ask, modal: dangerModal } = useDangerConfirm();
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState(() => new Set());

  useEffect(() => {
    const t = window.setTimeout(() => {
      setSearch(searchInput.trim().toLowerCase());
      setPage(1);
    }, 250);
    return () => window.clearTimeout(t);
  }, [searchInput]);

  const load = useCallback((opts = {}) => {
    const silent = opts.silent === true;
    if (!silent) setLoading(true);
    return api.get(`/apps/${appId}/sessions`)
      .then(res => {
        const list = res.data.sessions || [];
        setSessions(list);
        setSelected((prev) => {
          if (!silent) return new Set();
          const alive = new Set(list.map(rowId));
          return new Set([...prev].filter((id) => alive.has(id)));
        });
      })
      .catch(() => {
        setSessions([]);
      })
      .finally(() => {
        if (!silent) setLoading(false);
      });
  }, [appId]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    const interval = window.setInterval(() => load({ silent: true }), AUTO_REFRESH_SECONDS * 1000);
    return () => window.clearInterval(interval);
  }, [load]);

  const filtered = useMemo(() => {
    if (!search) return sessions;
    return sessions.filter((s) => {
      const hay = [
        s.pcName,
        s.key,
        s.username,
        s.lastIp,
        s.hwid,
        s.sessionId || s._id,
      ].filter(Boolean).join(' ').toLowerCase();
      return hay.includes(search);
    });
  }, [sessions, search]);

  const total = filtered.length;
  const pages = Math.max(1, Math.ceil(total / PAGE_LIMIT));
  const pageSafe = Math.min(page, pages);
  const pageRows = filtered.slice((pageSafe - 1) * PAGE_LIMIT, pageSafe * PAGE_LIMIT);

  const allChecked = pageRows.length > 0 && pageRows.every(s => selected.has(rowId(s)));
  const toggleAll = () => {
    if (allChecked) setSelected(new Set());
    else setSelected(new Set(pageRows.map(rowId)));
  };
  const toggleOne = (session) => {
    const sid = rowId(session);
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(sid)) next.delete(sid);
      else next.add(sid);
      return next;
    });
  };

  const killByIds = async (ids) => {
    const res = await api.put(`/apps/${appId}/users/${ids[0]}`, {
      endSession: true,
      ids,
    });
    return Number(res.data?.deleted) || ids.length;
  };

  const endSession = (session) => {
    const sid = rowId(session);
    if (!sid) {
      toast.error('Missing session id');
      return;
    }
    ask({
      title: 'End this session?',
      subtitle: session?.key || session?.username
        ? `Key: ${session.key || session.username}`
        : 'Active session will be closed',
      icon: 'warn',
      facts: [
        { icon: 'key', text: 'Session token will be revoked immediately' },
        { icon: 'file', text: 'User must login again' },
      ],
      warning: 'The program will close on its next heartbeat (a few seconds).',
      confirmLabel: 'End Session',
      action: async () => {
        await killByIds([String(sid)]);
        setSessions((prev) => prev.filter((s) => rowId(s) !== sid));
        setSelected((prev) => {
          const next = new Set(prev);
          next.delete(sid);
          return next;
        });
        toast.success(
          session.key || session.username
            ? `Session ended for ${session.key || session.username}`
            : 'Session ended'
        );
        load({ silent: true });
      },
    });
  };

  const someChecked = selected.size > 0;
  const deleteSelected = () => {
    if (!someChecked) return;
    const n = selected.size;
    const ids = Array.from(selected).map(String);
    ask({
      title: n === 1 ? 'End 1 session?' : `End ${n} sessions?`,
      subtitle: 'Selected sessions will be closed',
      icon: 'warn',
      facts: [
        { icon: 'key', text: 'Session tokens will be revoked immediately' },
        { icon: 'file', text: 'Users must login again' },
      ],
      warning: 'Programs will close on their next heartbeat (a few seconds).',
      confirmLabel: n === 1 ? 'End 1 session' : `End ${n} sessions`,
      action: async () => {
        await killByIds(ids);
        const endedSet = new Set(ids);
        setSessions((prev) => prev.filter((s) => !endedSet.has(rowId(s))));
        setSelected(new Set());
        toast.success(n === 1 ? 'Session ended' : `Ended ${n} sessions`);
        load({ silent: true });
      },
    });
  };

  return (
    <div className="lic-page sess-page">
      {dangerModal}

      <div className="lic-head">
        <div className="lic-head-left panel-page-heading">
          <h1 className="lic-title">Sessions</h1>
          <p className="lic-sub">Active user sessions</p>
        </div>
        <div className="lic-head-right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button type="button" className="lic-btn-create" onClick={() => load()} disabled={loading}>
            <RefreshCw size={15} strokeWidth={2.5} className={loading ? 'sess-spin' : ''} />
            Refresh
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
              <Trash2 size={13} /> End Sessions
            </button>
          )}
        </div>
      </div>

      <div className="sa-box lic-table-card">
        <div className="lic-table-scroll">
          <table className="lic-table">
            <thead>
              <tr>
                <th className="lic-check-col">
                  <input
                    type="checkbox"
                    aria-label="Select all sessions"
                    checked={allChecked}
                    onChange={toggleAll}
                  />
                </th>
                <th>Key</th>
                <th>PC Name</th>
                <th>IP Address</th>
                <th>HWID</th>
                <th>Last Seen</th>
                <th>Expires</th>
                <th className="lic-actions-col" />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} className="lic-empty">Loading...</td>
                </tr>
              ) : pageRows.length === 0 ? (
                <tr>
                  <td colSpan={8} className="lic-empty">No active sessions</td>
                </tr>
              ) : (
                pageRows.map(s => (
                  <tr key={rowId(s)} className={selected.has(rowId(s)) ? 'selected' : ''}>
                    <td className="lic-check-col">
                      <input
                        type="checkbox"
                        checked={selected.has(rowId(s))}
                        onChange={() => toggleOne(s)}
                      />
                    </td>
                    <td>
                      {(s.key || s.username) ? (
                        <SessionIdChip value={s.key || s.username} />
                      ) : (
                        <span className="lic-muted">—</span>
                      )}
                    </td>
                    <td>
                      {s.pcName ? (
                        <span className="usr-name-plain">{s.pcName}</span>
                      ) : (
                        <span className="lic-muted">—</span>
                      )}
                    </td>
                    <td className="lic-muted">{displayIp(s.lastIp || s.ip)}</td>
                    <td>
                      <span className="usr-hwid-pill" title={s.hwid || 'N/A'}>
                        {s.hwid
                          ? (s.hwid.length > 12 ? `${s.hwid.slice(0, 12)}…` : s.hwid)
                          : 'N/A'}
                      </span>
                    </td>
                    <td className="usr-last-login" title="Egypt time (Africa/Cairo)">
                      {formatEgyptDateTimeShort(s.lastSeen || s.lastLogin)}
                    </td>
                    <td>
                      <span className={`sess-time-left ${Number(s.expiresIn) < 60 ? 'urgent' : ''}`}>
                        {formatLeft(s.expiresIn)}
                      </span>
                    </td>
                    <td className="lic-actions-col">
                      <RowMenu session={s} onEnd={endSession} />
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
        <div className="lic-footer">
          <span>
            Showing {pageRows.length} of {total} session{total !== 1 ? 's' : ''}
          </span>
          {total > PAGE_LIMIT && (
            <div className="lic-pager">
              <button type="button" disabled={pageSafe <= 1} onClick={() => setPage(p => Math.max(1, p - 1))}>
                Prev
              </button>
              <span>{pageSafe} / {pages}</span>
              <button
                type="button"
                disabled={pageSafe >= pages}
                onClick={() => setPage(p => Math.min(pages, p + 1))}
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
