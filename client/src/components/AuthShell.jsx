import { memo } from 'react';

function AuthShell({ children, wide = false }) {
  return (
    <div className="auth-shell">
      <div className={`auth-shell-center ${wide ? 'auth-shell-center--wide' : ''}`}>
        {children}
      </div>
    </div>
  );
}

export default memo(AuthShell);
