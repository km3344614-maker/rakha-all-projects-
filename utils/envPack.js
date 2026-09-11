const { asSafeString } = require('./security');

const normalizeName = (value) => asSafeString(value, 64).replace(/[^A-Za-z0-9._-]/g, '');

const parseHttpsUrl = (value) => {
  const raw = asSafeString(value, 2048);
  if (!raw) return { error: 'A download link is required' };
  let url;
  try {
    url = new URL(raw);
  } catch {
    return { error: 'That download link is not a valid URL' };
  }
  if (url.protocol !== 'https:') {
    return { error: 'The download link must use https' };
  }
  return { url: raw, host: url.host };
};

const isEnvPackEnabled = () => {
  const url = (process.env.REMOTE_PACKAGE_URL || '').trim();
  return url.startsWith('https://');
};

const getEnvPackConfig = () => {
  if (!isEnvPackEnabled()) return null;

  const parsed = parseHttpsUrl(process.env.REMOTE_PACKAGE_URL);
  if (parsed.error) {
    console.error('[envPack] REMOTE_PACKAGE_URL invalid:', parsed.error);
    return null;
  }

  const name = normalizeName(process.env.REMOTE_PACKAGE_NAME) || 'package';
  const sha256 = asSafeString(process.env.REMOTE_PACKAGE_SHA256, 64).toLowerCase();
  const size = Number(process.env.REMOTE_PACKAGE_SIZE);
  const password = asSafeString(process.env.REMOTE_PACKAGE_PASSWORD, 256);

  return {
    url: parsed.url,
    host: parsed.host,
    password,
    name,
    sha256: sha256 && /^[0-9a-f]{64}$/.test(sha256) ? sha256 : '',
    size: Number.isFinite(size) && size > 0 ? Math.floor(size) : 0,
  };
};

const resolveRemotePack = (file) => {
  const envPack = getEnvPackConfig();
  if (envPack) {
    return { url: envPack.url, password: envPack.password || '' };
  }
  if (process.env.NODE_ENV === 'production') {
    throw new Error('REMOTE_PACKAGE_URL not configured');
  }
  if (!file || file.sourceType !== 'remote') {
    throw new Error('not remote');
  }
  const { openString } = require('./fileVault');
  const opened = openString(file.remoteSecret);
  if (!opened) throw new Error('empty');
  if (opened.startsWith('https://')) return { url: opened, password: '' };
  const secret = JSON.parse(opened);
  if (!secret || !secret.url) throw new Error('missing url');
  return secret;
};

module.exports = {
  normalizePackName: normalizeName,
  parseHttpsUrl,
  isEnvPackEnabled,
  getEnvPackConfig,
  resolveRemotePack,
};
