import axios from 'axios';
import { openDashboardJson, sealDashboardRequest } from './dashCrypto';

const api = axios.create({
  baseURL: '/api',
  withCredentials: true,
  headers: { 'Content-Type': 'application/json' },
});

let csrfToken = '';

export const applyCsrf = (raw) => {
  csrfToken = /^[a-f0-9]{64}$/.test(String(raw || '')) ? String(raw) : '';
};

const csrfFromCookie = () => {
  const hit = document.cookie
    .split(';')
    .map(v => v.trim())
    .find(v => v.startsWith('sa_csrf='));
  if (!hit) return '';
  try {
    return decodeURIComponent(hit.slice('sa_csrf='.length));
  } catch {
    return '';
  }
};

// Session lives in httpOnly cookie only — never in response JSON or localStorage.
export const applySession = (raw) => {
  if (raw && /^[a-f0-9]{64}$/.test(raw)) {
    api.defaults.headers.common.Authorization = `Bearer ${raw}`;
    return;
  }
  delete api.defaults.headers.common.Authorization;
};

const skipAuthRedirect = (url = '') =>
  [
    '/auth/me',
    '/auth/login',
    '/auth/logout',
    '/auth/password',
    '/auth/avatar',
  ].some(p => url.includes(p));

let clearingSession = false;

const isFormData = (value) =>
  typeof FormData !== 'undefined' && value instanceof FormData;

const mutatingMethod = (method = '') =>
  ['post', 'put', 'patch', 'delete'].includes(String(method).toLowerCase());

const openIfSealed = async (config, data) => {
  if (!data || Number(data.enc) !== 3 || !config?.dashAesKey) return data;
  return openDashboardJson(data, config.dashAesKey, config.method, config.url);
};

api.interceptors.request.use(async (config) => {
  if (config.dashAesKey || isFormData(config.data)) return config;

  const mutating = mutatingMethod(config.method);
  let payload = config.data;
  if (mutating && (payload === undefined || payload === null)) payload = {};
  if (payload && Number(payload.enc) === 3) return config;

  try {
    const sealed = await sealDashboardRequest(mutating ? payload : {}, config.method, config.url);
    config.headers = config.headers || {};
    config.headers['x-sa-ek'] = sealed.ek;
    const csrf = csrfToken || csrfFromCookie();
    if (mutating && csrf && !String(config.url || '').includes('/auth/login')) {
      config.headers['x-sa-csrf'] = csrf;
    }
    config.dashAesKey = sealed.aesKey;
    if (mutating) config.data = sealed.body;
  } catch {
    // If spki is unavailable (e.g. dev/local mode without server proxy), continue without sealing
  }
  return config;
});

api.interceptors.response.use(
  async (res) => {
    res.data = await openIfSealed(res.config, res.data);
    if (res.data?.csrf) applyCsrf(res.data.csrf);
    return res;
  },
  async err => {
    if (err.response?.data) {
      try {
        err.response.data = await openIfSealed(err.config, err.response.data);
        if (err.response.data?.csrf) applyCsrf(err.response.data.csrf);
      } catch {

      }
    }
    if (err.response?.status === 401 && !skipAuthRedirect(err.config?.url || '')) {
      if (!window.location.pathname.startsWith('/login') && !clearingSession) {
        clearingSession = true;
        try {
          await axios.post('/api/auth/logout', {}, { withCredentials: true });
        } catch {

        } finally {
          clearingSession = false;
          applyCsrf('');
          window.location.href = '/login';
        }
      }
    }
    return Promise.reject(err);
  }
);

export default api;
