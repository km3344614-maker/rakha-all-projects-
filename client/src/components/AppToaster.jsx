import { Check, X, Info } from 'lucide-react';
import toast, { Toaster as HotToaster, ToastBar } from 'react-hot-toast';

const TYPE_META = {
  success: { cls: 'success', Icon: Check },
  error: { cls: 'error', Icon: X },
  loading: { cls: 'loading', Icon: null },
  blank: { cls: 'info', Icon: Info },
  custom: { cls: 'info', Icon: Info },
};

function ToastIcon({ type }) {
  const meta = TYPE_META[type] || TYPE_META.blank;
  if (type === 'loading') {
    return <span className="sa-toast-spinner" aria-hidden="true" />;
  }
  if (type === 'success') {
    return (
      <img
        src="/rakha.jpg?v=2"
        alt=""
        style={{
          width: 22,
          height: 22,
          borderRadius: '50%',
          objectFit: 'cover',
          border: '1px solid rgba(255, 255, 255, 0.4)',
          flexShrink: 0
        }}
      />
    );
  }
  const Icon = meta.Icon || Info;
  return (
    <span className={`sa-toast-icon ${meta.cls}`} aria-hidden="true">
      <Icon size={11} strokeWidth={3} />
    </span>
  );
}

export default function AppToaster() {
  return (
    <HotToaster
      position="top-right"
      gutter={10}
      containerStyle={{ top: 16, right: 16 }}
      toastOptions={{
        duration: 3500,
        className: 'sa-toast-root',
        style: {
          background: 'transparent',
          boxShadow: 'none',
          padding: 0,
          margin: 0,
          color: 'inherit',
          maxWidth: 'none',
        },
      }}
    >
      {(t) => {
        const meta = TYPE_META[t.type] || TYPE_META.blank;
        const duration = typeof t.duration === 'number' && t.duration > 0 ? t.duration : 3500;
        return (
          <ToastBar
            toast={t}
            style={{
              padding: 0,
              background: 'transparent',
              boxShadow: 'none',
              border: 'none',
              color: 'inherit',
              maxWidth: 'none',
            }}
          >
            {({ message }) => (
              <div
                className={`sa-toast sa-toast-${meta.cls} ${t.visible ? 'sa-toast-in' : 'sa-toast-out'}`}
                data-type={t.type}
              >
                <span className="sa-toast-bar" aria-hidden="true" />
                <ToastIcon type={t.type} />
                <div className="sa-toast-msg">{message}</div>
                {t.type !== 'loading' && (
                  <button
                    type="button"
                    className="sa-toast-close"
                    aria-label="Close"
                    onClick={() => toast.dismiss(t.id)}
                  >
                    <X size={14} strokeWidth={2.25} />
                  </button>
                )}
                {t.type !== 'loading' && (
                  <span
                    className="sa-toast-progress"
                    style={{ animationDuration: `${duration}ms` }}
                    aria-hidden="true"
                  />
                )}
              </div>
            )}
          </ToastBar>
        );
      }}
    </HotToaster>
  );
}
