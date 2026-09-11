const crypto = require('crypto');
const { sealString, openString } = require('./fileVault');

const SEALED_RE = /^v1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/;

const isSealed = (value) => SEALED_RE.test(String(value || ''));

const wrap = (value) => {
  if (value == null) return '';
  const s = String(value);
  if (!s) return '';
  if (isSealed(s)) return s;
  return sealString(s);
};

const peek = (value) => {
  if (value == null) return '';
  const s = String(value);
  if (!s) return '';
  if (!isSealed(s)) return s;
  try {
    return openString(s);
  } catch {
    return '';
  }
};

const purposeKey = (purpose) => {
  const secret = process.env.FILE_ENCRYPTION_KEY || process.env.JWT_SECRET || '';
  return crypto.createHmac('sha256', `rakha-blind-v1|${purpose}`).update(secret, 'utf8').digest();
};

const blind = (purpose, value) => {
  const canon = String(value || '').trim();
  if (!canon) return '';
  return crypto.createHmac('sha256', purposeKey(purpose)).update(canon, 'utf8').digest('hex');
};

const looksLikeHash = (value) => /^[0-9a-f]{64}$/i.test(String(value || ''));

const keyTrim = (plain) => String(plain || '').trim();

const keyCanon = (plain) => keyTrim(plain).toUpperCase();

const exactStrEqual = (a, b) => {
  if (typeof a !== 'string' || typeof b !== 'string') return false;
  const hashA = crypto.createHash('sha256').update(a, 'utf8').digest();
  const hashB = crypto.createHash('sha256').update(b, 'utf8').digest();
  return crypto.timingSafeEqual(hashA, hashB);
};

// Store and verify the key exactly as shown on the panel (case-sensitive).
const keyBlind = (plain) => blind('license-key', keyTrim(plain));

// Legacy rows were hashed from upper/lower forms; keep those for lookup only.
const keyHashVariants = (plain) => {
  const t = keyTrim(plain);
  if (!t) return [];
  const variants = new Set([
    keyBlind(t),
    blind('license-key', t.toUpperCase()),
    blind('license-key', t.toLowerCase()),
  ]);
  return [...variants].filter(Boolean);
};

const keyHashClause = (plain) => {
  const variants = keyHashVariants(plain);
  if (!variants.length) return null;
  return variants.length === 1 ? variants[0] : { $in: variants };
};

const packLicense = (plain) => {
  const p = keyTrim(plain);
  if (!p) return { keyHash: '', keySealed: '' };
  return { keyHash: keyBlind(p), keySealed: wrap(p) };
};

const userBlind = (appId, username) =>
  blind('username', `${String(appId || '')}|${String(username || '').trim()}`);

const revealLicense = (doc) => {
  if (!doc) return '';
  const fromSeal = peek(doc.keySealed);
  if (fromSeal) return fromSeal;
  const raw = doc.key;
  if (raw && !isSealed(raw) && !looksLikeHash(raw)) return String(raw);
  return peek(raw);
};

const packUser = (appId, username) => {
  const p = String(username || '').trim();
  if (!p) return { usernameHash: '', usernameSealed: '', username: '' };
  const usernameHash = userBlind(appId, p);
  return { usernameHash, usernameSealed: wrap(p), username: usernameHash };
};

const revealUser = (doc) => {
  if (!doc) return '';
  const fromSeal = peek(doc.usernameSealed);
  if (fromSeal) return fromSeal;
  const raw = doc.username;
  if (raw && !isSealed(raw) && !looksLikeHash(raw)) return String(raw);
  return peek(raw);
};

const userLookupFilter = (appId, username) => {
  const plain = String(username || '').trim();
  const canon = plain.toUpperCase();
  const hashes = new Set([userBlind(appId, plain)]);
  if (canon !== plain) hashes.add(userBlind(appId, canon));
  const or = [];
  for (const hash of hashes) {
    or.push({ usernameHash: hash }, { username: hash });
  }
  if (plain && !looksLikeHash(plain)) {
    or.push({ username: plain });
    if (canon !== plain) or.push({ username: canon });
  }
  return { app: appId, $or: or };
};

const revealVariable = (doc) => {
  if (!doc) return '';
  return peek(doc.value);
};

const licenseMatchesTyped = (doc, typed) => {
  const key = keyTrim(typed);
  if (!doc || !key) return false;
  const revealed = revealLicense(doc);
  if (revealed) return exactStrEqual(revealed, key);
  if (doc.keyHash && looksLikeHash(doc.keyHash)) {
    return exactStrEqual(String(doc.keyHash), keyBlind(key));
  }
  return false;
};

const licenseBoundUserId = (doc) => {
  const bound = doc?.boundUser;
  if (!bound) return '';
  if (typeof bound === 'object' && bound._id) return String(bound._id);
  return String(bound);
};

const licenseInUse = (doc) => {
  if (!doc) return false;
  if (licenseBoundUserId(doc)) return true;
  if (Number(doc.currentUses) > 0) return true;
  if (doc.activatedAt) return true;
  if (doc.lastUsed) return true;
  return false;
};

const effectiveLicenseStatus = (doc, now = Date.now()) => {
  const status = String(doc?.status || 'unused');
  if (status === 'banned' || status === 'paused') return status;
  const expMs = doc?.expireDate ? new Date(doc.expireDate).getTime() : NaN;
  if (status === 'expired' || (Number.isFinite(expMs) && expMs <= now)) return 'expired';
  if (licenseInUse(doc)) return 'active';
  return status;
};

module.exports = {
  isSealed,
  wrap,
  peek,
  blind,
  looksLikeHash,
  keyBlind,
  keyTrim,
  keyCanon,
  keyHashVariants,
  keyHashClause,
  packLicense,
  revealLicense,
  licenseMatchesTyped,
  licenseBoundUserId,
  licenseInUse,
  effectiveLicenseStatus,
  packUser,
  revealUser,
  userBlind,
  userLookupFilter,
  revealVariable,
};
