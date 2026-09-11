const crypto = require('crypto');
const fsp = require('fs/promises');
const path = require('path');

const STORAGE_ROOT = process.env.FILE_STORAGE_DIR
  ? path.resolve(process.env.FILE_STORAGE_DIR)
  : path.join(__dirname, '..', 'storage', 'appfiles');

const WRAP_INFO = 'rakha-file-wrap-v1|';

// Prefer FILE_ENCRYPTION_KEY for new writes. When opening, also try JWT_SECRET
// so links sealed before FILE_ENCRYPTION_KEY was added still decrypt.
const masterSecrets = () => {
  const keys = [];
  const a = String(process.env.FILE_ENCRYPTION_KEY || '').trim();
  const b = String(process.env.JWT_SECRET || '').trim();
  if (a) keys.push(a);
  if (b && b !== a) keys.push(b);
  return keys;
};

const keyBuf = (secret) =>
  crypto.createHash('sha256').update(WRAP_INFO + String(secret || ''), 'utf8').digest();

const masterKey = () => {
  const secrets = masterSecrets();
  if (!secrets.length) throw new Error('FILE_ENCRYPTION_KEY or JWT_SECRET is required to seal files');
  return keyBuf(secrets[0]);
};

const withMasterKeys = (fn) => {
  const secrets = masterSecrets();
  if (!secrets.length) throw new Error('FILE_ENCRYPTION_KEY or JWT_SECRET is required to seal files');
  let lastErr;
  for (const secret of secrets) {
    try {
      return fn(keyBuf(secret));
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('Unable to open sealed value');
};

// Compact single-string envelope for small secrets such as an external download
// URL or an archive password, so they never sit in the database as plaintext.
const sealString = (plaintext) => {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', masterKey(), iv);
  const ct = Buffer.concat([cipher.update(String(plaintext), 'utf8'), cipher.final()]);
  return [
    'v1',
    iv.toString('base64url'),
    cipher.getAuthTag().toString('base64url'),
    ct.toString('base64url'),
  ].join('.');
};

const openStringWithKey = (sealed, key) => {
  const parts = String(sealed || '').split('.');
  if (parts.length !== 4 || parts[0] !== 'v1') throw new Error('Malformed sealed value');
  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(parts[1], 'base64url')
  );
  decipher.setAuthTag(Buffer.from(parts[2], 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(parts[3], 'base64url')),
    decipher.final(),
  ]).toString('utf8');
};

const openString = (sealed) => {
  const raw = String(sealed || '');
  if (!raw) return '';
  if (!raw.startsWith('v1.')) {
    if (process.env.ALLOW_LEGACY_PLAINTEXT_VAULT === 'true') return raw;
    throw new Error('Unsealed value rejected');
  }
  return withMasterKeys((key) => openStringWithKey(raw, key));
};

const openBufferWithKey = (ciphertext, meta, key) => {
  const unwrap = crypto.createDecipheriv(
    'aes-256-gcm',
    key,
    Buffer.from(meta.wrapIv, 'base64')
  );
  unwrap.setAuthTag(Buffer.from(meta.wrapTag, 'base64'));
  const dataKey = Buffer.concat([
    unwrap.update(Buffer.from(meta.wrappedKey, 'base64')),
    unwrap.final(),
  ]);

  const decipher = crypto.createDecipheriv(
    'aes-256-gcm',
    dataKey,
    Buffer.from(meta.iv, 'base64')
  );
  decipher.setAuthTag(Buffer.from(meta.tag, 'base64'));
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  dataKey.fill(0);
  return plain;
};

const openBuffer = (ciphertext, meta) =>
  withMasterKeys((key) => openBufferWithKey(ciphertext, meta, key));

const appDir = (appId) => path.join(STORAGE_ROOT, String(appId));

const resolveStoragePath = (storageKey) => {
  const full = path.resolve(STORAGE_ROOT, storageKey);
  if (full !== STORAGE_ROOT && !full.startsWith(STORAGE_ROOT + path.sep)) {
    throw new Error('Invalid storage key');
  }
  return full;
};

const readSealed = async (record) => {
  const full = resolveStoragePath(record.storageKey);
  const ciphertext = await fsp.readFile(full);
  return openBuffer(ciphertext, record);
};

const removeSealed = async (storageKey) => {
  if (!storageKey) return;
  try {
    await fsp.unlink(resolveStoragePath(storageKey));
  } catch (e) {
    if (e?.code !== 'ENOENT') throw e;
  }
};

const removeAppFiles = async (appId) => {
  try {
    await fsp.rm(appDir(appId), { recursive: true, force: true });
  } catch {

  }
};

module.exports = {
  sealString,
  openString,
  readSealed,
  removeSealed,
  removeAppFiles,
};
