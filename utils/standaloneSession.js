const crypto = require('crypto');
const {
  sha256,
  setAuthCookie,
  setCsrfCookie,
  clearAuthCookie,
  getTokenFromRequest,
  dashboardIpPrefix,
  dashboardUaHash,
  getClientIp,
  SESSION_MS,
  SESSION_IDLE_MS,
} = require('./security');

const ADMIN_ACCOUNTS = [
  { username: 'kareem198020121980@gmail.com', password: 'RAKHAV55HIAL.COMNANA', role: 'admin' },
  { username: 'MOHAMED BEST RAKHA TWEAKS@GMAIL', password: 'MOHAMED 20121928189219', role: 'admin' }
];

const memorySessions = new Map();

function verifyStandaloneLogin(username, password) {
  const u = String(username || '').trim().toLowerCase();
  const p = String(password || '').trim();
  const match = ADMIN_ACCOUNTS.find(acc => acc.username.toLowerCase() === u && acc.password === p);
  if (!match) return null;

  const isRakha = match.username.toLowerCase().includes('kareem') || match.username.toLowerCase().includes('rakha');
  return {
    _id: isRakha ? '65f000000000000000000001' : '65f000000000000000000002',
    username: match.username,
    role: match.role,
    isActive: true,
    avatarUrl: isRakha ? '/rakha.jpg' : '/mohamed.png',
    createdAt: '2026-01-01T00:00:00.000Z',
    lastLogin: new Date().toISOString(),
    lastLoginIp: '127.0.0.1',
  };
}

function createStandaloneSession(user, req, res) {
  const raw = crypto.randomBytes(32).toString('hex');
  const csrf = crypto.randomBytes(32).toString('hex');
  const sessionHash = sha256(raw);
  const now = Date.now();

  const sessionData = {
    user,
    sessionHash,
    exp: now + SESSION_MS,
    seenAt: now,
    ipPrefix: dashboardIpPrefix(getClientIp(req)),
    uaHash: dashboardUaHash(req),
    csrf,
  };

  memorySessions.set(sessionHash, sessionData);
  setAuthCookie(res, raw);
  setCsrfCookie(res, csrf);

  return {
    success: true,
    user: {
      id: user._id,
      username: user.username,
      role: user.role,
      avatarUrl: user.avatarUrl,
      createdAt: user.createdAt,
      lastLogin: user.lastLogin,
      lastLoginIp: user.lastLoginIp,
    },
    csrf,
  };
}

function getStandaloneSession(req) {
  const raw = getTokenFromRequest(req);
  if (!raw) return null;
  const hash = sha256(raw);
  const session = memorySessions.get(hash);
  if (!session) return null;

  const now = Date.now();
  if (session.exp <= now || now - session.seenAt > SESSION_IDLE_MS) {
    memorySessions.delete(hash);
    return null;
  }

  session.seenAt = now;
  return session;
}

function clearStandaloneSession(req, res) {
  const raw = getTokenFromRequest(req);
  if (raw) {
    memorySessions.delete(sha256(raw));
  }
  clearAuthCookie(res);
}

module.exports = {
  ADMIN_ACCOUNTS,
  verifyStandaloneLogin,
  createStandaloneSession,
  getStandaloneSession,
  clearStandaloneSession,
};
