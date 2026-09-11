import { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import toast from 'react-hot-toast';
import { Trash2, X, AlertTriangle, FileText, Key } from 'lucide-react';
import ModalBackdrop from './ModalBackdrop';

const FACT_ICONS = {
  file: FileText,
  key: Key,
  warn: AlertTriangle,
  trash: Trash2,
};

export default function DangerConfirm({
  open,
  busy = false,
  title,
  subtitle = 'This action cannot be undone',
  icon = 'trash',
  keys = [],
  facts = [],
  warning,
  confirmLabel = 'Delete',
  onCancel,
  onConfirm,
}) {
  if (!open) return null;

  const Icon = icon === 'warn' ? AlertTriangle : Trash2;
  const showKeys = (keys || []).filter(Boolean).slice(0, 8);

  return createPortal(
    <ModalBackdrop className="dng-overlay" onDismiss={() => !busy && onCancel?.()} role="presentation">
      <div
        className="dng-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="dng-title"
        onClick={(e) => e.stopPropagation()}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <button type="button" className="dng-close" onClick={onCancel} disabled={busy} aria-label="Close">
          <X size={16} />
        </button>

        <div className="dng-top">
          <div className="dng-icon-wrap">
            <div className="dng-icon-glow" />
            <Icon size={28} strokeWidth={2} className="dng-icon" />
          </div>
          <h2 id="dng-title" className="dng-title">{title}</h2>
          {subtitle && <p className="dng-sub">{subtitle}</p>}
        </div>

        <div className="dng-divider" />

        {showKeys.length > 0 && (
          <div className="dng-keys">
            {showKeys.map((k) => (
              <code key={k} className="dng-key">{k}</code>
            ))}
            {keys.length > showKeys.length && (
              <span className="dng-more">+{keys.length - showKeys.length} more</span>
            )}
          </div>
        )}

        {facts.length > 0 && (
          <div className="dng-facts">
            {facts.map((f, i) => {
              const FactIcon = typeof f.icon === 'string'
                ? (FACT_ICONS[f.icon] || FileText)
                : (f.icon || FileText);
              return (
                <div key={i} className="dng-fact">
                  <FactIcon size={16} strokeWidth={2} />
                  <span>{f.text}</span>
                </div>
              );
            })}
          </div>
        )}

        {warning && (
          <div className="dng-warn" role="alert">
            <AlertTriangle size={16} strokeWidth={2.25} />
            <span>{warning}</span>
          </div>
        )}

        <div className="dng-footer">
          <button type="button" className="dng-cancel" onClick={onCancel} disabled={busy}>
            Cancel
          </button>
          <button type="button" className="dng-confirm" onClick={onConfirm} disabled={busy}>
            <Icon size={15} strokeWidth={2.25} />
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </ModalBackdrop>,
    document.body,
  );
}

export function useDangerConfirm() {
  const [cfg, setCfg] = useState(null);
  const [busy, setBusy] = useState(false);
  const cfgRef = useRef(null);

  useEffect(() => {
    cfgRef.current = cfg;
    document.body.classList.toggle('sa-modal-open', !!cfg);
    return () => document.body.classList.remove('sa-modal-open');
  }, [cfg]);

  const ask = (opts) => setCfg(opts);

  const run = async () => {
    const current = cfgRef.current;
    if (!current?.action || busy) return;
    setBusy(true);
    try {
      await current.action();
      setCfg(null);
    } catch (err) {
      toast.error(err.response?.data?.message || err.message || 'Failed');
    } finally {
      setBusy(false);
    }
  };

  const modal = (
    <DangerConfirm
      open={!!cfg}
      busy={busy}
      title={cfg?.title}
      subtitle={cfg?.subtitle}
      icon={cfg?.icon}
      keys={cfg?.keys}
      facts={cfg?.facts}
      warning={cfg?.warning}
      confirmLabel={cfg?.confirmLabel}
      onCancel={() => !busy && setCfg(null)}
      onConfirm={run}
    />
  );

  return { ask, modal, busy };
}
