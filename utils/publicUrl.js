const configuredAppUrl = () =>
  String(process.env.PUBLIC_APP_URL || process.env.APP_URL || '').trim().replace(/\/$/, '');

const isLoopbackUrl = (value) => {
  const s = String(value || '').toLowerCase();
  return (
    s.includes('://localhost')
    || s.includes('://127.0.0.1')
    || s.includes('://[::1]')
    || s.includes('://0.0.0.0')
  );
};

const DEV_APP_URL = 'http://127.0.0.1:5050';

const resolvePublicAppUrl = (candidate) => {
  const configured = configuredAppUrl();
  if (configured && !isLoopbackUrl(configured)) return configured;

  const raw = String(candidate || '').trim().replace(/\/$/, '');
  if (raw && !isLoopbackUrl(raw)) return raw;

  if (process.env.NODE_ENV === 'production') {
    const render = String(process.env.RENDER_EXTERNAL_URL || '').trim().replace(/\/$/, '');
    if (render) return render;
    return configured || raw;
  }
  return DEV_APP_URL;
};

module.exports = {
  PUBLIC_APP_URL: configuredAppUrl() || (process.env.NODE_ENV === 'production' ? '' : DEV_APP_URL),
  resolvePublicAppUrl,
};
