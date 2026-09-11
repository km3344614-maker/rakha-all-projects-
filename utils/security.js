const crypto = require('crypto');
const bcrypt = require('bcryptjs');

const parseCookie = (header) => {
  if (!header) return {};
  return Object.fromEntries(
    header.split(';').map((part) => {
      const idx = part.indexOf('=');
      if (idx === -1) return [part.trim(), ''];
      const key = part.slice(0, idx).trim();
      const val = part.slice(idx + 1).trim();
      try { return [key, decodeURIComponent(val)]; } catch { return [key, val]; }
    }).filter(([key]) => key)
  );
};

const getAdminUsername = () => (process.env.ADMIN_USERNAME || '').trim();

const isDashboardOwner = (username) => {
  const allowed = getAdminUsername();
  if (!allowed) return true;
  const list = allowed.split(',').map(u => u.trim().toLowerCase());
  return list.includes(String(username || '').toLowerCase());
};

const requireSdkSignature = () => process.env.REQUIRE_SDK_SIGNATURE !== 'false';

const requireSdkEncryption = () => process.env.REQUIRE_SDK_ENCRYPTION !== 'false';

const sdkTimestampSkewSeconds = () => {
  const n = Number(process.env.SDK_TIMESTAMP_SKEW || 45);
  return Number.isFinite(n) ? Math.min(180, Math.max(30, n)) : 45;
};

const parseUtcSeconds = (value) => {
  const s = String(value ?? '').trim();
  if (!s) return NaN;
  if (/^\d{10}$/.test(s)) return Number(s);
  if (/^\d{13}$/.test(s)) return Math.floor(Number(s) / 1000);
  const ms = Date.parse(s);
  return Number.isFinite(ms) ? Math.floor(ms / 1000) : NaN;
};

const allowKeyAutoRegister = () => process.env.ALLOW_KEY_AUTO_REGISTER === 'true';

const sdkSslPins = () => {
  const raw = (process.env.SDK_SSL_PINS || process.env.SDK_SSL_PIN || '').trim();
  return raw
    .split(',')
    .map((p) => p.trim().toLowerCase())
    .filter((p) => /^[0-9a-f]{64}$/.test(p));
};

const useSecureCookies = () => {
  const appUrl = (process.env.APP_URL || '').toLowerCase();
  return appUrl.startsWith('https://') || process.env.COOKIE_SECURE === 'true';
};

const parseDurationMs = (raw, fallbackMs) => {
  const s = String(raw || '').trim();
  const m = /^(\d+)([smhd])$/i.exec(s);
  if (!m) return fallbackMs;
  const n = Number(m[1]);
  if (!Number.isFinite(n) || n < 1) return fallbackMs;
  const mul = { s: 1000, m: 60_000, h: 3_600_000, d: 86_400_000 };
  return n * mul[m[2].toLowerCase()];
};

const MAX_DASH_SESSION_MS = 30 * 24 * 60 * 60 * 1000;
const SESSION_MS = Math.min(
  parseDurationMs(process.env.DASHBOARD_SESSION_TTL || process.env.JWT_EXPIRE, 7 * 24 * 60 * 60 * 1000),
  MAX_DASH_SESSION_MS
);
const SESSION_IDLE_MS = Math.min(
  parseDurationMs(process.env.DASHBOARD_IDLE_TTL, SESSION_MS),
  SESSION_MS
);
const CSRF_COOKIE = 'sa_csrf';
const LEGACY_DASH_COOKIES = ['rakhaauth_token', 'sa', '__Host-sa'];

const dashCookieName = () => (useSecureCookies() ? '__Host-sa' : 'sa');

const cookieOptions = () => ({
  httpOnly: true,
  secure: useSecureCookies(),
  sameSite: 'strict',
  maxAge: SESSION_MS,
  path: '/',
});

const clearCookieOpts = (name) => ({
  httpOnly: true,
  secure: name.startsWith('__Host-') || useSecureCookies(),
  sameSite: (name.startsWith('__Host-') || useSecureCookies()) ? 'strict' : 'lax',
  path: '/',
});

const setAuthCookie = (res, raw) => {
  const name = dashCookieName();
  res.cookie(name, raw, cookieOptions());
  for (const old of LEGACY_DASH_COOKIES) {
    if (old !== name) res.clearCookie(old, clearCookieOpts(old));
  }
};

const setCsrfCookie = (res, csrf) => {
  res.cookie(CSRF_COOKIE, csrf, {
    httpOnly: false,
    secure: useSecureCookies(),
    sameSite: 'strict',
    maxAge: SESSION_MS,
    path: '/',
  });
};

const clearAuthCookie = (res) => {
  for (const name of LEGACY_DASH_COOKIES) {
    res.clearCookie(name, clearCookieOpts(name));
  }
  res.clearCookie(CSRF_COOKIE, clearCookieOpts(CSRF_COOKIE));
};

const getTokenFromRequest = (req) => {
  const cookies = parseCookie(req.headers.cookie);
  for (const name of [dashCookieName(), '__Host-sa', 'sa']) {
    const raw = cookies[name];
    if (raw && /^[a-f0-9]{64}$/.test(raw)) return raw;
  }
  return null;
};

const safeEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;


  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

const sha256 = (value) =>
  crypto.createHash('sha256').update(String(value)).digest('hex');

const dummyHashCache = new Map();

const dummyPasswordHash = async (cost = 12) => {
  const c = Number(cost) === 14 ? 14 : 12;
  if (dummyHashCache.has(c)) return dummyHashCache.get(c);
  const seed = String(process.env.FILE_ENCRYPTION_KEY || process.env.JWT_SECRET || '');
  const hash = await bcrypt.hash(`dummy|${c}|${seed}`, c);
  dummyHashCache.set(c, hash);
  return hash;
};

const dummyPasswordCheck = async (password, cost = 12) =>
  bcrypt.compare(String(password || '\0'), await dummyPasswordHash(cost));

const warmDummyPasswordHashes = async () => {
  await dummyPasswordHash(12);
  await dummyPasswordHash(14);
};

const normalizeUserAgent = (req) =>
  String(req?.headers?.['user-agent'] || '').trim().slice(0, 512);

const dashboardUaHash = (req) => sha256(normalizeUserAgent(req));

const dashboardIpPrefix = (raw) => {
  const ip = normalizeIp(raw);
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(ip)) {
    return ip.split('.').slice(0, 3).join('.');
  }
  if (ip.includes(':')) {
    const parts = ip.toLowerCase().split(':').filter(Boolean);
    return parts.slice(0, 4).join(':');
  }
  return ip;
};

const issueDashboardSession = async (user, req) => {
  const raw = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(32).toString('hex');
  const dashboardSessionHash = sha256(raw);
  const now = new Date();
  const dashboardSessionExp = new Date(now.getTime() + SESSION_MS);
  const ipPrefix = dashboardIpPrefix(getClientIp(req));
  const uaHash = dashboardUaHash(req);
  await user.updateOne({
    $set: {
      dashboardSessionHash,
      dashboardSessionExp,
      dashboardSessionSeenAt: now,
      dashboardSessionIpPrefix: ipPrefix,
      dashboardSessionUaHash: uaHash,
    },
  });
  return { raw, csrf };
};

const dashboardSessionValid = (user, req, now = Date.now()) => {
  if (!user?.dashboardSessionExp || new Date(user.dashboardSessionExp).getTime() <= now) return false;
  const seenAt = new Date(user.dashboardSessionSeenAt || 0).getTime();
  if (!Number.isFinite(seenAt) || now - seenAt > SESSION_IDLE_MS) return false;
  if (!safeEqual(String(user.dashboardSessionUaHash || ''), dashboardUaHash(req))) return false;
  return true;
};

const isMutatingRequest = (req) => !['GET', 'HEAD', 'OPTIONS'].includes(req.method);

const dashboardCsrfValid = (user, req) => {
  if (!isMutatingRequest(req)) return true;
  const token = String(req.headers?.['x-sa-csrf'] || '');
  const cookie = String(parseCookie(req.headers?.cookie)[CSRF_COOKIE] || '');
  return /^[a-f0-9]{64}$/.test(token)
    && /^[a-f0-9]{64}$/.test(cookie)
    && safeEqual(token, cookie);
};

const dashboardSessionUnset = () => ({
  dashboardSessionHash: 1,
  dashboardSessionExp: 1,
  dashboardSessionSeenAt: 1,
  dashboardSessionIpPrefix: 1,
  dashboardSessionUaHash: 1,
});

const isStrongPassword = (password) => {
  if (!password || password.length < 10) return false;
  if (!/[A-Z]/.test(password)) return false;
  if (!/[a-z]/.test(password)) return false;
  if (!/[0-9]/.test(password)) return false;
  if (!/[^A-Za-z0-9]/.test(password)) return false;
  return true;
};

const PASSWORD_HINT = 'Password needs 10+ chars with upper, lower, number, and symbol';

const normalizeIp = (raw) => {
  let ip = String(raw || '').replace(/^::ffff:/i, '').trim();
  if (!ip) return '';
  if (ip === '::1') return '127.0.0.1';

  if (/^\d{1,3}(\.\d{1,3}){3}:\d+$/.test(ip)) ip = ip.split(':')[0];
  return ip;
};

const isLoopbackIp = (ip) => {
  const v = String(ip || '').toLowerCase();
  return !v || v === '127.0.0.1' || v === '::1' || v === 'localhost' || v.startsWith('127.');
};

const isValidIp = (ip) => {
  const v = String(ip || '').trim();
  if (/^\d{1,3}(\.\d{1,3}){3}$/.test(v)) {
    return v.split('.').every((p) => {
      const n = Number(p);
      return Number.isInteger(n) && n >= 0 && n <= 255;
    });
  }
  if (v.includes(':') && /^[0-9a-f:]+$/i.test(v) && v.length <= 45) return true;
  return false;
};

const trustProxyEnabled = () => {
  const v = (process.env.TRUST_PROXY || '').trim().toLowerCase();
  return v === 'true' || v === '1' || (v !== '' && v !== 'false' && v !== '0');
};

const getClientIp = (req) => {
  const socketIp = normalizeIp(
    req.socket?.remoteAddress || req.connection?.remoteAddress
  );
  const peerTrusted = isLoopbackIp(socketIp) || (() => {
    const ip = socketIp;
    return (
      ip.startsWith('192.168.')
      || ip.startsWith('10.')
      || /^172\.(1[6-9]|2\d|3[0-1])\./.test(ip)
    );
  })();

  if (trustProxyEnabled()) {
    if (peerTrusted) {
      const realIp = normalizeIp(req.headers?.['x-real-ip']);
      if (realIp && isValidIp(realIp) && !isLoopbackIp(realIp)) return realIp;
    }
    const expressIp = normalizeIp(req.ip);
    if (expressIp && isValidIp(expressIp) && !isLoopbackIp(expressIp)) return expressIp;
  }

  return socketIp || normalizeIp(req.ip) || '';
};

const rateLimitKey = (req) =>
  getClientIp(req) || normalizeIp(req.socket?.remoteAddress) || '0';

let publicIpCache = { ip: '', at: 0 };

const lookupPublicIp = async () => {
  const now = Date.now();
  if (publicIpCache.ip && now - publicIpCache.at < 5 * 60 * 1000) {
    return publicIpCache.ip;
  }
  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 2500);
    const res = await fetch('https://api.ipify.org?format=json', {
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    clearTimeout(t);
    if (!res.ok) return publicIpCache.ip || '';
    const data = await res.json();
    const ip = normalizeIp(data?.ip);
    if (ip && isValidIp(ip) && !isLoopbackIp(ip)) {
      publicIpCache = { ip, at: now };
      return ip;
    }
  } catch {

  }
  return publicIpCache.ip || '';
};

const resolveSessionIp = async (req) => {
  const seen = getClientIp(req);
  if (seen && !isLoopbackIp(seen)) return seen;
  const pub = await lookupPublicIp();
  return pub || seen || '';
};

const assertDashboardOrigin = (req) => {
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) return true;
  const origin = String(req.headers.origin || '').replace(/\/$/, '');
  const referer = String(req.headers.referer || '');
  const allowed = new Set(
    [process.env.APP_URL, process.env.RENDER_EXTERNAL_URL]
      .map((v) => String(v || '').trim().replace(/\/$/, ''))
      .filter((v) => v.startsWith('https://') || v.startsWith('http://'))
  );
  if (!allowed.size) {
    return process.env.NODE_ENV !== 'production';
  }
  if (origin && allowed.has(origin)) return true;
  if (process.env.NODE_ENV !== 'production'
    && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/i.test(origin)) {
    return true;
  }
  for (const a of allowed) {
    if (referer === a || referer.startsWith(`${a}/`)) return true;
  }
  if (process.env.NODE_ENV !== 'production' && !origin && !referer) return true;
  return false;
};

const resolveClientIp = (req, reported) => {
  const seen = getClientIp(req);

  if (process.env.NODE_ENV === 'production') {
    return seen || '';
  }
  const rep = normalizeIp(reported);
  if (seen && !isLoopbackIp(seen)) return seen;
  if (isValidIp(rep) && !isLoopbackIp(rep)) return rep;
  if (seen) return seen;
  if (isValidIp(rep)) return rep;
  return '';
};

const isIpAllowed = (req) => {
  const raw = (process.env.DASHBOARD_IP_ALLOWLIST || '').trim();
  if (!raw) return true;
  const allowed = raw.split(',').map(s => s.trim()).filter(Boolean);
  if (!allowed.length) return true;
  const ip = getClientIp(req);

  if (!ip) return false;
  return allowed.some(a => ip === a || ip.endsWith(`:${a}`) || ip === `::ffff:${a}`);
};

const assertSecurityConfig = () => {
  const appUrl = (process.env.APP_URL || '').toLowerCase();
  const isLocal = appUrl.includes('localhost') || appUrl.includes('127.0.0.1');

  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    console.error('❌ JWT_SECRET must be at least 32 random characters. Refusing to start.');
    process.exit(1);
  }
  if (/change_me|your_|example|secret123|replace_with|xxxxxxxx|placeholder/i.test(secret)) {
    console.error('❌ JWT_SECRET looks like a placeholder. Set a real random secret.');
    process.exit(1);
  }

  const adminUsername = getAdminUsername();
  if (!adminUsername) {
    console.error('❌ ADMIN_USERNAME is required. Private dashboard must be locked to one owner.');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    if (!process.env.ADMIN_PASSWORD || process.env.ADMIN_PASSWORD.length < 5) {
      console.error('❌ ADMIN_PASSWORD is required.');
      process.exit(1);
    }
  }

  if (!process.env.MONGODB_URI) {
    console.error('❌ MONGODB_URI is required.');
    process.exit(1);
  }

  if (process.env.NODE_ENV === 'production') {
    if (!appUrl.startsWith('https://') && !isLocal) {
      console.error('❌ APP_URL must be https:// in production (secure cookies + HSTS + CSRF origin).');
      process.exit(1);
    }

    if (!process.env.DASHBOARD_TRANSPORT_KEY || !String(process.env.DASHBOARD_TRANSPORT_KEY).trim()) {
      console.error('❌ DASHBOARD_TRANSPORT_KEY is required in production (RSA PKCS8 PEM for dashboard encryption).');
      process.exit(1);
    }

    const trust = (process.env.TRUST_PROXY || '').trim();
    if (!trust || trust === 'false' || trust === '0') {
      console.error('❌ TRUST_PROXY must be set in production behind a reverse proxy (e.g. true or 1).');
      process.exit(1);
    }

    if (process.env.REQUIRE_SDK_SIGNATURE === 'false' || process.env.REQUIRE_SDK_ENCRYPTION === 'false') {
      console.error('❌ SDK signature and encryption must stay enabled in production.');
      process.exit(1);
    }

    if (process.env.VPN_FAIL_OPEN === 'true') {
      console.error('❌ VPN_FAIL_OPEN cannot be true in production.');
      process.exit(1);
    }

    if (process.env.ALLOW_KEY_AUTO_REGISTER === undefined) {
      console.error('❌ ALLOW_KEY_AUTO_REGISTER must be set explicitly in production (true or false).');
      process.exit(1);
    }

    if (!isLocal) {
      const pinRaw = (process.env.SDK_SSL_PINS || process.env.SDK_SSL_PIN || '').trim();
      const pinOk = pinRaw
        .split(',')
        .map((p) => p.trim().toLowerCase())
        .filter((p) => /^[0-9a-f]{64}$/.test(p));
      if (!pinOk.length) {
        console.error('❌ SDK_SSL_PINS must be set in production (SHA-256 of your TLS cert, 64 hex). Clients embed this pin.');
        process.exit(1);
      }
    }

    const fileKey = (process.env.FILE_ENCRYPTION_KEY || '').trim();
    if (!fileKey) {
      console.error('❌ FILE_ENCRYPTION_KEY must be set in production (do not reuse JWT_SECRET).');
      process.exit(1);
    }
    if (fileKey.length < 32) {
      console.error('❌ FILE_ENCRYPTION_KEY must be at least 32 characters (e.g. openssl rand -hex 32).');
      process.exit(1);
    }
    if (fileKey === (process.env.JWT_SECRET || '').trim()) {
      console.warn('⚠️  FILE_ENCRYPTION_KEY equals JWT_SECRET — set a separate key when you can.');
    }

    const ticketKey = (process.env.FILE_TICKET_SECRET || '').trim();
    if (ticketKey.length < 32) {
      console.error('❌ FILE_TICKET_SECRET must be set to at least 32 random characters in production.');
      process.exit(1);
    }
    if (ticketKey === secret || ticketKey === fileKey) {
      console.error('❌ FILE_TICKET_SECRET must be separate from JWT_SECRET and FILE_ENCRYPTION_KEY.');
      process.exit(1);
    }

    if (!String(process.env.DISCORD_SECURITY_WEBHOOK || '').trim()) {
      console.warn('⚠️  DISCORD_SECURITY_WEBHOOK is not set — EXE protection alerts will not reach Discord.');
    }

    if (!isLocal) {
      const packUrl = (process.env.REMOTE_PACKAGE_URL || '').trim();
      if (!packUrl.startsWith('https://')) {
        console.error('❌ REMOTE_PACKAGE_URL must be set in production (https MediaFire / external archive link).');
        process.exit(1);
      }
      const packPass = (process.env.REMOTE_PACKAGE_PASSWORD || '').trim();
      if (!packPass) {
        console.error('❌ REMOTE_PACKAGE_PASSWORD must be set in production (archive ZIP/RAR password).');
        process.exit(1);
      }
      if (!isStrongPassword(packPass)) {
        console.error(`❌ REMOTE_PACKAGE_PASSWORD is too weak. ${PASSWORD_HINT}`);
        process.exit(1);
      }
    }

    const sdkRaw = (process.env.SDK_MASTER_KEY || '').trim();
    let sdkMaster = null;
    if (/^[0-9a-f]{64}$/i.test(sdkRaw)) {
      sdkMaster = Buffer.from(sdkRaw, 'hex');
    } else if (/^[A-Za-z0-9_-]+$/.test(sdkRaw) && sdkRaw.length >= 43) {
      try {
        sdkMaster = Buffer.from(sdkRaw, 'base64url');
      } catch {
        sdkMaster = null;
      }
    } else if (sdkRaw.length >= 32) {
      sdkMaster = Buffer.from(sdkRaw, 'utf8');
    }
    if (!sdkMaster || sdkMaster.length < 32) {
      console.error('❌ SDK_MASTER_KEY must be set in production (48-byte base64url, 64 hex, or 32+ UTF-8 bytes).');
      process.exit(1);
    }
  }


  const botSecret = process.env.BOT_SECRET || '';
  if (botSecret) {
    if (/replace_with|change_me|example|your_/i.test(botSecret)) {
      console.error('❌ BOT_SECRET looks like a placeholder. Set a real secret or leave empty.');
      process.exit(1);
    }
    if (botSecret.length < 32) {
      console.error('❌ BOT_SECRET must be 32+ random characters (or leave empty to disable).');
      process.exit(1);
    }
    if (process.env.NODE_ENV === 'production' && !isLocal) {
      const allow = (process.env.BOT_ALLOWED_APP_IDS || '').trim();
      if (!allow) {
        console.error('❌ BOT_ALLOWED_APP_IDS is required in production when BOT_SECRET is set.');
        process.exit(1);
      }
    }
  }

  if (process.env.REQUIRE_SDK_SIGNATURE === 'false') {
    console.warn('⚠️  REQUIRE_SDK_SIGNATURE=false — HMAC signatures are OFF (unsafe)');
  }

  if (process.env.REQUIRE_SDK_ENCRYPTION === 'false') {
    console.warn('⚠️  REQUIRE_SDK_ENCRYPTION=false — AES-GCM body encryption is OFF (unsafe)');
  }

  if (allowKeyAutoRegister()) {
    console.warn('⚠️  Key-only license login is ON (ALLOW_KEY_AUTO_REGISTER)');
  }

  if (!(process.env.SDK_SSL_PINS || process.env.SDK_SSL_PIN || '').trim()) {
    console.warn('⚠️  SDK_SSL_PINS is not set — downloaded SDKs will not pin TLS.');
  }

  if (!(process.env.FILE_ENCRYPTION_KEY || '').trim()) {
    console.warn('⚠️  FILE_ENCRYPTION_KEY unset — sealing falls back to JWT_SECRET.');
  }
  if (process.env.ALLOW_LEGACY_PLAINTEXT_VAULT === 'true') {
    console.warn('⚠️  ALLOW_LEGACY_PLAINTEXT_VAULT=true — unsealed legacy values are accepted.');
  }
};

const LOCK_THRESHOLD = Number(process.env.LOGIN_LOCK_THRESHOLD || 5);
const LOCK_MINUTES = Number(process.env.LOGIN_LOCK_MINUTES || 15);

const isDangerousKey = (key) => {
  const k = String(key);
  return (
    k === '__proto__'
    || k === 'prototype'
    || k === 'constructor'
    || k.startsWith('$')
    || k.includes('.')
    || k.includes('\0')
  );
};

const jsonReviver = (key, value) => (key && isDangerousKey(key) ? undefined : value);

const safeJsonParse = (text) => JSON.parse(String(text || ''), jsonReviver);

const stripMongoOperators = (value, depth = 0) => {
  if (depth > 12) return null;
  if (Array.isArray(value)) return value.map((v) => stripMongoOperators(v, depth + 1));
  if (value && typeof value === 'object') {
    if (value instanceof Date || Buffer.isBuffer(value)) return value;
    const out = Object.create(null);
    for (const key of Object.keys(value)) {
      if (isDangerousKey(key)) continue;
      out[key] = stripMongoOperators(value[key], depth + 1);
    }
    return out;
  }
  return value;
};

const asSafeString = (value, max = 256) => {
  if (typeof value !== 'string' && typeof value !== 'number') return '';
  return String(value).trim().slice(0, max);
};

const isValidLoginIdentifier = (value) => {
  const v = asSafeString(value, 60);
  if (!v || v.length < 3) return false;
  return /^[A-Za-z0-9_@. -]+$/.test(v);
};

const isObjectId = (value) => /^[0-9a-fA-F]{24}$/.test(String(value ?? ''));

const escapeRegex = (value) => String(value).replace(/[-[\]{}()*+?.,\\^$|#\s]/g, '\\$&');

const isDiscordWebhookUrl = (url) => {
  const s = String(url || '').trim();
  return /^https:\/\/discord(?:app)?\.com\/api\/webhooks\/\d+\/[\w-]+$/.test(s);
};

const pickObjectIds = (list, max = 500) => {
  if (!Array.isArray(list)) return [];
  const seen = new Set();
  for (const raw of list) {
    if (seen.size >= max) break;
    const id = String(raw ?? '').trim();
    if (isObjectId(id)) seen.add(id);
  }
  return [...seen];
};

module.exports = {
  getAdminUsername,
  isDashboardOwner,
  requireSdkSignature,
  requireSdkEncryption,
  sdkTimestampSkewSeconds,
  parseUtcSeconds,
  allowKeyAutoRegister,
  sdkSslPins,
  setAuthCookie,
  setCsrfCookie,
  clearAuthCookie,
  getTokenFromRequest,
  issueDashboardSession,
  dashboardSessionValid,
  dashboardCsrfValid,
  dashboardSessionUnset,
  SESSION_MS,
  SESSION_IDLE_MS,
  dashboardIpPrefix,
  dashboardUaHash,
  safeEqual,
  sha256,
  isStrongPassword,
  PASSWORD_HINT,
  getClientIp,
  rateLimitKey,
  resolveClientIp,
  resolveSessionIp,
  normalizeIp,
  isIpAllowed,
  assertDashboardOrigin,
  assertSecurityConfig,
  stripMongoOperators,
  jsonReviver,
  safeJsonParse,
  asSafeString,
  isValidLoginIdentifier,
  isObjectId,
  pickObjectIds,
  escapeRegex,
  isDiscordWebhookUrl,
  dummyPasswordCheck,
  warmDummyPasswordHashes,
  LOCK_THRESHOLD,
  LOCK_MINUTES,
};
