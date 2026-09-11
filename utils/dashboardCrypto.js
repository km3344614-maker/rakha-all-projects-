const crypto = require('crypto');
const { safeJsonParse, stripMongoOperators, assertDashboardOrigin } = require('./security');

const ENC = 3;
const AES_LEN = 32;
const IV_LEN = 12;
const TAG_LEN = 16;
const EK_HEADER = 'x-sa-ek';
const MAX_DASH_CIPHERTEXT_B64 = 256 * 1024;

let cached = null;

const loadKeys = () => {
  if (cached) return cached;
  const pem = (process.env.DASHBOARD_TRANSPORT_KEY || '').trim().replace(/\\n/g, '\n');
  if (pem && pem.includes('BEGIN')) {
    try {
      const privateKey = crypto.createPrivateKey(pem);
      const publicKey = crypto.createPublicKey(privateKey);
      cached = { privateKey, publicKey };
      return cached;
    } catch (e) {}
  }
  cached = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
  return cached;
};

const getSpkiB64 = () =>
  loadKeys().publicKey.export({ type: 'spki', format: 'der' }).toString('base64');

const isCipherEnvelope = (obj) =>
  obj
  && typeof obj === 'object'
  && !Array.isArray(obj)
  && Number(obj.enc) === ENC
  && typeof obj.iv === 'string'
  && typeof obj.tag === 'string'
  && typeof obj.data === 'string';

const isDashEnvelope = (obj) =>
  isCipherEnvelope(obj) && typeof obj.ek === 'string';

const b64 = (value, label, expectedLen) => {
  if (String(value || '').length > MAX_DASH_CIPHERTEXT_B64) {
    throw new Error(`Invalid ${label}`);
  }
  const buf = Buffer.from(String(value || ''), 'base64');
  if (expectedLen && buf.length !== expectedLen) {
    throw new Error(`Invalid ${label}`);
  }
  if (!expectedLen && buf.length < 1) {
    throw new Error(`Invalid ${label}`);
  }
  return buf;
};

const unwrapAesKey = (ekB64) => {
  const aesKey = crypto.privateDecrypt(
    {
      key: loadKeys().privateKey,
      padding: crypto.constants.RSA_PKCS1_OAEP_PADDING,
      oaepHash: 'sha256',
    },
    b64(ekB64, 'ek')
  );
  if (aesKey.length !== AES_LEN) throw new Error('Invalid key');
  return aesKey;
};

const canonicalDashboardPath = (url) => {
  let path = String(url || '').split('?')[0] || '/';
  if (path.startsWith('/api/')) path = path.slice(4);
  return path.startsWith('/') ? path : `/${path}`;
};

const dashboardAad = (method, url, direction) =>
  Buffer.from(
    `${String(method || 'GET').toUpperCase()}\n${canonicalDashboardPath(url)}\n${direction}`,
    'utf8'
  );

const decryptJson = (aesKey, envelope, aad) => {
  const iv = b64(envelope.iv, 'iv', IV_LEN);
  const tag = b64(envelope.tag, 'tag', TAG_LEN);
  const data = b64(envelope.data, 'data');
  const decipher = crypto.createDecipheriv('aes-256-gcm', aesKey, iv);
  decipher.setAAD(aad);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(data), decipher.final()]);
  return safeJsonParse(pt.toString('utf8'));
};

const encryptJson = (aesKey, obj, aad) => {
  const iv = crypto.randomBytes(IV_LEN);
  const cipher = crypto.createCipheriv('aes-256-gcm', aesKey, iv);
  cipher.setAAD(aad);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(JSON.stringify(obj), 'utf8')),
    cipher.final(),
  ]);
  return {
    enc: ENC,
    iv: iv.toString('base64'),
    tag: cipher.getAuthTag().toString('base64'),
    data: ct.toString('base64'),
  };
};

const openEnvelope = (body, req) => {
  if (!isDashEnvelope(body)) throw new Error('Invalid envelope');
  const aesKey = unwrapAesKey(body.ek);
  const plain = decryptJson(
    aesKey,
    body,
    dashboardAad(req.method, req.originalUrl || req.url, 'request')
  );
  if (!plain || typeof plain !== 'object' || Array.isArray(plain)) {
    throw new Error('Invalid payload');
  }
  return { plain, aesKey };
};

const deny = (res) =>
  res.status(401).json({ success: false, message: 'Access denied' });

const isLogoutPath = (req) => {
  const path = String(req.path || '');
  return req.method === 'POST' && (path === '/logout' || path.endsWith('/logout'));
};

const hasPlainJson = (body) => {
  if (!body || typeof body !== 'object' || Array.isArray(body)) return false;
  if (!Object.keys(body).length) return false;
  return !isCipherEnvelope(body);
};

const wrapJson = (req, res, aesKey) => {
  const origJson = res.json.bind(res);
  res.json = (payload) => {
    if (isCipherEnvelope(payload)) return origJson(payload);
    return origJson(encryptJson(
      aesKey,
      payload,
      dashboardAad(req.method, req.originalUrl || req.url, 'response')
    ));
  };
};

const dashboardTransport = (req, res, next) => {
  if (req.method === 'OPTIONS') return next();

  if (!assertDashboardOrigin(req)) {
    return res.status(403).json({ success: false, message: 'Origin denied' });
  }

  const headerEk = String(req.headers[EK_HEADER] || '').trim();
  const bodyEk = isCipherEnvelope(req.body) ? String(req.body.ek || '').trim() : '';
  const ek = headerEk || bodyEk;
  const logoutPlain = isLogoutPath(req) && !ek;

  if (!ek) {
    if (logoutPlain) return next();
    return deny(res);
  }

  let aesKey;
  try {
    aesKey = unwrapAesKey(ek);
  } catch {
    return deny(res);
  }
  req.dashAesKey = aesKey;

  const mutating = !['GET', 'HEAD'].includes(req.method);
  if (mutating && isCipherEnvelope(req.body)) {
    try {
      const plain = decryptJson(
        aesKey,
        req.body,
        dashboardAad(req.method, req.originalUrl || req.url, 'request')
      );
      if (!plain || typeof plain !== 'object' || Array.isArray(plain)) {
        throw new Error('Invalid payload');
      }
      req.body = stripMongoOperators(plain);
    } catch {
      return deny(res);
    }
  } else if (mutating && hasPlainJson(req.body)) {
    return deny(res);
  }

  wrapJson(req, res, aesKey);
  next();
};

const requireSealedDashboard = (req, res, next) => {
  if (!req.is('application/json')) return deny(res);
  try {
    const headerEk = String(req.headers[EK_HEADER] || '').trim();
    if (req.dashAesKey && isCipherEnvelope(req.body) && !req.body.ek) {
      const plain = decryptJson(
        req.dashAesKey,
        req.body,
        dashboardAad(req.method, req.originalUrl || req.url, 'request')
      );
      if (!plain || typeof plain !== 'object' || Array.isArray(plain)) {
        throw new Error('Invalid payload');
      }
      req.body = stripMongoOperators(plain);
      return next();
    }
    const { plain, aesKey } = openEnvelope({
      ...(req.body || {}),
      ek: (req.body && req.body.ek) || headerEk,
    }, req);
    req.body = stripMongoOperators(plain);
    req.dashAesKey = aesKey;
    wrapJson(req, res, aesKey);
    next();
  } catch {
    return deny(res);
  }
};

const sendSealed = (req, res, payload, status = 200) => {
  if (!req.dashAesKey) {
    return res.status(500).json({ success: false, message: 'Server error' });
  }
  return res.status(status).json(payload);
};

module.exports = {
  ENC,
  EK_HEADER,
  getSpkiB64,
  dashboardTransport,
  requireSealedDashboard,
  sendSealed,
};
