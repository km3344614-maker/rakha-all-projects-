const express = require('express');
const router = express.Router({ mergeParams: true });
const AppUser = require('../models/AppUser');
const LicenseKey = require('../models/LicenseKey');
const { dashboardProtect } = require('../middleware/auth');
const { withMongoTransaction } = require('../utils/mongoTransaction');
const { verifyAppOwner } = require('../middleware/verifyAppOwner');
const { generateLicenseKey } = require('../utils/keyGenerator');
const { isStrongPassword, PASSWORD_HINT, pickObjectIds } = require('../utils/security');
const { normalizeHwid, resetDeviceBinding } = require('../utils/hwidFingerprint');
const { killAppUserSessions } = require('../utils/sdkGuards');
const { userLookupFilter, keyHashClause, revealLicense, revealUser, looksLikeHash } = require('../utils/fieldCrypto');
const { syncLicensesForUsers, formatLicenseKeyDisplay, isAllCapsKey } = require('../utils/licenseUsageSync');

const ALLOWED_STATUS = new Set(['active', 'banned', 'expired']);

const clampPage = (page) => Math.max(1, parseInt(page, 10) || 1);
const clampLimit = (limit, fallback = 20) =>
  Math.min(100, Math.max(1, parseInt(limit, 10) || fallback));

const licensePayload = (doc) => {
  if (!doc || typeof doc !== 'object') return null;
  const key = formatLicenseKeyDisplay(revealLicense(doc));
  if (!key) return null;
  return {
    _id: doc._id,
    key,
    expireDate: doc.expireDate || null,
  };
};

const licenseIdOf = (user) => {
  const lic = user?.licenseKey;
  if (!lic) return null;
  return lic._id || lic;
};

const attachLicenseKeys = async (appId, users) => {
  const attached = new Map();
  for (const u of users) {
    const payload = licensePayload(u.licenseKey);
    if (payload) attached.set(String(u._id), payload);
  }

  const needsLookup = users.filter((u) => {
    const payload = attached.get(String(u._id));
    return !payload || isAllCapsKey(payload.key);
  });
  if (!needsLookup.length) return attached;

  const extra = await LicenseKey.find({
    app: appId,
    $or: [
      { boundUser: { $in: needsLookup.map((u) => u._id) } },
      { _id: { $in: needsLookup.map(licenseIdOf).filter(Boolean) } },
    ],
  }).select('keySealed keyHash boundUser expireDate');

  for (const k of extra) {
    const payload = licensePayload(k);
    if (!payload || isAllCapsKey(payload.key)) continue;
    if (k.boundUser) {
      const uid = String(k.boundUser);
      const current = attached.get(uid);
      if (!current || isAllCapsKey(current.key)) attached.set(uid, payload);
    }
  }

  const still = users.filter((u) => {
    const payload = attached.get(String(u._id));
    return !payload || isAllCapsKey(payload.key);
  });
  if (!still.length) return attached;

  const pool = await LicenseKey.find({ app: appId })
    .select('keySealed keyHash boundUser expireDate')
    .limit(5000);
  const mixedByUpper = new Map();
  for (const k of pool) {
    const payload = licensePayload(k);
    if (!payload || isAllCapsKey(payload.key)) continue;
    mixedByUpper.set(payload.key.toUpperCase(), { payload, id: k._id });
  }

  for (const u of still) {
    const guess = String(attached.get(String(u._id))?.key || revealUser(u) || '').trim();
    if (!guess) continue;
    const hit = mixedByUpper.get(guess.toUpperCase());
    if (!hit) continue;
    attached.set(String(u._id), hit.payload);
    if (!u.licenseKey) {
      AppUser.updateOne({ _id: u._id }, { $set: { licenseKey: hit.id } }).catch(() => {});
    }
  }
  return attached;
};

const toSubscriptionExpire = (duration, expiryType) => {
  if (expiryType === 'lifetime') return null;
  const n = Math.max(0, parseInt(duration, 10) || 0);
  if (n <= 0) return null;
  const ms =
    expiryType === 'minutes' ? n * 60e3
      : expiryType === 'hours' ? n * 3600e3
        : expiryType === 'weeks' ? n * 7 * 864e5
          : expiryType === 'months' ? n * 30 * 864e5
            : n * 864e5;
  return new Date(Date.now() + ms);
};

router.post('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const username = String(req.body.username || '').trim();
    const accountType = req.body.accountType === 'license' ? 'license' : 'standard';
    let password = String(req.body.password || '');
    const expiry = (req.body.expiry && typeof req.body.expiry === 'object')
      ? req.body.expiry
      : null;

    if (!username || username.length < 2 || username.length > 64) {
      return res.status(400).json({ success: false, message: 'Invalid username' });
    }


    let licenseDoc = null;
    let licenseKeyPlain = null;
    let durationDays = 2;

    if (accountType === 'license') {
      licenseKeyPlain = generateLicenseKey();
      password = licenseKeyPlain;
    } else if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: PASSWORD_HINT });
    }

    let subscriptionExpire = null;
    if (expiry) {
      const expiryType = String(expiry.expiryType || 'days');
      if (expiryType === 'lifetime') {
        subscriptionExpire = null;
        durationDays = 0;
      } else {
        subscriptionExpire = toSubscriptionExpire(expiry.duration, expiryType);
        const n = Math.max(0, parseInt(expiry.duration, 10) || 0);
        durationDays =
          expiryType === 'minutes' ? Math.max(1 / (24 * 60), n / (24 * 60))
            : expiryType === 'hours' ? Math.max(1 / 24, n / 24)
              : expiryType === 'weeks' ? n * 7
                : expiryType === 'months' ? n * 30
                  : n || 30;
      }
    }

    const exists = await AppUser.findOne(userLookupFilter(req.params.appId, username));
    if (exists) {
      return res.status(400).json({ success: false, message: 'Username already exists' });
    }

    let user;
    await withMongoTransaction(async (session) => {
      if (accountType === 'license') {
        [licenseDoc] = await LicenseKey.create([{
          app: req.params.appId,
          key: licenseKeyPlain,
          status: 'active',
          duration: durationDays,
          expireDate: subscriptionExpire,
          currentUses: 1,
          createdBy: req.user?.username || 'panel',
        }], { session });
      }

      [user] = await AppUser.create([{
        app: req.params.appId,
        username,
        password,
        status: 'active',
        subscriptionExpire,
        licenseKey: licenseDoc ? licenseDoc._id : undefined,
        discordId: AppUser.uniqueUnsetDiscordId(),
      }], { session });

      if (licenseDoc) {
        licenseDoc.boundUser = user._id;
        await licenseDoc.save({ session, validateBeforeSave: false });
      }
    });

    const safe = user.toObject();
    delete safe.password;
    delete safe.sessionTokenHash;
    delete safe.sessionTokenHashes;
    if (licenseDoc) {
      safe.licenseKey = {
        _id: licenseDoc._id,
        key: licenseKeyPlain,
        status: licenseDoc.status,
      };
    }
    res.status(201).json({
      success: true,
      user: safe,
      ...(licenseKeyPlain ? { licenseKey: licenseKeyPlain } : {}),
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(400).json({ success: false, message: 'Username or license key already exists' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const page = clampPage(req.query.page);
    const limit = clampLimit(req.query.limit, 20);
    const { status, search } = req.query;
    const filter = { app: req.params.appId };

    if (typeof status === 'string' && ALLOWED_STATUS.has(status)) filter.status = status;
    if (typeof search === 'string' && search) {
      const q = String(search).slice(0, 64);
      const escaped = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const hashClause = keyHashClause(q);
      const keyIds = hashClause
        ? await LicenseKey.find({
          app: req.params.appId,
          keyHash: hashClause,
        }).distinct('_id')
        : [];
      filter.$or = [
        ...userLookupFilter(req.params.appId, q).$or,
        { pcName: { $regex: escaped, $options: 'i' } },
        { hwid: { $regex: escaped, $options: 'i' } },
        { lastIp: { $regex: escaped, $options: 'i' } },
        ...(keyIds.length ? [{ licenseKey: { $in: keyIds } }] : []),
      ];
    }

    const appFilter = { app: req.params.appId };
    const [total, users, totalUsers, active, banned, expired] = await Promise.all([
      AppUser.countDocuments(filter),
      AppUser.find(filter)
        .select('-password +pendingHwid')
        .populate('licenseKey', 'keySealed keyHash expireDate')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit),
      AppUser.countDocuments(appFilter),
      AppUser.countDocuments({ ...appFilter, status: 'active' }),
      AppUser.countDocuments({ ...appFilter, status: 'banned' }),
      AppUser.countDocuments({ ...appFilter, status: 'expired' }),
    ]);

    await syncLicensesForUsers(req.params.appId, users);
    await AppUser.populate(users, { path: 'licenseKey', select: 'keySealed keyHash expireDate' });
    const licenses = await attachLicenseKeys(req.params.appId, users);

    const safeUsers = users.map((u) => {
      const o = u.toObject ? u.toObject() : { ...u };
      o.hwid = o.hwidUnlock ? null : (o.hwid || o.pendingHwid || null);
      if (o.status !== 'banned' && o.subscriptionExpire && new Date(o.subscriptionExpire).getTime() <= Date.now()) {
        o.status = 'expired';
      }
      const payload = licenses.get(String(u._id));
      if (payload) {
        o.licenseKey = payload;
      } else {
        const revealed = revealUser(o);
        if (revealed && !looksLikeHash(revealed)) {
          o.licenseKey = { key: formatLicenseKeyDisplay(revealed) };
        }
      }
      delete o.pendingHwid;
      delete o.hwidUnlock;
      return o;
    });

    res.json({
      success: true,
      users: safeUsers,
      total,
      page,
      pages: Math.ceil(total / limit),
      stats: { totalUsers, active, banned, expired },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/delete-selected', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (Array.isArray(req.body?.ids) && req.body.ids.length > 500) {
      return res.status(400).json({ success: false, message: 'Max 500 users per delete' });
    }
    const ids = pickObjectIds(req.body?.ids);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No users selected' });
    }
    const doomed = await AppUser.find({ app: req.params.appId, _id: { $in: ids } }).select('_id licenseKey');
    const licIds = doomed.map((u) => u.licenseKey).filter(Boolean);
    const result = await AppUser.deleteMany({
      app: req.params.appId,
      _id: { $in: ids },
    });
    if (licIds.length) {
      await LicenseKey.updateMany(
        { _id: { $in: licIds }, app: req.params.appId },
        { $set: { boundUser: null } }
      );
    }
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/end-sessions', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const ids = pickObjectIds(req.body?.ids || (req.body?.id ? [req.body.id] : []), 200);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No sessions selected' });
    }
    const result = await killAppUserSessions(AppUser, {
      appId: req.ownerApp._id,
      userIds: ids,
    });
    if (!result.matched) {
      return res.status(404).json({ success: false, message: 'No sessions ended' });
    }
    res.json({ success: true, deleted: result.matched });
  } catch (error) {
    console.error('[users/end-sessions]', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:userId', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (req.body?.endSession === true) {
      const extra = pickObjectIds(req.body?.ids, 200);
      const userIds = extra.length ? extra : [req.params.userId];
      const result = await killAppUserSessions(AppUser, {
        appId: req.params.appId,
        userIds,
      });
      if (!result.matched) {
        return res.status(404).json({ success: false, message: 'Session not found' });
      }
      return res.json({ success: true, message: 'Session ended', deleted: result.matched });
    }

    const { status, hwid, subscriptionExpire } = req.body;
    const user = await AppUser.findOne({ _id: req.params.userId, app: req.params.appId });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    if (status !== undefined) {
      if (!ALLOWED_STATUS.has(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      user.status = status;
    }
    if (hwid !== undefined) {
      user.hwid = hwid === null || hwid === '' ? null : normalizeHwid(hwid).slice(0, 256);
      user.pendingHwid = null;
      user.hwidUnlock = !user.hwid;
    }
    if (subscriptionExpire !== undefined) {
      user.subscriptionExpire = subscriptionExpire ? new Date(subscriptionExpire) : null;
    }


    // When banning or expiring a user, revoke all active sessions so
    // their next heartbeat returns alive:false immediately.
    if (user.status === 'banned' || user.status === 'expired') {
      user.sessionTokenHash = null;
      user.sessionTokenHashes = [];
      user.sessionKilled = true;
      user.sessionVersion = (user.sessionVersion || 0) + 1;
    }

    await user.save();
    const safe = user.toObject();
    delete safe.password;
    delete safe.sessionTokenHash;
    delete safe.sessionTokenHashes;
    res.json({ success: true, user: safe });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:userId', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    let deleted;
    await withMongoTransaction(async (session) => {
      deleted = await AppUser.findOneAndDelete(
        { _id: req.params.userId, app: req.params.appId },
        { session }
      );
      if (deleted?.licenseKey) {
        await LicenseKey.updateOne(
          { _id: deleted.licenseKey, app: req.params.appId },
          { $set: { boundUser: null } },
          { session }
        );
      }
    });
    if (!deleted) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:userId/reset-hwid', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const result = await resetDeviceBinding({
      appId: req.params.appId,
      userId: req.params.userId,
    });
    if (!result.ok) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, hwid: null, message: 'HWID reset — close the old program, then login on the new device' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;

