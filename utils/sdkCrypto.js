const crypto = require('crypto');
const { safeJsonParse } = require('./security');

const INFO_V1 = 'rakha-sdk-aes-v1|';
const INFO_V2 = 'rakha-sdk-aes-v2';
const INFO_V3 = 'rakha-sdk-transport-v3';

const deriveHkdfSalt = (appSecret) =>
  crypto.createHash('sha256')
    .update('rakha-sdk-hkdf-salt-v2|', 'utf8')
    .update(String(appSecret || ''), 'utf8')
    .digest();

const decodeSdkMasterKey = (raw) => {
  const s = String(raw || '').trim();
  if (!s) return null;
  if (/^[0-9a-f]{64}$/i.test(s)) {
    const hex = Buffer.from(s, 'hex');
    return hex.length >= 32 ? hex : null;
  }
  if (/^[A-Za-z0-9_-]+$/.test(s) && s.length >= 43) {
    try {
      const b64 = Buffer.from(s, 'base64url');
      if (b64.length >= 32) return b64;
    } catch {
      /* fall through */
    }
  }
  if (s.length >= 32) return Buffer.from(s, 'utf8');
  return null;
};

const getSdkMasterKey = () => decodeSdkMasterKey(process.env.SDK_MASTER_KEY);

const sdkMasterKeyRequired = () =>
  process.env.NODE_ENV === 'production' && getSdkMasterKey();

const deriveTransportKey = (sid, salt, appKid) => {
  const master = getSdkMasterKey();
  if (!master) throw new Error('SDK_MASTER_KEY not configured');
  const sidNorm = String(sid || '').trim().toLowerCase();
  const saltNorm = String(salt || '').trim().toLowerCase();
  const kidNorm = String(appKid || '').trim().toLowerCase();
  if (!/^[0-9a-f]{32}$/.test(sidNorm) || !/^[0-9a-f]{32}$/.test(saltNorm)) {
    throw new Error('Invalid session material');
  }
  return Buffer.from(crypto.hkdfSync(
    'sha256',
    master,
    Buffer.from(`${sidNorm}|${saltNorm}|${kidNorm}`, 'utf8'),
    Buffer.from(INFO_V3, 'utf8'),
    32
  ));
};

const deriveAesKeyV1 = (appSecret) =>
  crypto.createHash('sha256').update(INFO_V1 + String(appSecret || ''), 'utf8').digest();

const deriveAesKeyV2 = (appSecret) =>
  Buffer.from(crypto.hkdfSync(
    'sha256',
    Buffer.from(String(appSecret || ''), 'utf8'),
    deriveHkdfSalt(appSecret),
    Buffer.from(INFO_V2, 'utf8'),
    32
  ));

const deriveAesKey = (appSecret, version = 2) =>
  Number(version) === 2 ? deriveAesKeyV2(appSecret) : deriveAesKeyV1(appSecret);

const envelopeVersion = (obj) => {
  const n = Number(obj && obj.enc);
  if (n === 3) return 3;
  if (n === 2) return 2;
  if (n === 1) return 1;
  return 0;
};

const isEncryptedEnvelope = (obj) =>
  obj
  && typeof obj === 'object'
  && (Number(obj.enc) === 1 || Number(obj.enc) === 2 || Number(obj.enc) === 3)
  && typeof obj.iv === 'string'
  && typeof obj.tag === 'string'
  && typeof obj.data === 'string';

const decodeCipherField = (value, maxChars, label) => {
  const raw = String(value || '');
  if (!raw || raw.length > maxChars || !/^[A-Za-z0-9+/]*={0,2}$/.test(raw)) {
    throw new Error(`Invalid ${label}`);
  }
  return Buffer.from(raw, 'base64');
};

const encryptWithRawKey = (key32, plaintext) => {
  if (!Buffer.isBuffer(key32) || key32.length !== 32) {
    throw new Error('Invalid transport key');
  }
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key32, iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(String(plaintext), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    enc: 3,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ct.toString('base64'),
  };
};

const decryptWithRawKey = (key32, envelope) => {
  if (!isEncryptedEnvelope(envelope) || envelopeVersion(envelope) !== 3) {
    throw new Error('Invalid v3 envelope');
  }
  if (!Buffer.isBuffer(key32) || key32.length !== 32) {
    throw new Error('Invalid transport key');
  }
  const iv = decodeCipherField(envelope.iv, 24, 'iv');
  const tag = decodeCipherField(envelope.tag, 32, 'tag');
  const data = decodeCipherField(envelope.data, 2 * 1024 * 1024, 'ciphertext');
  if (iv.length !== 12 || tag.length !== 16 || data.length < 1) {
    throw new Error('Invalid ciphertext');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key32, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(data), decipher.final()]);
  return pt.toString('utf8');
};

const encryptPayload = (appSecret, plaintext, version = 2) => {
  const enc = Number(version) === 1 ? 1 : 2;
  const key = deriveAesKey(appSecret, enc);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const ct = Buffer.concat([
    cipher.update(Buffer.from(String(plaintext), 'utf8')),
    cipher.final(),
  ]);
  const tag = cipher.getAuthTag();
  return {
    enc,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: ct.toString('base64'),
  };
};

const decryptPayload = (appSecret, envelope) => {
  if (!isEncryptedEnvelope(envelope)) {
    throw new Error('Invalid encrypted envelope');
  }
  const v = envelopeVersion(envelope);
  if (v === 3) throw new Error('Use transport key for v3');
  const key = deriveAesKey(appSecret, v);
  const iv = decodeCipherField(envelope.iv, 24, 'iv');
  const tag = decodeCipherField(envelope.tag, 32, 'tag');
  const data = decodeCipherField(envelope.data, 2 * 1024 * 1024, 'ciphertext');
  if (iv.length !== 12 || tag.length !== 16 || data.length < 1) {
    throw new Error('Invalid ciphertext');
  }
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const pt = Buffer.concat([decipher.update(data), decipher.final()]);
  return pt.toString('utf8');
};

const encryptJson = (appSecret, obj, version = 2) =>
  encryptPayload(appSecret, JSON.stringify(obj), version);

const encryptJsonV3 = (transportKey32, obj) =>
  encryptWithRawKey(transportKey32, JSON.stringify(obj));

const decryptJson = (appSecret, envelope) => {
  const plain = decryptPayload(appSecret, envelope);
  return safeJsonParse(plain);
};

const decryptJsonV3 = (transportKey32, envelope) => {
  const plain = decryptWithRawKey(transportKey32, envelope);
  return safeJsonParse(plain);
};

const sealTransportForClient = (appSecret, transportKey32) => {
  const payload = { k: transportKey32.toString('base64') };
  return encryptJson(appSecret, payload, 2);
};

module.exports = {
  getSdkMasterKey,
  decodeSdkMasterKey,
  sdkMasterKeyRequired,
  deriveTransportKey,
  envelopeVersion,
  isEncryptedEnvelope,
  encryptJson,
  encryptJsonV3,
  decryptJson,
  decryptJsonV3,
  sealTransportForClient,
};
