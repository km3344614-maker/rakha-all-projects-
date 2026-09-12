const express = require('express');
const mongoose = require('mongoose');
const router = express.Router();
const Application = require('../models/Application');
const LicenseKey = require('../models/LicenseKey');
const AppUser = require('../models/AppUser');
const { dashboardProtect } = require('../middleware/auth');
const Variable = require('../models/Variable');
const Log = require('../models/Log');
const AppFile = require('../models/AppFile');
const { removeAppFiles } = require('../utils/fileVault');
const { generateAppId, generateAppSecret, generateSlug } = require('../utils/keyGenerator');
const { countActiveSessions, activeSessionFilter, sessionRemainingSeconds, killAppUserSessions, killAllAppSessions } = require('../utils/sdkGuards');
const { pickObjectIds, isObjectId } = require('../utils/security');
const { revealLicense, revealUser } = require('../utils/fieldCrypto');
const { toPublicApp, peekAppSecret } = require('../utils/appPublic');
const { isVersionString, normalizeVersion } = require('../utils/appVersion');
const rateLimit = require('express-rate-limit');
const revealSecretLimiter = rateLimit({
  windowMs: 5 * 60 * 1000,
  max: 5,
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, message: 'Too many requests' },
});


const appOwnerQuery = (user) => (user?.role === 'admin' ? { status: { $ne: 'deleted' } } : { owner: user._id, status: { $ne: 'deleted' } });
const appByIdQuery = (id, user) => (user?.role === 'admin' ? { _id: id, status: { $ne: 'deleted' } } : { _id: id, owner: user._id, status: { $ne: 'deleted' } });

const toOwnerApp = async (app, extras = {}) => {
  const obj = app.toObject ? app.toObject() : { ...app };
  const [keyCount, userCount] = await Promise.all([
    LicenseKey.countDocuments({ app: obj._id }),
    AppUser.countDocuments({ app: obj._id }),
  ]);
  return { ...toPublicApp(obj), keyCount, userCount, ...extras };
};

const getStandaloneApp = () => ({
  _id: 'app_rakha_v3',
  name: 'RAKHA TWEAKS V3',
  appId: 'rakha_tweaks_v3',
  slug: 'rakha-tweaks-v3',
  status: 'active',
  keyPrefix: 'RAKHA',
  version: '3.0.0',
  minVersion: '1.0.0',
  hwidLock: true,
  oneSessionPerCredential: true,
  sessionExpirySeconds: 900,
  createdAt: '2026-01-01T00:00:00.000Z',
  keyCount: 1,
  userCount: 1,
  activeSessions: 1,
});

router.get('/', dashboardProtect, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json({ success: true, apps: [getStandaloneApp()] });
  }

  try {
    const apps = await Application.find(appOwnerQuery(req.user)).sort('-createdAt').lean();
    const appIds = apps.map(a => a._id);

    const [keyCounts, userCounts] = await Promise.all([
      LicenseKey.aggregate([
        { $match: { app: { $in: appIds } } },
        { $group: { _id: '$app', count: { $sum: 1 } } }
      ]),
      AppUser.aggregate([
        { $match: { app: { $in: appIds } } },
        { $group: { _id: '$app', count: { $sum: 1 } } }
      ])
    ]);

    const keyMap = Object.fromEntries(keyCounts.map(k => [k._id.toString(), k.count]));
    const userMap = Object.fromEntries(userCounts.map(u => [u._id.toString(), u.count]));

    const sessionCounts = await Promise.all(
      apps.map(async (app) => [app._id.toString(), await countActiveSessions(AppUser, app)])
    );
    const sessionMap = Object.fromEntries(sessionCounts);

    const enriched = apps.map(app => ({
      ...toPublicApp(app),
      keyCount: keyMap[app._id.toString()] || 0,
      userCount: userMap[app._id.toString()] || 0,
      activeSessions: sessionMap[app._id.toString()] || 0,
    }));

    res.json({ success: true, apps: enriched });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', dashboardProtect, async (req, res) => {
  try {
    const name = typeof req.body?.name === 'string' ? req.body.name.trim().slice(0, 50) : '';
    const description = typeof req.body?.description === 'string' ? req.body.description.slice(0, 200) : '';
    const version = typeof req.body?.version === 'string' ? req.body.version.trim().slice(0, 32) : '1.0.0';
    const hwidLock = req.body?.hwidLock === false ? false : true;
    const keyPrefix = typeof req.body?.keyPrefix === 'string' ? req.body.keyPrefix : '';
    if (!name) return res.status(400).json({ success: false, message: 'App name is required' });

    const count = await Application.countDocuments({
      owner: req.user._id,
      status: { $ne: 'deleted' },
    });
    if (count >= 10) {
      return res.status(400).json({ success: false, message: 'Maximum 10 applications allowed' });
    }

    const cleanPrefix = keyPrefix
      ? String(keyPrefix).replace(/[^A-Za-z0-9]/g, '').substring(0, 8)
      : 'SVGA';

    const appSecretPlain = generateAppSecret();
    const app = await Application.create({
      owner: req.user._id,
      name,
      slug: generateSlug(name),
      description,
      version: version || '1.0.0',
      minVersion: version || '1.0.0',
      hwidLock,
      oneSessionPerCredential: true,
      sessionExpirySeconds: 900,
      keyPrefix: cleanPrefix,
      appId: generateAppId(),
      appSecret: appSecretPlain,
    });

    res.status(201).json({
      success: true,
      app: await toOwnerApp(app),
      appSecretOnce: appSecretPlain,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id', dashboardProtect, async (req, res) => {
  if (mongoose.connection.readyState !== 1) {
    return res.json({ success: true, app: getStandaloneApp() });
  }

  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user));
    if (!app || app.status === 'deleted') return res.status(404).json({ success: false, message: 'Application not found' });

    const keyCount = await LicenseKey.countDocuments({ app: app._id });
    const userCount = await AppUser.countDocuments({ app: app._id });

    res.json({
      success: true,
      app: await toOwnerApp(app, { keyCount, userCount }),
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:id', dashboardProtect, async (req, res) => {
  try {
    const {
      name, description, version, status, hwidLock,
      keyPrefix, maintenanceMode,
      maintenanceMessage, minVersion,
      vpnBlock, sessionExpirySeconds, oneSessionPerCredential
    } = req.body;
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user));
    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });

    if (typeof name === 'string' && name.trim()) app.name = name.trim().slice(0, 50);
    if (description !== undefined) app.description = typeof description === 'string' ? description.slice(0, 200) : '';
    if (typeof minVersion === 'string') {
      const mv = normalizeVersion(minVersion);
      if (!mv || !isVersionString(mv)) {
        return res.status(400).json({ success: false, message: 'Minimum version is required' });
      }
      const prev = normalizeVersion(app.minVersion || app.version || '');
      app.minVersion = mv;
      app.version = mv;
      if (prev !== mv) {
        await killAllAppSessions(AppUser, app._id);
        await Log.create({
          app: app._id,
          action: 'version_bump',
          success: true,
          message: `${prev || '(none)'} -> ${mv} (sessions killed)`,
        }).catch(() => {});
      }
    }
    if (status !== undefined) {
      if (!['active', 'paused', 'disabled'].includes(status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      if (app.status === 'active' && status !== 'active') {
        await killAllAppSessions(AppUser, app._id);
      }
      app.status = status;
    }
    if (hwidLock === true || hwidLock === false) app.hwidLock = hwidLock;
    if (typeof keyPrefix === 'string' && keyPrefix) {
      app.keyPrefix = String(keyPrefix).replace(/[^A-Za-z0-9]/g, '').substring(0, 8);
    }
    if (maintenanceMode === true || maintenanceMode === false) app.maintenanceMode = maintenanceMode;
    if (maintenanceMessage !== undefined) {
      app.maintenanceMessage = typeof maintenanceMessage === 'string'
        ? maintenanceMessage.slice(0, 200)
        : 'Under maintenance';
    }
    if (vpnBlock === true || vpnBlock === false) app.vpnBlock = vpnBlock;
    if (sessionExpirySeconds !== undefined) {
      const n = Number(sessionExpirySeconds);
      if (Number.isFinite(n)) app.sessionExpirySeconds = Math.min(86400, Math.max(30, Math.round(n)));
    }
    if (oneSessionPerCredential === true || oneSessionPerCredential === false) {
      app.oneSessionPerCredential = oneSessionPerCredential;
    }

    await app.save();
    const fresh = await Application.findById(app._id);
    res.json({ success: true, app: await toOwnerApp(fresh) });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/reveal-secret', revealSecretLimiter, dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user)).select('+appSecret');
    if (!app || app.status === 'deleted') {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    const secret = peekAppSecret(app);
    if (!secret) {
      return res.status(500).json({ success: false, message: 'Secret unavailable' });
    }
    res.json({ success: true, appSecretOnce: secret });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/regenerate-secret', dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user)).select('+appSecret');
    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });

    const appSecretPlain = generateAppSecret();
    app.appSecret = appSecretPlain;
    await app.save();
    await killAllAppSessions(AppUser, app._id);
    res.json({
      success: true,
      app: await toOwnerApp(app),
      appSecretOnce: appSecretPlain,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:id', dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user)).select('+appSecret');
    if (!app) return res.status(404).json({ success: false, message: 'Application not found' });
    if (app.status === 'deleted') {
      return res.json({ success: true, message: 'Application deleted' });
    }

    await killAllAppSessions(AppUser, app._id);
    await removeAppFiles(app._id);
    await Promise.all([
      LicenseKey.deleteMany({ app: app._id }),
      AppUser.deleteMany({ app: app._id }),
      Variable.deleteMany({ app: app._id }),
      Log.deleteMany({ app: app._id }),
      AppFile.deleteMany({ app: app._id })
    ]);

    app.status = 'deleted';
    app.maintenanceMode = false;
    app.slug = `d-${app.appId}`.toLowerCase();
    await app.save();

    res.json({ success: true, message: 'Application deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id/sessions', dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user));
    if (!app) return res.status(404).json({ success: false, message: 'Not found' });

    const users = await AppUser.find(activeSessionFilter(app))
      .select('username usernameSealed pcName status lastSeen lastIp hwid hwidUnlock sessionKilled +pendingHwid lastLogin createdAt licenseKey')
      .sort('-lastSeen')
      .limit(200)
      .lean();

    const keyIds = users
      .map((u) => u.licenseKey)
      .filter((id) => id && String(id).match(/^[a-fA-F0-9]{24}$/));
    const keys = keyIds.length
      ? await LicenseKey.find({ _id: { $in: keyIds } }).select('keySealed keyHash').lean()
      : [];
    const keyMap = Object.fromEntries(keys.map((k) => [String(k._id), revealLicense(k)]));

    const sessions = users
      .filter((u) => u.sessionKilled !== true)
      .map((u) => ({
      _id: String(u._id),
      username: revealUser(u),
      pcName: u.pcName || '',
      status: u.status,
      lastSeen: u.lastSeen,
      lastLogin: u.lastLogin,
      lastIp: u.lastIp || '',
      hwid: u.hwidUnlock ? '' : (u.hwid || u.pendingHwid || ''),
      key: keyMap[String(u.licenseKey || '')] || revealUser(u) || '',
      sessionId: String(u._id),
      expiresIn: sessionRemainingSeconds(app, u),
    }));

    res.json({ success: true, sessions, total: sessions.length });
  } catch (error) {
    console.error('[apps/sessions]', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/sessions/end', dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user));
    if (!app) return res.status(404).json({ success: false, message: 'Not found' });

    const ids = pickObjectIds(
      req.body?.ids || (req.body?.id ? [req.body.id] : []),
      200
    );
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No sessions selected' });
    }

    const result = await killAppUserSessions(AppUser, { appId: app._id, userIds: ids });
    if (!result.matched) {
      return res.status(404).json({ success: false, message: 'No sessions ended' });
    }

    res.json({ success: true, deleted: result.matched });
  } catch (error) {
    console.error('[apps/sessions/end]', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// ⚠️  kill-selected MUST be declared before /:userId/kill — Express matches
// literal path segments before named params, but only when the static segment
// appears first in registration order.  Swapping them causes Express to swallow
// the string "kill-selected" as a :userId value and route to the wrong handler.
router.post('/:id/sessions/kill-selected', dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user));
    if (!app) return res.status(404).json({ success: false, message: 'Not found' });

    const ids = pickObjectIds(req.body?.ids, 200);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No sessions selected' });
    }

    const result = await killAppUserSessions(AppUser, { appId: app._id, userIds: ids });
    if (!result.matched) {
      return res.status(404).json({ success: false, message: 'No sessions ended' });
    }

    res.json({ success: true, deleted: result.matched });
  } catch (error) {
    console.error('[apps/sessions/kill-selected]', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:id/sessions/:userId/kill', dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user));
    if (!app) return res.status(404).json({ success: false, message: 'Not found' });

    const userId = String(req.params.userId || '').trim();
    if (!isObjectId(userId)) {
      return res.status(400).json({ success: false, message: 'Invalid session id' });
    }

    const result = await killAppUserSessions(AppUser, { appId: app._id, userIds: [userId] });
    if (!result.matched) {
      return res.status(404).json({ success: false, message: 'Session not found' });
    }

    res.json({ success: true, message: 'Session ended' });
  } catch (error) {
    console.error('[apps/sessions/kill]', error.message);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:id/sdk/cpp', dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user)).select('+appSecret');
    if (!app) return res.status(404).json({ success: false, message: 'Not found' });

    const { buildSdkZip } = require('../utils/sdkBind');
    const { resolvePublicAppUrl } = require('../utils/publicUrl');
    const baseUrl = resolvePublicAppUrl(process.env.APP_URL || `${req.protocol}://${req.get('host')}`);
    const { buffer, filename } = await buildSdkZip(app, { baseUrl });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Rakha-Sdk-Mode', 'header-only');
    res.send(buffer);
  } catch (error) {
    console.error('SDK zip error:', error);
    res.status(500).json({ success: false, message: 'Failed to build SDK' });
  }
});

router.get('/:id/sdk/python', dashboardProtect, async (req, res) => {
  try {
    const app = await Application.findOne(appByIdQuery(req.params.id, req.user)).select('+appSecret');
    if (!app) return res.status(404).json({ success: false, message: 'Not found' });

    const { buildPythonWheel } = require('../utils/pythonSdk');
    const { resolvePublicAppUrl } = require('../utils/publicUrl');
    const baseUrl = resolvePublicAppUrl(process.env.APP_URL || `${req.protocol}://${req.get('host')}`);
    const { buffer, filename } = await buildPythonWheel(app, { baseUrl });

    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Rakha-Sdk-Pure', '1');
    res.send(buffer);
  } catch (error) {
    console.error('Python SDK wheel error:', error);
    res.status(500).json({ success: false, message: 'Failed to build Python SDK' });
  }
});

module.exports = router;
