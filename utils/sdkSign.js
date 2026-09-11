const crypto = require('crypto');
const { safeEqual } = require('./security');

const hmacHex = (secret, data) =>
  crypto.createHmac('sha256', String(secret || '')).update(data, 'utf8').digest('hex');

const canonicalPath = (url) => {
  const raw = String(url || '');
  const path = raw.split('?')[0];
  return path || '/';
};

const signV2 = (secret, ts, nonce, method, path, body) =>
  hmacHex(
    secret,
    `${ts}\n${nonce}\n${String(method || 'GET').toUpperCase()}\n${canonicalPath(path)}\n${body || ''}`
  );

const verifySdkSignature = (secret, signature, ts, nonce, method, path, body) => {
  const v2 = signV2(secret, ts, nonce, method, path, body);
  return safeEqual(String(signature || ''), v2);
};

const INFO_HS1 = 'rakha-hs1-v1|';
const INFO_HS2 = 'rakha-hs2-v1|';
const INFO_VERIFY = 'rakha-verify-v1|';
const INFO_SESS = 'rakha-sess-v1|';
const INFO_RESP = 'rakha-resp-v1|';
const INFO_S2C = 'rakha-s2c-v1|';

const issueHs1 = (secret) => {
  const sid = crypto.randomBytes(16).toString('hex');
  const salt = crypto.randomBytes(16).toString('hex');
  const challenge = crypto.randomBytes(32).toString('hex');
  const exp = Math.floor(Date.now() / 1000) + 90;
  const mac = hmacHex(secret, `${INFO_HS1}${sid}|${exp}|${salt}|${challenge}`);
  return {
    session: `${sid}.${exp}.${salt}.${challenge}.${mac}`,
    sid,
    salt,
    challenge,
    exp,
  };
};

const parseHs1 = (secret, token) => {
  const parts = String(token || '').split('.');
  if (parts.length !== 5) return null;
  const [sid, expStr, salt, challenge, mac] = parts;
  const exp = Number(expStr);
  if (!/^[0-9a-f]{32}$/i.test(sid) || !/^[0-9a-f]{32}$/i.test(salt) || !/^[0-9a-f]{64}$/i.test(challenge)) return null;
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  if (!safeEqual(mac, hmacHex(secret, `${INFO_HS1}${sid}|${exp}|${salt}|${challenge}`))) return null;
  return { sid, exp, salt: salt.toLowerCase(), challenge: challenge.toLowerCase() };
};

const clientVerifyHmac = (secret, sid, salt, challenge) =>
  hmacHex(secret, `${INFO_VERIFY}${sid}|${salt}|${challenge}`);

const issueHs2 = (secret, sid, salt) => {
  const configured = Number(process.env.SDK_HS2_TTL_SECONDS || 1800);
  const ttl = Number.isFinite(configured) ? Math.min(3600, Math.max(300, configured)) : 1800;
  const exp = Math.floor(Date.now() / 1000) + ttl;
  const mac = hmacHex(secret, `${INFO_HS2}${sid}|${exp}|${salt}`);
  return `${sid}.${exp}.${salt}.${mac}`;
};

const parseHs2 = (secret, token) => {
  const parts = String(token || '').split('.');
  if (parts.length !== 4) return null;
  const [sid, expStr, salt, mac] = parts;
  const exp = Number(expStr);
  if (!/^[0-9a-f]{32}$/i.test(sid) || !/^[0-9a-f]{32}$/i.test(salt)) return null;
  if (!Number.isFinite(exp) || exp < Math.floor(Date.now() / 1000)) return null;
  if (!safeEqual(mac, hmacHex(secret, `${INFO_HS2}${sid}|${exp}|${salt}`))) return null;
  return { sid, exp, salt: salt.toLowerCase() };
};

const sessionKey = (secret, sid, salt) =>
  hmacHex(secret, `${INFO_SESS}${sid}|${salt}`);

const handshakeServerProof = (secret, sid, salt, challenge, serverTime) =>
  hmacHex(secret, `${INFO_S2C}${sid}|${salt}|${challenge}|${serverTime}`);

const responseProof = (secret, serverTime, rawBody) =>
  hmacHex(secret, `${INFO_RESP}${serverTime}|${rawBody}`);

module.exports = {
  verifySdkSignature,
  issueHs1,
  parseHs1,
  clientVerifyHmac,
  issueHs2,
  parseHs2,
  sessionKey,
  handshakeServerProof,
  responseProof,
};
