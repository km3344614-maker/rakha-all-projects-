const crypto = require('crypto');
const mongoose = require('mongoose');
const { getClientIp, safeEqual, sha256, normalizeIp } = require('./security');

const issueSessionToken = () => {
  const token = crypto.randomBytes(32).toString('hex');
  return { token, hash: sha256(token) };
};

const sessionMatches = (appUser, rawToken) => {
  if (!rawToken || !appUser) return false;
  const got = sha256(String(rawToken));
  const hashes = [];
  if (appUser.sessionTokenHash) hashes.push(appUser.sessionTokenHash);
  if (Array.isArray(appUser.sessionTokenHashes)) {
    for (const h of appUser.sessionTokenHashes) {
      if (h) hashes.push(h);
    }
  }
  if (!hashes.length) return false;
  return hashes.some((h) => safeEqual(h, got));
};

const sessionTtlSeconds = (app) => {
  const n = Number(app?.sessionExpirySeconds);
  return Number.isFinite(n) ? Math.min(86400, Math.max(30, n)) : 300;
};

const sessionExpired = (app, appUser) => {
  const ttl = sessionTtlSeconds(app);
  if (!appUser?.lastSeen) return true;
  const ageMs = Date.now() - new Date(appUser.lastSeen).getTime();
  return ageMs > ttl * 1000;
};

const sessionRemainingSeconds = (app, appUser) => {
  const ttl = sessionTtlSeconds(app);
  if (!appUser?.lastSeen) return 0;
  const ageSec = Math.floor((Date.now() - new Date(appUser.lastSeen).getTime()) / 1000);
  return Math.max(0, ttl - ageSec);
};

const clearSessionFields = () => ({
  sessionTokenHash: null,
  sessionTokenHashes: [],
});

const sessionTokenFilter = (rawToken) => {
  const got = sha256(String(rawToken || ''));
  return {
    $or: [
      { sessionTokenHash: got },
      { sessionTokenHashes: got },
    ],
  };
};

const revokeSessionOp = () => ({
  $set: {
    lastSeen: new Date(0),
    sessionKilled: true,
    // Overwrite with a hash no client holds so an in-flight heartbeat
    // cannot match the old token and restore lastSeen.
    sessionTokenHash: crypto.createHash('sha256')
      .update(`killed:${Date.now()}:${crypto.randomBytes(16).toString('hex')}`)
      .digest('hex'),
    sessionTokenHashes: [],
  },
  $inc: { sessionVersion: 1 },
});

const toObjectIds = (ids) => {
  const out = [];
  for (const raw of ids || []) {
    const s = String(raw || '');
    if (!mongoose.Types.ObjectId.isValid(s) || s.length !== 24) continue;
    out.push(new mongoose.Types.ObjectId(s));
  }
  return out;
};

// Find with Mongoose (casts app id), then write by _id on the native collection
// so select:false hashes and the visible sessionKilled flag both persist.
const killAppUserSessions = async (AppUser, { appId, userIds }) => {
  const ids = toObjectIds(userIds);
  if (!ids.length) return { matched: 0, modified: 0 };
  let found = await AppUser.find({ _id: { $in: ids }, app: appId }).select('_id').lean();
  if (!found.length) {
    found = await AppUser.find({ _id: { $in: ids } }).select('_id app').lean();
    const appStr = String(appId || '');
    found = found.filter((u) => String(u.app || '') === appStr);
  }
  if (!found.length) return { matched: 0, modified: 0 };
  const foundIds = found.map((u) => u._id);
  const op = revokeSessionOp();
  await AppUser.collection.updateMany({ _id: { $in: foundIds } }, op);
  await AppUser.updateMany({ _id: { $in: foundIds } }, op);
  return { matched: found.length, modified: found.length };
};

const killAllAppSessions = async (AppUser, appId) => {
  const users = await AppUser.find({ app: appId }).select('_id').lean();
  if (!users.length) return { matched: 0, modified: 0 };
  return killAppUserSessions(AppUser, { appId, userIds: users.map((u) => u._id) });
};

const activeSessionFilter = (app) => {
  const ttl = sessionTtlSeconds(app);
  const cutoff = new Date(Date.now() - ttl * 1000);
  return {
    app: app._id,
    status: 'active',
    sessionKilled: { $ne: true },
    lastSeen: { $gte: cutoff, $gt: new Date(1000) },
  };
};

const countActiveSessions = async (AppUser, app) =>
  AppUser.countDocuments(activeSessionFilter(app));

const vpnCache = new Map();
const VPN_CACHE_MS = 15 * 60 * 1000;
const VPN_NULL_CACHE_MS = 45 * 1000;

// NOTE: normalizeIp is imported from security.js — keep a local alias so
// callers inside this module don't need to change.

const isPrivateOrLocalIp = (ip) => {
  const clean = normalizeIp(ip);
  if (
    !clean
    || clean === '127.0.0.1'
    || clean === '::1'
    || clean.startsWith('192.168.')
    || clean.startsWith('10.')
    || /^172\.(1[6-9]|2\d|3[0-1])\./.test(clean)
  ) {
    return true;
  }
  return false;
};

const resolveVpnClientIp = (req) => getClientIp(req) || '';

const fetchJson = async (url, timeoutMs) => {
  const ctrl = AbortSignal.timeout(timeoutMs);
  const res = await fetch(url, {
    signal: ctrl,
    headers: { Accept: 'application/json', 'User-Agent': 'RakhaAuth/1.0' },
  });
  if (!res.ok) return null;
  return res.json();
};

const VPN_TYPE_RE = /\b(vpn|tor|socks|socks4|socks5|compromised|open\s*proxy)\b/i;

const cacheVpnResult = (clean, blocked, ttlMs) => {
  vpnCache.set(clean, { blocked, until: Date.now() + ttlMs });
  if (vpnCache.size > 5000) {
    const first = vpnCache.keys().next().value;
    vpnCache.delete(first);
  }
};

const isVpnOrProxyIp = async (ip) => {
  const clean = normalizeIp(ip);
  if (isPrivateOrLocalIp(clean)) return false;

  const cached = vpnCache.get(clean);
  if (cached && cached.until > Date.now()) return cached.blocked;

  const enc = encodeURIComponent(clean);
  let hardBlock = 0;
  let softHost = 0;
  let cleanVote = 0;

  const lookups = await Promise.allSettled([
    fetchJson(`https://proxycheck.io/v2/${enc}?vpn=1&asn=1`, 3000).then((data) => {
      if (!data || data.status !== 'ok') return null;
      const node = data[clean] || data[Object.keys(data).find((k) => k !== 'status')];
      if (!node || typeof node !== 'object') return null;
      const proxyYes = String(node.proxy || '').toLowerCase() === 'yes';
      const type = String(node.type || '');
      if (proxyYes || VPN_TYPE_RE.test(type)) return 'block';
      if (String(node.proxy || '').toLowerCase() === 'no') {
        if (/residential/i.test(type)) return 'clean';
        return 'clean';
      }
      return null;
    }),
    fetchJson(`https://ipwho.is/${enc}`, 3000).then((data) => {
      if (!data || data.success === false) return null;
      const sec = data.security;
      if (!sec || typeof sec !== 'object' || !Object.keys(sec).length) return null;
      if (sec.vpn || sec.proxy || sec.tor) return 'block';
      if (sec.hosting) return 'hosting';
      return 'clean';
    }),
  ]);

  for (const r of lookups) {
    if (r.status !== 'fulfilled' || r.value == null) continue;
    if (r.value === 'block') hardBlock += 1;
    else if (r.value === 'hosting') softHost += 1;
    else if (r.value === 'clean') cleanVote += 1;
  }

  let blocked = null;
  if (hardBlock > 0) blocked = true;
  else if (softHost > 0 && cleanVote === 0) blocked = true;
  else if (softHost > 0 && cleanVote > 0) blocked = false;
  else if (cleanVote > 0) blocked = false;

  if (blocked === null) {
    cacheVpnResult(clean, null, VPN_NULL_CACHE_MS);
    return null;
  }

  cacheVpnResult(clean, blocked, VPN_CACHE_MS);
  return blocked;
};

const assertVpnAllowed = async (app, req, opts = {}) => {
  if (!app.vpnBlock) return { ok: true };

  try {
    const soft = opts.soft === true || process.env.VPN_FAIL_OPEN === 'true';
    const ip = resolveVpnClientIp(req);
    if (!ip || isPrivateOrLocalIp(ip)) {
      if (soft) return { ok: true, warning: 'client_ip_unresolved' };
      return {
        ok: false,
        message: 'Connection check failed',
      };
    }

    const blocked = await isVpnOrProxyIp(ip);
    if (blocked === true) {
      return { ok: false, message: 'VPN not allowed' };
    }
    if (blocked === null) {
      if (soft) return { ok: true, warning: 'vpn_check_inconclusive' };
      return {
        ok: false,
        message: 'Connection check failed',
      };
    }
    return { ok: true };
  } catch (e) {
    console.error('[sdk] vpn check:', e.message);
    if (opts.soft === true) return { ok: true, warning: 'vpn_check_error' };
    return { ok: false, message: 'Connection check failed' };
  }
};

const seenNonces = new Map();
let lastNonceSweep = 0;

const NONCE_TTL_MS = 130000;

const consumeNonceMemory = (key, ttlMs = NONCE_TTL_MS) => {
  const now = Date.now();
  if (now - lastNonceSweep > 30000) {
    lastNonceSweep = now;
    for (const [k, exp] of seenNonces) {
      if (exp <= now) seenNonces.delete(k);
    }
  }
  if (seenNonces.has(key)) return false;
  if (seenNonces.size >= 50000) {
    const oldest = seenNonces.keys().next().value;
    if (oldest) seenNonces.delete(oldest);
  }
  seenNonces.set(key, now + ttlMs);
  return true;
};

// ttlMs must be at least as long as the credential the nonce protects, or the
// record expires while that credential is still accepted and replay reopens.
const APP_KID_INFO = 'rakha-kid-v1|';

const appKidOf = (appId) => sha256(`${APP_KID_INFO}${String(appId || '').trim()}`);

const consumeNonce = async (appId, nonce, ttlMs = NONCE_TTL_MS) => {
  const n = String(nonce || '').trim();
  if (!n || n.length < 8 || n.length > 128) return false;
  if (!/^[A-Za-z0-9._~+\-/=]+$/.test(n)) return false;
  const key = `${appId}:${n}`;
  const life = Math.max(NONCE_TTL_MS, Number(ttlMs) || 0);
  const expiresAt = new Date(Date.now() + life);
  if (!consumeNonceMemory(key, life)) return false;
  try {
    const SdkNonce = require('../models/SdkNonce');
    await SdkNonce.create({ _id: key, expiresAt });
    return true;
  } catch (e) {
    if (e && e.code === 11000) return false;
    seenNonces.delete(key);
    throw e;
  }
};

module.exports = {
  issueSessionToken,
  sessionMatches,
  sessionExpired,
  sessionRemainingSeconds,
  sessionTtlSeconds,
  clearSessionFields,
  sessionTokenFilter,
  revokeSessionOp,
  killAppUserSessions,
  killAllAppSessions,
  activeSessionFilter,
  countActiveSessions,
  assertVpnAllowed,
  consumeNonce,
  appKidOf,
};
