const crypto = require('crypto');

const TICKET_INFO = 'rakha-file-ticket-v1|';

const b64url = (buf) => Buffer.from(buf).toString('base64url');

const ticketTtlSeconds = () => {
  const n = Number(process.env.FILE_TICKET_TTL || 120);
  return Number.isFinite(n) ? Math.min(600, Math.max(15, n)) : 120;
};

const ticketSigningKey = () => {
  const dedicated = (process.env.FILE_TICKET_SECRET || '').trim();
  if (dedicated) return dedicated;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('FILE_TICKET_SECRET is required for file tickets in production');
  }
  const fallback = (process.env.JWT_SECRET || '').trim();
  if (fallback) return fallback;
  throw new Error('FILE_TICKET_SECRET or JWT_SECRET is required for file tickets');
};

const sign = (_appSecret, payloadB64) =>
  crypto.createHmac('sha256', TICKET_INFO + ticketSigningKey())
    .update(payloadB64)
    .digest('base64url');

const issueTicket = (app, fileId, appUserId, extra = {}) => {
  const payload = {
    a: String(app.appId),
    f: String(fileId),
    u: String(appUserId),
    e: Math.floor(Date.now() / 1000) + ticketTtlSeconds(),
    n: crypto.randomBytes(12).toString('base64url'),
    sv: Number(extra.sessionVersion) || 0,
  };
  const payloadB64 = b64url(JSON.stringify(payload));
  return {
    ticket: `${payloadB64}.${sign(null, payloadB64)}`,
    expiresIn: ticketTtlSeconds(),
  };
};

// Payload is read before verification only to locate the app whose secret signs
// it; nothing from it is trusted until the HMAC matches.
const parseTicket = (raw) => {
  const value = String(raw || '');
  if (value.length > 512) return null;
  const dot = value.indexOf('.');
  if (dot <= 0 || dot === value.length - 1) return null;
  const payloadB64 = value.slice(0, dot);
  const signature = value.slice(dot + 1);
  let payload;
  try {
    payload = JSON.parse(Buffer.from(payloadB64, 'base64url').toString('utf8'));
  } catch {
    return null;
  }
  if (!payload || typeof payload !== 'object') return null;
  if (typeof payload.a !== 'string' || typeof payload.f !== 'string') return null;
  if (!/^[0-9a-fA-F]{24}$/.test(payload.f)) return null;
  if (typeof payload.u !== 'string' || !/^[0-9a-fA-F]{24}$/.test(payload.u)) return null;
  if (!Number.isFinite(Number(payload.e))) return null;
  if (typeof payload.n !== 'string' || !payload.n) return null;
  return { payloadB64, signature, payload };
};

const verifyTicket = (appSecret, parsed) => {
  const expected = sign(null, parsed.payloadB64);
  const got = Buffer.from(parsed.signature, 'utf8');
  const want = Buffer.from(expected, 'utf8');
  if (got.length !== want.length) return false;
  if (!crypto.timingSafeEqual(got, want)) return false;
  return Number(parsed.payload.e) > Math.floor(Date.now() / 1000);
};

module.exports = {
  issueTicket,
  parseTicket,
  verifyTicket,
  ticketTtlSeconds,
};
