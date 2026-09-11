const crypto = require('crypto');

const generateLicenseKey = (prefix = 'SVGA') => {
  const segments = [];
  for (let i = 0; i < 4; i++) {
    segments.push(crypto.randomBytes(3).toString('hex').toUpperCase());
  }
  return `${prefix}-${segments.join('-')}`;
};

const generateFromMask = (mask, { lowercase = true, uppercase = true } = {}) => {
  const pattern = String(mask || '').trim() || '####-####-####-####';
  const entropy = (pattern.match(/#/g) || []).length;

  let charset = '0123456789';
  if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (!lowercase && !uppercase) charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';


  if (entropy < 1) return pattern;

  return pattern.replace(/#/g, () => charset[crypto.randomInt(0, charset.length)]);
};

const uniqueSuffix = (charset) => {
  let s = '';
  for (let i = 0; i < 4; i++) s += charset[crypto.randomInt(0, charset.length)];
  return s;
};

const generateAppId = () => {
  return crypto.randomBytes(8).toString('hex').toUpperCase();
};

const generateAppSecret = () => {
  return crypto.randomBytes(32).toString('hex');
};

const generateSlug = (name) => {
  const base = name
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .substring(0, 24);
  const suffix = crypto.randomBytes(4).toString('hex');
  return `${base}-${suffix}`;
};

const generateVerificationToken = () => {
  return crypto.randomBytes(32).toString('hex');
};

const generateBulkKeys = (count, prefix, duration, extras = {}) => {
  const {
    mask,
    lowercase = true,
    uppercase = true,
    note = '',
    createdBy = '',
  } = extras;
  const keys = [];
  const seen = new Set();
  const maskStr = String(mask || '').trim();
  const maskEntropy = (maskStr.match(/#/g) || []).length;
  let charset = '0123456789';
  if (lowercase) charset += 'abcdefghijklmnopqrstuvwxyz';
  if (uppercase) charset += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  if (!lowercase && !uppercase) charset = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ';

  for (let i = 0; i < count; i++) {
    let key;
    let attempts = 0;
    do {
      if (maskStr) {
        key = generateFromMask(maskStr, { lowercase, uppercase });
        if (maskEntropy < 1 && count > 1) {
          key = `${key}-${uniqueSuffix(charset)}`;
        }
      } else {
        key = generateLicenseKey(prefix);
      }
      attempts++;
    } while (seen.has(key) && attempts < 3);

    if (seen.has(key) && maskStr) {
      // Fallback: append extra random suffix to guarantee uniqueness
      key = `${key}-${uniqueSuffix(charset)}`;
    }

    seen.add(key);
    keys.push({
      key,
      duration,
      status: 'unused',
      note,
      maxUses: 1,
      createdBy,
    });
  }
  return keys;
};

module.exports = {
  generateLicenseKey,
  generateFromMask,
  generateAppId,
  generateAppSecret,
  generateSlug,
  generateVerificationToken,
  generateBulkKeys
};

