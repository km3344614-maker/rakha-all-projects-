const LicenseKey = require('../models/LicenseKey');
const AppUser = require('../models/AppUser');
const { revealLicense, revealUser, licenseInUse } = require('./fieldCrypto');

const namesMatchForUsage = (username, keyPlain) => {
  if (!username || !keyPlain) return false;
  if (username === keyPlain) return true;
  return username.toLowerCase() === keyPlain.toLowerCase();
};

const isAllCapsKey = (value) => {
  const t = String(value || '');
  return t.length > 0 && t === t.toUpperCase() && /[A-Z]/.test(t);
};

const formatLicenseKeyDisplay = (value) => {
  const key = String(value || '').trim();
  if (!key || !isAllCapsKey(key)) return key;
  const parts = key.split('-');
  return parts.map((part, index) => {
    if (!part || !/^[A-Z0-9]+$/.test(part)) return part;
    if (index < 2 && /[A-Z]/.test(part) && part.length > 1) {
      return part.charAt(0) + part.slice(1).toLowerCase();
    }
    return part;
  }).join('-');
};

const userIsActive = (user) => {
  if (!user) return false;
  if (user.status === 'active') return true;
  if (Number(user.loginCount) > 0) return true;
  if (user.lastLogin) return true;
  return false;
};

const usageHintFromUser = (user) => ({
  userId: user._id,
  lastLogin: user.lastLogin || null,
  loginCount: Number(user.loginCount) || (user.lastLogin ? 1 : 0),
});

const buildKeyUsageIndex = async (appId, rows) => {
  const index = new Map();
  if (!rows?.length) return index;

  const keyIds = rows.map((row) => row._id);
  const users = await AppUser.find({
    app: appId,
    $or: [
      { licenseKey: { $in: keyIds } },
      { status: 'active' },
      { loginCount: { $gt: 0 } },
      { lastLogin: { $ne: null } },
    ],
  }).select('licenseKey username usernameSealed lastLogin loginCount status').lean();

  for (const user of users) {
    if (!user.licenseKey || !userIsActive(user)) continue;
    const keyId = String(user.licenseKey);
    if (!index.has(keyId)) index.set(keyId, usageHintFromUser(user));
  }

  for (const row of rows) {
    const keyId = String(row._id);
    if (index.has(keyId)) continue;
    const keyPlain = revealLicense(row);
    if (!keyPlain) continue;
    const match = users.find((user) => {
      if (!userIsActive(user)) return false;
      const name = revealUser(user);
      return namesMatchForUsage(name, keyPlain);
    });
    if (!match) continue;
    index.set(keyId, usageHintFromUser(match));
  }

  return index;
};

const repairKeysFromUsage = async (appId, rows, usageIndex) => {
  if (!rows?.length || !usageIndex?.size) return;
  const repairs = [];
  for (const row of rows) {
    const hint = usageIndex.get(String(row._id));
    if (!hint || licenseInUse(row)) continue;
    const now = hint.lastLogin || new Date();
    repairs.push(
      LicenseKey.updateOne(
        { _id: row._id, app: appId, status: { $nin: ['banned', 'paused'] } },
        {
          $set: {
            status: 'active',
            boundUser: hint.userId,
            lastUsed: now,
            ...(row.activatedAt ? {} : { activatedAt: now }),
          },
          $max: { currentUses: 1 },
        }
      ),
      AppUser.updateOne(
        {
          _id: hint.userId,
          app: appId,
          $or: [{ licenseKey: null }, { licenseKey: { $exists: false } }],
        },
        { $set: { licenseKey: row._id } }
      )
    );
  }
  if (repairs.length) await Promise.all(repairs.map((op) => op.catch(() => {})));
};

const syncLicensesForUsers = async (appId, users) => {
  if (!users?.length) return;
  const licenseIds = [];
  for (const user of users) {
    const lic = user.licenseKey;
    const id = lic?._id || lic;
    if (id) licenseIds.push(id);
  }
  if (!licenseIds.length) {
    const hints = [];
    for (const user of users) {
      if (!userIsActive(user)) continue;
      const name = revealUser(user);
      if (!name) continue;
      hints.push({ user, name });
    }
    if (!hints.length) return;
    const pool = await LicenseKey.find({ app: appId })
      .select('keySealed keyHash boundUser status currentUses activatedAt lastUsed')
      .limit(5000);
    const rows = [];
    const usageIndex = new Map();
    for (const row of pool) {
      const keyPlain = revealLicense(row);
      if (!keyPlain) continue;
      const hit = hints.find(({ name }) => namesMatchForUsage(name, keyPlain));
      if (!hit) continue;
      rows.push(row);
      usageIndex.set(String(row._id), usageHintFromUser(hit.user));
    }
    await repairKeysFromUsage(appId, rows, usageIndex);
    return;
  }

  const rows = await LicenseKey.find({ app: appId, _id: { $in: licenseIds } })
    .select('keySealed keyHash boundUser status currentUses activatedAt lastUsed');
  const usageIndex = await buildKeyUsageIndex(appId, rows);
  for (const user of users) {
    const licId = user.licenseKey?._id || user.licenseKey;
    if (!licId || !userIsActive(user)) continue;
    usageIndex.set(String(licId), usageHintFromUser(user));
  }
  await repairKeysFromUsage(appId, rows, usageIndex);
};

const reloadLicenseRows = async (appId, rowIds) => {
  if (!rowIds?.length) return new Map();
  const fresh = await LicenseKey.find({ app: appId, _id: { $in: rowIds } })
    .populate('boundUser', 'username usernameSealed');
  return new Map(fresh.map((row) => [String(row._id), row]));
};

module.exports = {
  namesMatchForUsage,
  isAllCapsKey,
  formatLicenseKeyDisplay,
  userIsActive,
  buildKeyUsageIndex,
  repairKeysFromUsage,
  syncLicensesForUsers,
  reloadLicenseRows,
};
