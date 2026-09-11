const crypto = require('crypto');
const mongoose = require('mongoose');
const { withMongoTransaction } = require('./mongoTransaction');

const hwidTag = (hwid) => {
  const s = String(hwid || '').trim();
  if (!s) return '';
  return crypto.createHash('sha256').update(s, 'utf8').digest('hex').slice(0, 12);
};

const normalizeHwid = (hwid) => String(hwid || '').trim().toLowerCase();

const isValidHwid = (hwid) => {
  const s = normalizeHwid(hwid);
  return /^[a-f0-9]{64}$/.test(s);
};

const toObjectId = (value) => {
  const s = String(value || '');
  if (!mongoose.Types.ObjectId.isValid(s) || s.length !== 24) return null;
  return new mongoose.Types.ObjectId(s);
};

const asObjectId = (value) => {
  if (!value) return null;
  if (value instanceof mongoose.Types.ObjectId) return value;
  return toObjectId(value);
};

const deviceClearOp = () => ({
  $set: {
    hwid: null,
    hwidUnlock: true,
    lastSeen: new Date(0),
    sessionKilled: true,
  },
  $unset: {
    pendingHwid: '',
    sessionTokenHash: '',
    sessionTokenHashes: '',
  },
  $inc: { sessionVersion: 1 },
});

// Native collection writes bypass Mongoose select:false / casting so leftover
// bound + pending HWID cannot survive a dashboard or bot reset.
const resetDeviceBinding = async ({ appId, userId, licenseKeyId }) => {
  const AppUser = require('../models/AppUser');
  const LicenseKey = require('../models/LicenseKey');
  const app = toObjectId(appId);
  if (!app) return { ok: false, reason: 'not_found' };

  let found = false;
  await withMongoTransaction(async (session) => {
    const keyIds = [];
    const userOr = [];
    if (userId) {
      const uid = toObjectId(userId);
      if (!uid) return;
      const user = await AppUser.findOne({ _id: uid, app })
        .select('_id licenseKey').session(session).lean();
      if (!user) return;
      found = true;
      userOr.push({ _id: user._id });
      const kid = asObjectId(user.licenseKey);
      if (kid) {
        keyIds.push(kid);
        userOr.push({ licenseKey: kid });
      }
    } else if (licenseKeyId) {
      const kid = toObjectId(licenseKeyId);
      if (!kid) return;
      const key = await LicenseKey.findOne({ _id: kid, app })
        .select('_id boundUser').session(session).lean();
      if (!key) return;
      found = true;
      keyIds.push(key._id);
      userOr.push({ licenseKey: key._id });
      const bound = asObjectId(key.boundUser);
      if (bound) userOr.push({ _id: bound });
    }
    if (!found || !userOr.length) return;
    const userFilter = { app, $or: userOr };
    await AppUser.collection.updateMany(userFilter, deviceClearOp(), { session });
    if (keyIds.length) {
      await LicenseKey.collection.updateMany(
        { app, _id: { $in: keyIds } },
        { $set: { hwid: null } },
        { session }
      );
    }
  });
  return found ? { ok: true } : { ok: false, reason: 'not_found' };
};

module.exports = { hwidTag, normalizeHwid, isValidHwid, resetDeviceBinding };
