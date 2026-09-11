const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const Application = require('../models/Application');
const AppUser = require('../models/AppUser');
const LicenseKey = require('../models/LicenseKey');
const Variable = require('../models/Variable');
const Log = require('../models/Log');
const { requireSdkSignature, requireSdkEncryption, sdkTimestampSkewSeconds, parseUtcSeconds, allowKeyAutoRegister, safeEqual, getClientIp, resolveClientIp, LOCK_THRESHOLD, LOCK_MINUTES, stripMongoOperators, sha256, safeJsonParse, escapeRegex, dummyPasswordCheck } = require('../utils/security');
const { hwidTag, normalizeHwid, isValidHwid } = require('../utils/hwidFingerprint');
const { issueSessionToken, sessionMatches, sessionExpired, sessionRemainingSeconds, sessionTtlSeconds, clearSessionFields, sessionTokenFilter, revokeSessionOp, assertVpnAllowed, consumeNonce } = require('../utils/sdkGuards');
const { isEncryptedEnvelope, decryptJson, decryptJsonV3, encryptJson, encryptJsonV3, envelopeVersion, deriveTransportKey, sealTransportForClient, sdkMasterKeyRequired, getSdkMasterKey } = require('../utils/sdkCrypto');
const {
  verifySdkSignature,
  issueHs1,
  parseHs1,
  clientVerifyHmac,
  issueHs2,
  parseHs2,
  sessionKey,
  handshakeServerProof,
  responseProof,
} = require('../utils/sdkSign');
const AppFile = require('../models/AppFile');
const { readSealed, openString } = require('../utils/fileVault');
const { issueTicket, parseTicket, verifyTicket, ticketTtlSeconds } = require('../utils/fileTickets');
const { meetsMinVersion, requiredVersionOf } = require('../utils/appVersion');
const { resolvePublicAppUrl } = require('../utils/publicUrl');
const { notifySecurityAlert } = require('../utils/discordNotify');
const {
  keyHashClause,
  licenseMatchesTyped,
  userLookupFilter,
  revealLicense,
  revealUser,
  revealVariable,
} = require('../utils/fieldCrypto');
const { namesMatchForUsage } = require('../utils/licenseUsageSync');
const { getEnvPackConfig, resolveRemotePack } = require('../utils/envPack');

const maskKey = (key) => {
  const s = String(key || '');
  if (s.length <= 8) return '****';
  return `${s.slice(0, 4)}…${s.slice(-4)}`;
};

const logAction = async (appId, action, data = {}, req = null) => {
  try {
    const payload = { app: appId, action, ...data };
    if (req && (payload.ip === undefined || payload.ip === null || payload.ip === '')) {
      payload.ip = getClientIp(req) || undefined;
    }
    if (payload.username !== undefined && payload.username !== null) {
      const name = String(payload.username).trim();
      payload.username = /-|.{16,}/.test(name) ? maskKey(name) : name;
    }
    await Log.create(payload);
  } catch (e) {
    console.warn('[logAction] failed:', action, e.message);
  }
};

const rejectStaleVersion = async (req, res, app) => {
  const min = requiredVersionOf(app);
  const clientVersion = req.headers['x-rakha-version'];
  if (meetsMinVersion(clientVersion, min)) return false;
  await logAction(app._id, 'version_block', {
    message: `client ${String(clientVersion || '').trim() || '(none)'} < min ${min || '(none)'}`,
    success: false,
    ip: getClientIp(req),
  }, req);
  res.status(426).json({ success: false, message: 'Update required' });
  return true;
};

const wrapSdkResponse = (req, res, app, encrypt) => {
  const wrapEncrypt = encrypt || requireSdkEncryption() || process.env.NODE_ENV === 'production';
  if (wrapEncrypt) req.sdkEncrypt = true;
  res.json = (payload) => {
    let out = payload;
    if (wrapEncrypt && payload && typeof payload === 'object' && !isEncryptedEnvelope(payload)) {
      try {
        if (req.sdkTransportKey && req.sdkEncVersion === 3) {
          out = encryptJsonV3(req.sdkTransportKey, payload);
        } else {
          out = encryptJson(app.appSecret, payload, req.sdkEncVersion || 1);
        }
      } catch {
        res.status(500);
        return res.send('');
      }
    }
    const raw = JSON.stringify(out);
    const t = String(Math.floor(Date.now() / 1000));
    const proofKey = req.sdkSessionKey || app.appSecret;
    res.setHeader('x-rakha-time', t);
    res.setHeader('x-rakha-proof', responseProof(proofKey, t, raw));
    res.setHeader('Content-Type', 'application/json; charset=utf-8');
    return res.send(raw);
  };
};

const findSdkApp = async (req) => {
  const kid = String(req.headers['x-rakha-k'] || req.headers['x-rakha-kid'] || '').trim().toLowerCase();
  if (/^[0-9a-f]{64}$/.test(kid)) {
    const byKid = await Application.findOne({ appKid: kid }).select('+appSecret');
    if (byKid) return byKid;
  }
  const appid = String(
    req.headers.appid
    || req.headers['x-app-id']
    || req.headers['x-rakha-appid']
    || req.headers['x-owner-id']
    || req.headers.ownerid
    || (req.query && (req.query.appid || req.query.appId))
    || (req.body && (req.body.appid || req.body.appId || req.body.ownerid))
    || ''
  ).trim();
  if (!appid || appid.length > 64) return null;
  return Application.findOne({ appId: appid }).select('+appSecret');
};

const verifyApp = async (req, res, next) => {
  const appsecret = String(
    req.headers.appsecret
    || req.headers['x-app-secret']
    || ''
  ).trim() || undefined;
  const signature = req.headers['x-rakha-signature'];
  const timestamp = req.headers['x-rakha-timestamp'];
  const nonce = req.headers['x-rakha-nonce'];
  const authMode = String(req.headers['x-rakha-auth'] || '').toLowerCase();

  const app = await findSdkApp(req);
  if (!app || !app.appSecret) {
    return res.status(403).json({ success: false, message: 'Service unavailable' });
  }
  if (appsecret && String(appsecret).length > 128) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }



  const production = process.env.NODE_ENV === 'production';
  const mustSign = requireSdkSignature() || production;
  const sealedAuth = authMode === 'hmac' || authMode === 'sealed' || !appsecret || mustSign;
  if (mustSign) {
    if (!signature || !timestamp || !nonce) {
      await logAction(app._id, 'security_alert', { message: 'Missing request signature/nonce', ip: getClientIp(req) });
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
  } else if (!sealedAuth) {
    if (!safeEqual(app.appSecret, appsecret)) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } else if (!signature || !timestamp || !nonce) {
    return res.status(401).json({
      success: false,
      message: 'Authentication failed',
    });
  }

  if (app.status !== 'active') {
    return res.status(403).json({ success: false, message: 'Service unavailable' });
  }


  if (app.maintenanceMode) {
    return res.status(503).json({
      success: false,
      message: app.maintenanceMessage || 'Under maintenance'
    });
  }


  if (await rejectStaleVersion(req, res, app)) return;



  if (signature && timestamp) {
    const ts = parseUtcSeconds(timestamp);
    const now = Math.floor(Date.now() / 1000);
    const skew = sdkTimestampSkewSeconds();
    if (!Number.isFinite(ts) || Math.abs(now - ts) > skew) {
      return res.status(401).json({ success: false, message: 'Session expired' });
    }

    const nonceStr = String(nonce || '');
    const bodyStr = typeof req.rawBody === 'string' ? req.rawBody : '';
    const reqPath = String(req.originalUrl || req.url || '').split('?')[0];
    if (!verifySdkSignature(
      app.appSecret,
      signature,
      String(timestamp),
      nonceStr,
      req.method,
      reqPath,
      bodyStr
    )) {
      await logAction(app._id, 'security_alert', { message: 'Invalid request signature detected', ip: getClientIp(req) });
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    if (mustSign || nonceStr) {
      if (!(await consumeNonce(app._id, nonceStr))) {
        await logAction(app._id, 'security_alert', { message: 'Replay or invalid nonce', ip: getClientIp(req) });
        return res.status(401).json({ success: false, message: 'Authentication failed' });
      }
    }
  }


  req.sdkEncrypt = String(req.headers['x-rakha-enc'] || '') === '1'
    || String(req.headers['x-rakha-enc'] || '') === '2';
  req.sdkEncVersion = String(req.headers['x-rakha-enc'] || '') === '2' ? 2 : 1;
  const raw = typeof req.rawBody === 'string' ? req.rawBody.trim() : '';
  const method = String(req.method || 'GET').toUpperCase();
  const hasBody = method !== 'GET' && method !== 'HEAD' && raw.length > 0 && raw !== '{}';
  const mustEncrypt = requireSdkEncryption() || production;

  if (hasBody) {
    let parsed;
    try {
      parsed = safeJsonParse(raw);
    } catch {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }

    if (isEncryptedEnvelope(parsed)) {
      try {
        req.sdkEncVersion = envelopeVersion(parsed) || req.sdkEncVersion || 1;
        req.body = stripMongoOperators(decryptJson(app.appSecret, parsed));
        req.sdkEncrypt = true;
      } catch {
        await logAction(app._id, 'security_alert', { message: 'AES-GCM decrypt failed', ip: getClientIp(req) });
        return res.status(401).json({ success: false, message: 'Authentication failed' });
      }
    } else if (mustEncrypt) {
      await logAction(app._id, 'security_alert', { message: 'Plaintext SDK body rejected', ip: getClientIp(req) });
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    } else {
      req.body = stripMongoOperators(parsed);
    }
  }


  const hs2 = parseHs2(app.appSecret, String(req.headers['x-rakha-session'] || ''));
  if (hs2) req.sdkSessionKey = sessionKey(app.appSecret, hs2.sid, hs2.salt);

  // F-08: Reject legacy SDK encryption when SDK_MASTER_KEY is configured.
  if (sdkMasterKeyRequired() && req.sdkEncVersion !== 3) {
    console.warn('[sdk] legacy encryption rejected - client must use v3 transport');
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }

  wrapSdkResponse(req, res, app, req.sdkEncrypt || mustEncrypt);
  Application.updateOne({ _id: app._id }, { $inc: { totalRequests: 1 } }).catch(() => { });
  req.sdkApp = app;
  next();
};

const CLAIMABLE_STATUSES = ['unused'];

const keyHashFilter = (keyRawStr) => keyHashClause(String(keyRawStr || '').trim());

const loadLicenseKeyByRaw = async (appId, keyRawStr) => {
  const keyRaw = String(keyRawStr || '').trim();
  if (!keyRaw) return null;
  const hashClause = keyHashFilter(keyRaw);
  let licenseKey = hashClause
    ? await LicenseKey.findOne({ app: appId, keyHash: hashClause })
    : null;
  if (!licenseKey) {
    try {
      licenseKey = await LicenseKey.findOne({ app: appId, key: keyRaw }).select('+key');
    } catch (e) {
      console.error('[sdk] licenseKey load:', e.message);
    }
  }
  return licenseKey;
};

const resetOrphanedKey = async (appId, keyRawStr, session = null) => {
  const hashClause = keyHashFilter(keyRawStr);
  if (!hashClause) return;

  const findOpts = session ? { session } : {};
  let licenseKey = await LicenseKey.findOne({ app: appId, keyHash: hashClause }, null, findOpts);
  if (!licenseKey) {
    let legacy = LicenseKey.findOne({ app: appId, key: String(keyRawStr || '').trim() }).select('+key');
    if (session) legacy = legacy.session(session);
    licenseKey = await legacy;
  }
  if (!licenseKey) return;

  if (licenseKey.boundUser) return;

  let linked = await AppUser.findOne({ app: appId, licenseKey: licenseKey._id })
    .select('_id lastLogin loginCount')
    .session(session || null);

  if (!linked) {
    const keyPlain = revealLicense(licenseKey);
    if (keyPlain) {
      const users = await AppUser.find({
        app: appId,
        $or: [
          { status: 'active' },
          { loginCount: { $gt: 0 } },
          { lastLogin: { $ne: null } },
        ],
      })
        .select('_id username usernameSealed lastLogin loginCount licenseKey status')
        .session(session || null)
        .limit(3000);
      linked = users.find((user) => namesMatchForUsage(revealUser(user), keyPlain)) || null;
    }
  }

  if (linked) {
    const now = linked.lastLogin || new Date();
    await LicenseKey.updateOne(
      { _id: licenseKey._id, app: appId, status: { $nin: ['banned', 'paused'] } },
      {
        $set: {
          status: 'active',
          boundUser: linked._id,
          lastUsed: now,
          ...(licenseKey.activatedAt ? {} : { activatedAt: now }),
        },
        $max: { currentUses: 1 },
      }
    ).session(session || null);
    if (!linked.licenseKey) {
      await AppUser.updateOne(
        { _id: linked._id, app: appId },
        { $set: { licenseKey: licenseKey._id } }
      ).session(session || null);
    }
    return;
  }

  const query = LicenseKey.updateMany(
    {
      app: appId,
      keyHash: hashClause,
      boundUser: null,
      $or: [
        { currentUses: { $gt: 0 } },
        { status: { $ne: 'unused' } },
      ],
    },
    { $set: { currentUses: 0, status: 'unused', hwid: null } }
  );
  if (session) query.session(session);
  await query;
};

const assertDeviceAuthorized = (app, appUser, licenseKey, got, { deferHwidBind = false } = {}) => {
  if (!app?.hwidLock) return null;
  if (!got || !isValidHwid(got)) {
    return { status: 403, message: 'Device required' };
  }
  if (appUser?.hwidUnlock === true) return null;

  const bound = appUser?.hwid ? normalizeHwid(appUser.hwid) : '';
  const pending = appUser?.pendingHwid ? normalizeHwid(appUser.pendingHwid) : '';
  const keyHwid = licenseKey?.hwid ? normalizeHwid(licenseKey.hwid) : '';

  // deferHwidBind is for post-spoof rebind on the same account — never bypass another device's bind.
  if (deferHwidBind) {
    if (bound && !safeEqual(bound, got)) {
      return { status: 403, message: 'Device not authorized' };
    }
    if (keyHwid && !safeEqual(keyHwid, got)) {
      if (!pending || !safeEqual(pending, got)) {
        return { status: 403, message: 'Device not authorized' };
      }
    }
    return null;
  }

  if (keyHwid && !safeEqual(keyHwid, got)) {
    const userDeviceOk = (bound && safeEqual(bound, got))
      || (pending && safeEqual(pending, got));
    if (!userDeviceOk) {
      return { status: 403, message: 'Device not authorized' };
    }
  }

  if (bound && !safeEqual(bound, got)) {
    return { status: 403, message: 'Device not authorized' };
  }
  if (!bound && pending && !safeEqual(pending, got)) {
    return { status: 403, message: 'Device not authorized' };
  }
  return null;
};

// pendingHwid guards the window between a deferred login and the post-serial-change
// rebind. Mid-session both values are accepted so a rebind whose response was lost
// in transit cannot kick the client it just succeeded for.
const hwidCandidates = (appUser) => [appUser?.hwid, appUser?.pendingHwid]
  .map((v) => (v ? normalizeHwid(v) : ''))
  .filter(Boolean);

const hwidAccepted = (appUser, licenseKey, got) => {
  if (appUser?.hwidUnlock) return true;
  if (!got) return false;
  const keyHwid = licenseKey?.hwid ? normalizeHwid(licenseKey.hwid) : '';
  if (keyHwid && safeEqual(keyHwid, got)) return true;
  const allowed = hwidCandidates(appUser);
  if (!allowed.length) return !keyHwid;
  return allowed.some((v) => safeEqual(v, got));
};

const LICENSE_KEY_POPULATE = {
  path: 'licenseKey',
  select: 'keyHash keySealed key status expireDate duration hwid boundUser currentUses maxUses',
};

const verifyKeyLogin = async (appUser, typedKey, loginLicenseKey) => {
  const typed = String(typedKey || '').trim();
  if (!appUser || !typed) return { isMatch: false };

  if (appUser.licenseKey && licenseMatchesTyped(appUser.licenseKey, typed)) {
    return { isMatch: true };
  }

  if (loginLicenseKey && licenseMatchesTyped(loginLicenseKey, typed)) {
    const licId = loginLicenseKey._id;
    const currentId = appUser.licenseKey?._id || appUser.licenseKey;
    if (!currentId || String(currentId) !== String(licId)) {
      await AppUser.updateOne({ _id: appUser._id }, { $set: { licenseKey: licId } });
      appUser.licenseKey = loginLicenseKey;
    }
    return { isMatch: true };
  }

  return { isMatch: false };
};

const resolveKeyLicense = (appUser, loginLicenseKey, typedKey) => {
  const typed = String(typedKey || '').trim();
  if (!typed) return null;
  if (loginLicenseKey && licenseMatchesTyped(loginLicenseKey, typed)) return loginLicenseKey;
  if (appUser?.licenseKey && licenseMatchesTyped(appUser.licenseKey, typed)) return appUser.licenseKey;
  return null;
};

// escapeRegex imported from security.js (IMP-3: unified)

const claimLicenseKey = async (
  appId,
  keyRaw,
  hwid,
  { bindHwid = true, session = null } = {}
) => {
  const keyRawStr = String(keyRaw || '').trim();
  if (!keyRawStr) return null;
  await resetOrphanedKey(appId, keyRawStr, session);
  const hwidVal = bindHwid && hwid && String(hwid).trim() ? normalizeHwid(hwid) : null;
  const hashClause = keyHashFilter(keyRawStr);
  const now = new Date();


  const claimable = {
    app: appId,
    status: { $in: CLAIMABLE_STATUSES },
    $expr: {
      $lt: [{ $ifNull: ['$currentUses', 0] }, 1],
    },
    $and: [
      {
        $or: [
          { boundUser: null },
          { boundUser: { $exists: false } },
        ],
      },
      {
        $or: [
          { expireDate: null },
          { expireDate: { $exists: false } },
          { expireDate: { $gt: now } },
        ],
      },
    ],
  };

  const applyClaim = {
    $inc: { currentUses: 1 },
    $set: { status: 'active', lastUsed: now, activatedAt: now, maxUses: 1 },
  };

  let licenseKey = hashClause
    ? await LicenseKey.findOneAndUpdate(
      { ...claimable, keyHash: hashClause },
      applyClaim,
      { new: true, session }
    )
    : null;
  if (!licenseKey) {
    licenseKey = await LicenseKey.findOneAndUpdate(
      { ...claimable, key: keyRawStr },
      applyClaim,
      { new: true, session }
    ).select('+key');
  }

  if (licenseKey && hwidVal && licenseKey.currentUses === 1) {
    licenseKey.hwid = hwidVal;
    await licenseKey.save({ validateBeforeSave: false, session });
  }

  return licenseKey;
};

const touchLicenseActivation = async (appId, licenseKey, userId) => {
  const keyId = licenseKey?._id || licenseKey;
  const uid = userId?._id || userId;
  if (!keyId || !uid) return;
  const now = new Date();
  const update = {
    $set: {
      status: 'active',
      boundUser: uid,
      lastUsed: now,
    },
    $max: { currentUses: 1 },
  };
  const row = await LicenseKey.findOne({ _id: keyId, app: appId })
    .select('activatedAt status boundUser currentUses');
  if (!row) return;
  if (!row.activatedAt) update.$set.activatedAt = now;
  if (row.status === 'banned' || row.status === 'paused') return;
  await LicenseKey.updateOne(
    { _id: keyId, app: appId, status: { $nin: ['banned', 'paused'] } },
    update
  );
  if (licenseKey && typeof licenseKey === 'object') {
    licenseKey.status = 'active';
    licenseKey.boundUser = uid;
    licenseKey.currentUses = Math.max(Number(licenseKey.currentUses) || 0, 1);
    if (!licenseKey.activatedAt) licenseKey.activatedAt = now;
    licenseKey.lastUsed = now;
  }
};

const toIso = (d) => {
  if (!d) return '';
  const t = new Date(d).getTime();
  return Number.isFinite(t) ? new Date(t).toISOString() : '';
};

const loadAppUser = async (query, select) => {
  try {
    return await AppUser.findOne(query)
      .select(select)
      .populate(LICENSE_KEY_POPULATE);
  } catch (e) {
    console.error('[sdk] populate licenseKey:', e.message);
    return AppUser.findOne(query).select(select);
  }
};

const findUserByLicenseKey = async (appId, keyRaw) => {
  const keyRawStr = String(keyRaw || '').trim();
  if (!keyRawStr) return null;
  const licenseKey = await loadLicenseKeyByRaw(appId, keyRawStr);
  if (!licenseKey) return null;

  const userSelect = '+password +sessionTokenHash +sessionTokenHashes +failedLoginAttempts +lockUntil +pendingHwid';
  let appUser = null;
  if (licenseKey.boundUser) {
    appUser = await loadAppUser({ _id: licenseKey.boundUser, app: appId }, userSelect);
  }
  if (!appUser) {
    appUser = await loadAppUser(userLookupFilter(appId, keyRawStr), userSelect);
  }
  return { licenseKey, appUser };
};

const verifyHello = async (req, res, next) => {
  const app = await findSdkApp(req);
  if (!app || !app.appSecret) {
    return res.status(403).json({ success: false, message: 'Service unavailable' });
  }
  if (app.status !== 'active') {
    return res.status(403).json({ success: false, message: 'Service unavailable' });
  }
  if (app.maintenanceMode) {
    return res.status(503).json({ success: false, message: app.maintenanceMessage || 'Under maintenance' });
  }

  const timestamp = req.headers['x-rakha-timestamp'];
  const nonce = String(req.headers['x-rakha-nonce'] || '');
  const ts = parseUtcSeconds(timestamp);
  const now = Math.floor(Date.now() / 1000);
  const skew = sdkTimestampSkewSeconds();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > skew) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  if (!/^[0-9a-f]{32}$/i.test(nonce) || !(await consumeNonce(app._id, nonce))) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }

  const raw = typeof req.rawBody === 'string' ? req.rawBody.trim() : '';
  if (raw) {
    let parsed;
    try { parsed = safeJsonParse(raw); } catch {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    if (isEncryptedEnvelope(parsed)) {
      try {
        req.body = stripMongoOperators(decryptJson(app.appSecret, parsed));
      } catch {
        return res.status(403).json({ success: false, message: 'Service unavailable' });
      }
    } else {
      req.body = stripMongoOperators(parsed);
    }
  }

  wrapSdkResponse(req, res, app, true);
  req.sdkApp = app;
  next();
};

const SDK_OP = {
  HELLO: 1,
  VERIFY: 2,
  LOGIN: 3,
  HEARTBEAT: 4,
  REBIND: 5,
  FILES: 6,
  TICKET: 7,
  ALERT: 8,
  INFO: 9,
};

const flagDeadApp = (req, app, reason) => {
  notifySecurityAlert({
    appName: app?.name || 'Removed app',
    appId: app?.appId || String(req.headers['x-rakha-k'] || '').slice(0, 16),
    version: req.headers['x-rakha-version'],
    reason,
    ip: getClientIp(req),
    telemetry: req.body?.telemetry,
    screenshot: req.body?.screenshot,
  }).catch(() => {});
};

const verifyGateway = async (req, res, next) => {
  const kid = String(req.headers['x-rakha-k'] || req.headers['x-rakha-kid'] || '').trim().toLowerCase();
  if (!/^[0-9a-f]{64}$/.test(kid)) {
    return res.status(403).json({ success: false, message: 'Service unavailable' });
  }
  const app = await Application.findOne({ appKid: kid }).select('+appSecret');
  if (!app || !app.appSecret) {
    flagDeadApp(req, null, 'Deleted application');
    return res.status(403).json({ success: false, message: 'Service unavailable' });
  }

  const production = process.env.NODE_ENV === 'production';
  const mustEncrypt = requireSdkEncryption() || production;
  const raw = typeof req.rawBody === 'string' ? req.rawBody.trim() : '';
  if (!raw) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  let parsed;
  try {
    parsed = safeJsonParse(raw);
  } catch {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }
  if (!isEncryptedEnvelope(parsed)) {
    if (mustEncrypt) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
    req.body = stripMongoOperators(parsed);
  } else {
    const encV = envelopeVersion(parsed);
    try {
      if (encV === 3) {
        const hs2 = parseHs2(app.appSecret, String(req.headers['x-rakha-session'] || ''));
        if (!hs2) {
          return res.status(401).json({ success: false, message: 'Authentication failed' });
        }
        const transportKey = deriveTransportKey(hs2.sid, hs2.salt, app.appKid);
        req.sdkTransportKey = transportKey;
        req.sdkEncVersion = 3;
        req.body = stripMongoOperators(decryptJsonV3(transportKey, parsed));
        req.sdkEncrypt = true;
      } else {
        req.sdkEncVersion = encV || 2;
        req.body = stripMongoOperators(decryptJson(app.appSecret, parsed));
        req.sdkEncrypt = true;
      }
    } catch {
      await logAction(app._id, 'security_alert', { message: 'AES-GCM decrypt failed', ip: getClientIp(req) });
      return res.status(403).json({ success: false, message: 'Service unavailable' });
    }
  }

  const op = Number(req.body?.op);
  if (req.body && typeof req.body === 'object') delete req.body.op;
  req.sdkOp = op;

  if (sdkMasterKeyRequired() && op > SDK_OP.VERIFY && req.sdkEncVersion !== 3) {
    console.warn('[sdk] legacy encryption rejected via gateway — client must use v3 transport');
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }

  const isAlert = op === SDK_OP.ALERT;
  const isLive = app.status === 'active';

  if (!isLive && !isAlert) {
    const why = app.status === 'deleted' ? 'Deleted application' : 'Disabled application';
    flagDeadApp(req, app, why);
    return res.status(403).json({ success: false, message: 'Service unavailable' });
  }
  if (app.maintenanceMode && !isAlert) {
    return res.status(503).json({
      success: false,
      message: app.maintenanceMessage || 'Under maintenance',
    });
  }

  const timestamp = req.headers['x-rakha-timestamp'];
  const nonce = String(req.headers['x-rakha-nonce'] || '');
  const ts = parseUtcSeconds(timestamp);
  const now = Math.floor(Date.now() / 1000);
  const skew = sdkTimestampSkewSeconds();
  if (!Number.isFinite(ts) || Math.abs(now - ts) > skew) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }

  if (!isAlert && await rejectStaleVersion(req, res, app)) return;

  if (op === SDK_OP.HELLO) {
    if (!/^[0-9a-f]{32}$/i.test(nonce) || !(await consumeNonce(app._id, nonce))) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
  } else {
    const signature = req.headers['x-rakha-signature'];
    if (!signature || !timestamp || !/^[0-9a-f]{32}$/i.test(nonce)) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
    const bodyStr = typeof req.rawBody === 'string' ? req.rawBody : '';
    const reqPath = String(req.originalUrl || req.url || '').split('?')[0];
    if (!verifySdkSignature(
      app.appSecret,
      signature,
      String(timestamp),
      nonce,
      req.method,
      reqPath,
      bodyStr
    )) {
      await logAction(app._id, 'security_alert', { message: 'Invalid request signature detected', ip: getClientIp(req) });
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
    if (!(await consumeNonce(app._id, nonce))) {
      await logAction(app._id, 'security_alert', { message: 'Replay or invalid nonce', ip: getClientIp(req) });
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }
  }

  const hs2 = parseHs2(app.appSecret, String(req.headers['x-rakha-session'] || ''));
  if (hs2) {
    req.sdkSessionKey = sessionKey(app.appSecret, hs2.sid, hs2.salt);
    if (req.sdkEncVersion === 3 && !req.sdkTransportKey && getSdkMasterKey()) {
      try {
        req.sdkTransportKey = deriveTransportKey(hs2.sid, hs2.salt, app.appKid);
      } catch {
        req.sdkTransportKey = undefined;
      }
    }
  }
  wrapSdkResponse(req, res, app, true);
  Application.updateOne({ _id: app._id }, { $inc: { totalRequests: 1 } }).catch(() => { });
  req.sdkApp = app;
  next();
};

const handleHandshake = async (req, res) => {
  const hello = req.body?.hello;
  if (hello !== true && hello !== 1 && hello !== 'rakha') {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  const headerTs = parseUtcSeconds(req.headers['x-rakha-timestamp']);
  const headerNonce = String(req.headers['x-rakha-nonce'] || '');
  const bodyTs = parseUtcSeconds(req.body?.ts);
  const bodyNonce = String(req.body?.nonce || '');
  const now = Math.floor(Date.now() / 1000);
  const skew = sdkTimestampSkewSeconds();
  if (!Number.isFinite(headerTs) || Math.abs(now - headerTs) > skew) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  if (!Number.isFinite(bodyTs) || Math.abs(bodyTs - headerTs) > 2) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  if (!/^[0-9a-f]{32}$/i.test(headerNonce) || !safeEqual(bodyNonce.toLowerCase(), headerNonce.toLowerCase())) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }

  const secret = req.sdkApp.appSecret;
  const hs1 = issueHs1(secret);
  const serverTime = now;
  const serverTimeStr = String(serverTime);
  res.json({
    success: true,
    welcome: true,
    serverTime,
    serverTimeUtc: new Date(serverTime * 1000).toISOString(),
    session: hs1.session,
    challenge: hs1.challenge,
    salt: hs1.salt,
    serverProof: handshakeServerProof(secret, hs1.sid, hs1.salt, hs1.challenge, serverTimeStr),
  });
};

router.post('/handshake', verifyHello, handleHandshake);

const handleVerify = async (req, res) => {
  const secret = req.sdkApp.appSecret;
  const hs1 = parseHs1(secret, req.body?.session);
  if (!hs1) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  const mac = String(req.body?.hmac || '').toLowerCase();
  if (!mac || !safeEqual(mac, clientVerifyHmac(secret, hs1.sid, hs1.salt, hs1.challenge))) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  if (!(await consumeNonce(req.sdkApp._id, `v${hs1.sid}`, 90 * 1000))) {
    return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
  req.sdkSessionKey = sessionKey(secret, hs1.sid, hs1.salt);
  const serverTime = Math.floor(Date.now() / 1000);
  let transport;
  if (getSdkMasterKey()) {
    try {
      const transportKey = deriveTransportKey(hs1.sid, hs1.salt, req.sdkApp.appKid);
      transport = sealTransportForClient(secret, transportKey);
    } catch (e) {
      console.error('[sdk/verify] transport key:', e.message);
      return res.status(500).json({ success: false, message: 'Authentication failed' });
    }
  }
  res.json({
    success: true,
    serverTime,
    serverTimeUtc: new Date(serverTime * 1000).toISOString(),
    handshake: issueHs2(secret, hs1.sid, hs1.salt),
    // C++/Python clients extract this field as a JSON string, then open the
    // nested v2 envelope to install the v3 transport key.
    ...(transport ? { transport: JSON.stringify(transport) } : {}),
  });
};

router.post('/verify', verifyApp, handleVerify);

const FILE_TICKET_SELECT = 'name filename size sha256 sourceType +remoteSecret';

const findTicketFile = async (appId, fileId, name) => {
  const base = { app: appId, status: 'active' };
  const keys = [...new Set(
    [fileId, name].map((s) => String(s || '').trim()).filter(Boolean)
  )];
  if (!keys.length) return null;

  for (const key of keys) {
    if (/^[0-9a-fA-F]{24}$/.test(key)) {
      const byId = await AppFile.findOne({ ...base, _id: key }).select(FILE_TICKET_SELECT);
      if (byId) return byId;
    }
    const byName = await AppFile.findOne({
      ...base,
      $or: [{ name: key }, { filename: key }],
    }).select(FILE_TICKET_SELECT);
    if (byName) return byName;
  }

  return null;
};

const findDefaultPackFile = async (appId) => {
  const envPack = getEnvPackConfig();
  if (envPack) {
    const byName = await AppFile.findOne({
      app: appId,
      status: 'active',
      name: envPack.name,
    }).select(FILE_TICKET_SELECT);
    if (byName) return byName;

    return {
      _id: null,
      name: envPack.name,
      filename: envPack.name,
      size: envPack.size,
      sha256: envPack.sha256,
      sourceType: 'remote',
      remoteSecret: '',
    };
  }

  return null;
};

const buildPackPayload = async (req, appUser) => {
  const file = await findDefaultPackFile(req.sdkApp._id);
  if (!file) return null;

  if (file.sourceType === 'remote') {
    const secret = resolveRemotePack(file);
    if (file._id) await AppFile.updateOne({ _id: file._id }, { $inc: { downloads: 1 } });
    return {
      source: 'remote',
      url: secret.url,
      password: secret.password || '',
      name: file.name,
      filename: file.filename || file.name,
      size: file.size,
      sha256: file.sha256 || '',
    };
  }

  const { ticket, expiresIn } = issueTicket(req.sdkApp, file._id, appUser._id, {
    sessionVersion: appUser.sessionVersion,
  });
  const publicBase = resolvePublicAppUrl(
    process.env.APP_URL || process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL
    || `${req.protocol}://${req.get('host')}`
  );
  await AppFile.updateOne({ _id: file._id }, { $inc: { downloads: 1 } });
  return {
    source: 'local',
    url: `${publicBase}/api/d/${ticket}`,
    ticket,
    expiresIn,
    password: '',
    name: file.name,
    filename: file.filename || file.name,
    size: file.size,
    sha256: file.sha256 || '',
  };
};

const handleLogin = async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().slice(0, 256);
    const password = String(req.body?.password || '').trim().slice(0, 256);
    const hwid = req.body?.hwid;
    const pcName = String(req.body?.pcName || req.body?.computerName || '').trim().slice(0, 64);
    const reportedIp = req.body?.clientIp || req.body?.publicIp || req.body?.ip;
    const deferHwidBind = req.body?.deferHwidBind === true || req.body?.deferHwidBind === 'true';
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Missing credentials' });
    }

    const hsTicket = String(req.body?.handshake || req.headers['x-rakha-session'] || '');
    if (!parseHs2(req.sdkApp.appSecret, hsTicket)) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    const vpn = await assertVpnAllowed(req.sdkApp, req);
    if (!vpn.ok) {
      await logAction(req.sdkApp._id, 'vpn_blocked', { username, message: vpn.message }, req);
      return res.status(403).json({ success: false, message: vpn.message });
    }

    const isKeyLogin = username === password;
    const userSelect = '+password +sessionTokenHash +sessionTokenHashes +failedLoginAttempts +lockUntil +pendingHwid';
    const loginLicenseKey = isKeyLogin ? await loadLicenseKeyByRaw(req.sdkApp._id, username) : null;

    if (isKeyLogin && !loginLicenseKey) {
      await dummyPasswordCheck(password, 12);
      await logAction(req.sdkApp._id, 'login_fail', { username, message: 'Unknown license key' }, req);
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    if (isKeyLogin && loginLicenseKey && !licenseMatchesTyped(loginLicenseKey, username)) {
      await dummyPasswordCheck(password, 12);
      await logAction(req.sdkApp._id, 'login_fail', { username, message: 'License case mismatch' }, req);
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    if (isKeyLogin && loginLicenseKey) {
      if (loginLicenseKey.status === 'unused' && !loginLicenseKey.boundUser && !allowKeyAutoRegister()) {
        await dummyPasswordCheck(password, 12);
        await logAction(req.sdkApp._id, 'login_fail', { username, message: 'Unassigned license key' }, req);
        return res.status(401).json({ success: false, message: 'Authentication failed' });
      }
      if (loginLicenseKey.status === 'banned') {
        return res.status(403).json({ success: false, message: 'License suspended' });
      }
      if (loginLicenseKey.status === 'expired') {
        return res.status(403).json({ success: false, message: 'License expired' });
      }
      if (loginLicenseKey.status === 'paused') {
        return res.status(403).json({ success: false, message: 'License paused' });
      }
    }

    let appUser = await loadAppUser(userLookupFilter(req.sdkApp._id, username), userSelect);

    if (isKeyLogin && loginLicenseKey?.boundUser) {
      const owner = await loadAppUser(
        { _id: loginLicenseKey.boundUser, app: req.sdkApp._id },
        userSelect
      );
      if (owner) appUser = owner;
    } else if (!appUser && isKeyLogin) {
      const linked = await findUserByLicenseKey(req.sdkApp._id, username);
      if (linked?.appUser) appUser = linked.appUser;
    }

    if (isKeyLogin && appUser && loginLicenseKey) {
      const matchesUserKey = appUser.licenseKey
        && licenseMatchesTyped(appUser.licenseKey, username);
      const matchesLoginKey = licenseMatchesTyped(loginLicenseKey, username);
      const linkedToUser = loginLicenseKey.boundUser
        && String(loginLicenseKey.boundUser) === String(appUser._id);

      if (!matchesUserKey && matchesLoginKey && linkedToUser) {
        appUser.licenseKey = loginLicenseKey;
        await AppUser.updateOne(
          { _id: appUser._id },
          { $set: { licenseKey: loginLicenseKey._id } }
        );
      } else if (!matchesUserKey && !matchesLoginKey
        && loginLicenseKey.status === 'unused' && !loginLicenseKey.boundUser) {
        appUser = null;
      }
    }


    if (!appUser && allowKeyAutoRegister() && isKeyLogin && loginLicenseKey) {
      if (req.sdkApp.hwidLock && (!hwid || hwid.trim() === '')) {
        await logAction(req.sdkApp._id, 'hwid_missing', { username }, req);
        return res.status(403).json({ success: false, message: 'Device required' });
      }

      const txnSession = await mongoose.startSession();
      const accountName = revealLicense(loginLicenseKey) || username.trim();
      let registeredUserId = null;
      try {
        await txnSession.withTransaction(async () => {
          const licenseKey = await claimLicenseKey(
            req.sdkApp._id,
            username,
            req.sdkApp.hwidLock ? hwid : (hwid || null),
            {
              bindHwid: !!(
                req.sdkApp.hwidLock
                && hwid
                && String(hwid).trim()
              ),
              session: txnSession,
            }
          );

          if (!licenseKey) {
            throw Object.assign(new Error('License key unavailable'), { _softFail: true });
          }

          let expireDate = licenseKey.expireDate || null;
          if (licenseKey.duration > 0 && !expireDate) {
            expireDate = new Date(Date.now() + licenseKey.duration * 24 * 60 * 60 * 1000);
            licenseKey.expireDate = expireDate;
            await licenseKey.save({ validateBeforeSave: false, session: txnSession });
          }

          const createdUsers = await AppUser.create([{
            app: req.sdkApp._id,
            username: accountName,
            password: accountName,
            licenseKey: licenseKey._id,
            hwid: (req.sdkApp.hwidLock && hwid) ? normalizeHwid(hwid) : null,
            pendingHwid: null,
            subscriptionExpire: expireDate,
            status: 'active',
            discordId: AppUser.uniqueUnsetDiscordId(),
            ...(pcName ? { pcName } : {}),
          }], { session: txnSession });
          const createdUser = createdUsers[0];

          licenseKey.boundUser = createdUser._id;
          await licenseKey.save({ validateBeforeSave: false, session: txnSession });
          registeredUserId = createdUser._id;
        });
      } catch (txnErr) {
        if (txnErr._softFail) {
          await dummyPasswordCheck(password, 12);
          await logAction(req.sdkApp._id, 'login_fail', { username, message: 'License key unavailable' }, req);
          return res.status(401).json({ success: false, message: 'Authentication failed' });
        }

        if (txnErr.code === 11000) {
          await dummyPasswordCheck(password, 12);
          await logAction(req.sdkApp._id, 'login_fail', { username, message: 'Concurrent registration rejected' }, req);
          return res.status(401).json({ success: false, message: 'Authentication failed' });
        }

        console.error('[sdk/login] auto-register txn:', txnErr.message);
        return res.status(400).json({
          success: false,
          message: txnErr.name === 'ValidationError' ? 'Invalid license key' : 'Registration failed',
        });
      } finally {
        await txnSession.endSession();
      }

      if (!registeredUserId) {
        return res.status(500).json({ success: false, message: 'Registration failed' });
      }
      appUser = await loadAppUser({ _id: registeredUserId }, userSelect);
      if (!appUser) {
        return res.status(500).json({ success: false, message: 'Registration failed' });
      }
      await logAction(req.sdkApp._id, 'key_auto_register', {
        username: accountName,
        message: `Key auto-registered (${maskKey(accountName)})`,
      }, req);
    }

    if (isKeyLogin && loginLicenseKey?.boundUser && appUser
      && String(loginLicenseKey.boundUser) !== String(appUser._id)) {
      await logAction(req.sdkApp._id, 'login_fail', { username, message: 'License bound to another account' }, req);
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    if (!appUser) {
      await dummyPasswordCheck(password, 12);
      await logAction(req.sdkApp._id, 'login_fail', { username, message: 'Invalid credentials' }, req);
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    if (appUser.isLocked()) {
      await dummyPasswordCheck(password, 12);
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    let isMatch = false;
    if (isKeyLogin) {
      ({ isMatch } = await verifyKeyLogin(appUser, username, loginLicenseKey));
    } else {
      try {
        isMatch = await appUser.comparePassword(password);
      } catch {
        isMatch = false;
      }
    }
    if (!isMatch) {
      appUser.incLoginFail(LOCK_THRESHOLD, LOCK_MINUTES).catch(() => {});
      await logAction(req.sdkApp._id, 'login_fail', { username, message: 'Wrong password' }, req);
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }

    if (isKeyLogin) {
      const keyLic = resolveKeyLicense(appUser, loginLicenseKey, username);
      if (!keyLic) {
        await logAction(req.sdkApp._id, 'login_fail', { username, message: 'Invalid license key' }, req);
        return res.status(401).json({ success: false, message: 'Authentication failed' });
      }
      if (!appUser.licenseKey || String(appUser.licenseKey._id || appUser.licenseKey) !== String(keyLic._id)) {
        appUser.licenseKey = keyLic;
        await AppUser.updateOne({ _id: appUser._id }, { $set: { licenseKey: keyLic._id } });
      }
      await touchLicenseActivation(req.sdkApp._id, keyLic, appUser._id);
    }

    if (appUser.status !== 'active') {
      if (appUser.status === 'banned') {
        return res.status(403).json({ success: false, message: 'Account suspended' });
      }
      if (appUser.status === 'expired') {
        return res.status(403).json({ success: false, message: 'License expired' });
      }
      return res.status(403).json({ success: false, message: 'Account inactive' });
    }

    if (appUser.licenseKey) {
      if (appUser.licenseKey.status === 'banned') {
        return res.status(403).json({ success: false, message: 'License suspended' });
      }
      if (appUser.licenseKey.status === 'expired') {
        return res.status(403).json({ success: false, message: 'License expired' });
      }
      if (appUser.licenseKey.status === 'paused') {
        return res.status(403).json({ success: false, message: 'License paused' });
      }
    } else if (isKeyLogin) {
      return res.status(401).json({ success: false, message: 'Authentication failed' });
    }


    if (appUser.subscriptionExpire) {
      const expMs = new Date(appUser.subscriptionExpire).getTime();
      if (Number.isFinite(expMs) && Date.now() > expMs) {
        Object.assign(appUser, clearSessionFields());
        appUser.status = 'expired';
        if (typeof appUser.depopulate === 'function') appUser.depopulate('licenseKey');
        await appUser.save({ validateBeforeSave: false });
        return res.status(403).json({ success: false, message: 'License expired' });
      }
    }


    let bindHwid = null;
    let pendingHwid = null;
    let clearPending = false;
    let clearBoundHwid = false;
    if (req.sdkApp.hwidLock) {
      const got = normalizeHwid(hwid);
      if (!got || !isValidHwid(got)) {
        await logAction(req.sdkApp._id, 'hwid_missing', { username }, req);
        return res.status(403).json({ success: false, message: 'Device required' });
      }
      const unlocked = appUser.hwidUnlock === true;
      if (!unlocked) {
        const deny = assertDeviceAuthorized(
          req.sdkApp,
          appUser,
          appUser.licenseKey,
          got,
          { deferHwidBind },
        );
        if (deny) {
          await logAction(req.sdkApp._id, 'hwid_mismatch', {
            username,
            message: `device mismatch tag=${hwidTag(got)}`,
          }, req);
          return res.status(deny.status).json({ success: false, message: deny.message });
        }
      }
      const bound = (!unlocked && appUser.hwid) ? normalizeHwid(appUser.hwid) : '';
      const pending = (!unlocked && appUser.pendingHwid) ? normalizeHwid(appUser.pendingHwid) : '';
      if (deferHwidBind) {
        pendingHwid = got;
        // Post-spoof: keep old bind until rebind; stage the new fingerprint.
        clearBoundHwid = unlocked || (Boolean(bound) && !safeEqual(bound, got));
        if (pending && !safeEqual(pending, got)) {
          await logAction(req.sdkApp._id, 'hwid_pending_change', {
            username,
            message: `pending old=${hwidTag(pending)} new=${hwidTag(got)}`,
          }, req);
        }
      } else if (bound) {
        clearPending = Boolean(appUser.pendingHwid);
        if (appUser.licenseKey) {
          appUser.licenseKey.hwid = got;
          await appUser.licenseKey.save({ validateBeforeSave: false });
        }
      } else {
        bindHwid = got;
        if (appUser.licenseKey) {
          appUser.licenseKey.hwid = bindHwid;
          await appUser.licenseKey.save({ validateBeforeSave: false });
        }
      }
    }

    await appUser.resetLoginFail();
    const { token: sessionToken, hash: sessionTokenHash } = issueSessionToken();
    const now = new Date();
    const clientIp = resolveClientIp(req, reportedIp);
    const singleSession = req.sdkApp.oneSessionPerCredential !== false;
    const prevHashes = Array.isArray(appUser.sessionTokenHashes)
      ? appUser.sessionTokenHashes.filter(Boolean)
      : [];
    const sessionTokenHashes = singleSession
      ? [sessionTokenHash]
      : [...prevHashes, sessionTokenHash].slice(-8);
    const loginCount = (Number(appUser.loginCount) || 0) + 1;
    const sessionVersion = (Number(appUser.sessionVersion) || 0) + (singleSession ? 1 : 0);
    const baseSet = {
      sessionTokenHash,
      sessionTokenHashes,
      lastLogin: now,
      lastSeen: now,
      loginCount,
      sessionVersion,
      ...(clientIp ? { lastIp: clientIp } : {}),
      ...(pcName ? { pcName } : {}),
      ...(clearBoundHwid ? { hwid: null } : {}),
      ...(bindHwid ? { hwid: bindHwid } : {}),
      ...(pendingHwid ? { pendingHwid } : {}),
      ...((bindHwid || clearPending) ? { pendingHwid: null } : {}),
      ...(appUser.hwidUnlock ? { hwidUnlock: false } : {}),
      sessionKilled: false,
    };

    await AppUser.updateOne({ _id: appUser._id }, { $set: baseSet });
    appUser.hwid = bindHwid || (clearBoundHwid ? null : appUser.hwid);
    appUser.pendingHwid = pendingHwid || (clearPending ? null : appUser.pendingHwid);
    appUser.hwidUnlock = false;
    appUser.loginCount = loginCount;

    let varMap = {};
    try {
      const variables = await Variable.find({ app: req.sdkApp._id }).select('name value authenticated');
      variables.forEach((v) => {
        if (v && v.name) varMap[v.name] = revealVariable(v);
      });
    } catch (e) {
      console.error('[sdk/login] variables:', e.message);
    }

    if (pcName) appUser.pcName = pcName;
    await logAction(req.sdkApp._id, 'login_success', {
      username,
      hwid: bindHwid ? hwidTag(bindHwid) : (hwid ? hwidTag(hwid) : undefined),
      message: deferHwidBind ? 'defer_hwid_bind' : undefined,
    }, req);

    const sessionExpiresIn = sessionTtlSeconds(req.sdkApp);
    const expireStr = toIso(appUser.subscriptionExpire);

    const resolvedIp = clientIp || '';
    const resolvedUser = revealUser(appUser) || username;

    let pack = null;
    try {
      pack = await buildPackPayload(req, appUser);
    } catch (e) {
      console.error('[sdk/login] pack:', e.message);
    }

    res.json({
      success: true,
      message: 'Authenticated',
      appName: req.sdkApp.name,
      sessionToken,
      sessionExpiresIn,
      username: resolvedUser,
      license: isKeyLogin ? (revealLicense(appUser.licenseKey) || username) : undefined,
      pcName: pcName || appUser.pcName || '',
      hwid: appUser.hwid || bindHwid || '',
      ip: resolvedIp,
      lastIp: resolvedIp,
      subscriptionExpire: expireStr,
      loginCount: appUser.loginCount,
      user: {
        username: resolvedUser,
        pcName: pcName || appUser.pcName || '',
        subscriptionExpire: expireStr,
        loginCount: appUser.loginCount,
        hwid: appUser.hwid || bindHwid || '',
        ip: resolvedIp,
        lastIp: resolvedIp,
      },
      variables: varMap,
      pack,
      appVersion: req.sdkApp.version
    });
  } catch (error) {
    console.error('[sdk/login]', error.message, error.stack);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

router.post('/login', verifyApp, handleLogin);

const handleRebind = async (req, res) => {
  try {
    const sessionToken = String(req.body?.sessionToken || '').trim();
    const newHwid = normalizeHwid(req.body?.hwid);
    if (!sessionToken) {
      return res.status(400).json({ success: false, message: 'Missing session' });
    }
    if (!isValidHwid(newHwid)) {
      return res.status(400).json({ success: false, message: 'Invalid device fingerprint' });
    }
    if (!req.sdkApp.hwidLock) {
      return res.json({ success: true, message: 'Device lock disabled', hwid: newHwid, unchanged: true });
    }

    const sessionHash = sha256(sessionToken);
    let appUser = await AppUser.findOne({
      app: req.sdkApp._id,
      status: 'active',
      $or: [
        { sessionTokenHash: sessionHash },
        { sessionTokenHashes: sessionHash },
      ],
    })
      .select('+sessionTokenHash +sessionTokenHashes +pendingHwid')
      .populate(LICENSE_KEY_POPULATE);
    if (!appUser || appUser.sessionKilled || !sessionMatches(appUser, sessionToken)) {
      return res.status(401).json({ success: false, message: 'Invalid session' });
    }
    if (sessionExpired(req.sdkApp, appUser)) {
      Object.assign(appUser, clearSessionFields());
      await appUser.save({ validateBeforeSave: false });
      return res.status(401).json({ success: false, message: 'Session expired' });
    }

    const oldHwid = appUser.hwid ? normalizeHwid(appUser.hwid) : '';
    const oldPending = appUser.pendingHwid ? normalizeHwid(appUser.pendingHwid) : '';
    const logUser = revealUser(appUser);
    if (oldHwid && safeEqual(oldHwid, newHwid)) {
      if (appUser.pendingHwid) {
        await AppUser.updateOne({ _id: appUser._id }, { $set: { pendingHwid: null } });
      }
      await logAction(req.sdkApp._id, 'hwid_rebind', {
        username: logUser,
        message: `noop tag=${hwidTag(newHwid)}`,
      }, req);
      return res.json({
        success: true,
        message: 'Device already bound',
        hwid: newHwid,
        unchanged: true,
      });
    }

    const firstBind = !oldHwid;
    const pendingOk = !!(oldPending && safeEqual(oldPending, newHwid));
    const serialUpdate = !!(oldHwid && !safeEqual(oldHwid, newHwid));
    if (!firstBind) {
      const dayAgo = Date.now() - 24 * 60 * 60 * 1000;
      const windowStart = appUser.hwidRebindAt ? new Date(appUser.hwidRebindAt).getTime() : 0;
      const count = windowStart >= dayAgo ? (Number(appUser.hwidRebindCount) || 0) : 0;
      if (count >= 8) {
        return res.status(429).json({ success: false, message: 'Device bind limit' });
      }
      // Cooldown only for suspicious rebinds, not post-spoof serial updates.
      if (!pendingOk && !serialUpdate) {
        if (windowStart && Date.now() - windowStart < 2 * 60 * 1000) {
          return res.status(429).json({ success: false, message: 'Device bind cooldown' });
        }
      }
    }

    const rebindOr = [
      { hwid: null },
      { hwid: { $exists: false } },
      { hwid: '' },
      { hwid: newHwid },
    ];
    if (oldHwid) rebindOr.push({ hwid: oldHwid });
    if (oldPending) rebindOr.push({ pendingHwid: oldPending });

    const updated = await AppUser.findOneAndUpdate(
      {
        _id: appUser._id,
        app: req.sdkApp._id,
        status: 'active',
        $or: rebindOr,
      },
      {
        $set: {
          hwid: newHwid,
          pendingHwid: null,
          lastSeen: new Date(),
          hwidRebindAt: new Date(),
          hwidRebindCount: firstBind || pendingOk || serialUpdate
            ? 0
            : ((appUser.hwidRebindAt && new Date(appUser.hwidRebindAt).getTime() >= Date.now() - 24 * 60 * 60 * 1000)
              ? (Number(appUser.hwidRebindCount) || 0) + 1
              : 1),
        },
      },
      { new: true }
    );

    if (!updated) {
      await logAction(req.sdkApp._id, 'hwid_rebind_fail', {
        username: logUser,
        message: `update_failed attempted=${hwidTag(newHwid)}`,
      }, req);
      return res.status(409).json({ success: false, message: 'Device bind failed — retry' });
    }

    const licId = updated.licenseKey || appUser.licenseKey?._id || appUser.licenseKey;
    if (licId) {
      for (let i = 0; i < 3; i++) {
        const lic = await LicenseKey.updateOne(
          { _id: licId, app: req.sdkApp._id },
          { $set: { hwid: newHwid } }
        );
        if (lic.matchedCount) break;
      }
    }

    await logAction(req.sdkApp._id, 'hwid_rebind', {
      username: logUser,
      message: `old=${hwidTag(oldHwid) || 'none'} new=${hwidTag(newHwid)}`,
    }, req);

    res.json({
      success: true,
      message: 'Device binding updated',
      hwid: newHwid,
      unchanged: false,
    });
  } catch (error) {
    console.error('[sdk/hwid/rebind]', error.message);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

router.post('/hwid/rebind', verifyApp, handleRebind);

const handleAppInfo = async (req, res) => {
  res.json({
    success: true,
    name: req.sdkApp.name,
    slug: req.sdkApp.slug || '',
    version: req.sdkApp.version,
    status: req.sdkApp.status,
    app: {
      name: req.sdkApp.name,
      slug: req.sdkApp.slug || '',
      version: req.sdkApp.version,
      status: req.sdkApp.status
    }
  });
};

router.get('/app-info', verifyApp, handleAppInfo);

const handleHeartbeat = async (req, res) => {
  try {
    const username = String(req.body?.username || '').trim().slice(0, 128);
    const { hwid, sessionToken } = req.body;
    const pcName = String(req.body?.pcName || req.body?.computerName || '').trim().slice(0, 64);
    const reportedIp = req.body?.clientIp || req.body?.publicIp || req.body?.ip;
    if (!username) return res.json({ alive: false, message: 'Missing credentials' });

    let appUser = await AppUser.findOne(userLookupFilter(req.sdkApp._id, username))
      .select('+sessionTokenHash +sessionTokenHashes +pendingHwid')
      .populate(LICENSE_KEY_POPULATE);
    if (!appUser) return res.json({ alive: false, status: 'not_found', message: 'Invalid credentials' });

    if (appUser.status !== 'active') {
      if (appUser.status === 'banned') {
        return res.json({ alive: false, status: 'banned', message: 'Account suspended' });
      }
      if (appUser.status === 'expired') {
        return res.json({ alive: false, status: 'expired', message: 'License expired' });
      }
      return res.json({ alive: false, status: 'inactive', message: 'Account inactive' });
    }

    if (appUser.sessionKilled) {
      return res.json({ alive: false, status: 'session_invalid', message: 'Invalid session' });
    }
    if (!sessionToken || !sessionMatches(appUser, sessionToken)) {
      return res.json({ alive: false, status: 'session_invalid', message: 'Invalid session' });
    }
    if (sessionExpired(req.sdkApp, appUser)) {
      await AppUser.updateOne({ _id: appUser._id }, revokeSessionOp());
      return res.json({ alive: false, status: 'session_expired', message: 'Session expired' });
    }

    const vpn = await assertVpnAllowed(req.sdkApp, req, { soft: true });
    if (!vpn.ok) {
      return res.json({ alive: false, status: 'vpn_blocked', message: vpn.message });
    }

    if (req.sdkApp.hwidLock) {
      const got = normalizeHwid(hwid);
      if (!got || !isValidHwid(got)) {
        return res.json({ alive: false, status: 'hwid_required', message: 'Device required' });
      }
      if (!hwidAccepted(appUser, appUser.licenseKey, got)) {
        await logAction(req.sdkApp._id, 'hwid_mismatch', {
          username,
          message: `heartbeat bound=${hwidTag(appUser.hwid) || 'none'} pending=${hwidTag(appUser.pendingHwid) || 'none'} got=${hwidTag(got)}`,
        });
        return res.json({ alive: false, status: 'hwid_mismatch', message: 'Device not authorized' });
      }
      const keyHwid = appUser.licenseKey?.hwid ? normalizeHwid(appUser.licenseKey.hwid) : '';
      if (appUser.licenseKey && keyHwid && !safeEqual(keyHwid, got)) {
        await LicenseKey.updateOne(
          { _id: appUser.licenseKey._id, app: req.sdkApp._id },
          { $set: { hwid: got } }
        );
      }
    }

    if (appUser.licenseKey) {
      if (appUser.licenseKey.status === 'banned') {
        return res.json({ alive: false, status: 'banned', message: 'License suspended' });
      }
      if (appUser.licenseKey.status === 'expired') {
        return res.json({ alive: false, status: 'expired', message: 'License expired' });
      }
      if (appUser.licenseKey.status === 'paused') {
        return res.json({ alive: false, status: 'paused', message: 'License paused' });
      }
    }

    if (appUser.subscriptionExpire && new Date() > appUser.subscriptionExpire) {
      const op = revokeSessionOp();
      await AppUser.updateOne(
        { _id: appUser._id },
        { ...op, $set: { ...op.$set, status: 'expired' } }
      );
      return res.json({ alive: false, status: 'expired', message: 'License expired' });
    }

    appUser.lastSeen = new Date();
    const hbIp = resolveClientIp(req, reportedIp);
    if (hbIp) appUser.lastIp = hbIp;
    if (pcName) appUser.pcName = pcName;
    const hbSet = { lastSeen: appUser.lastSeen };
    if (hbIp) hbSet.lastIp = hbIp;
    if (pcName) hbSet.pcName = pcName;
    const touched = await AppUser.updateOne(
      {
        _id: appUser._id,
        sessionKilled: { $ne: true },
        lastSeen: { $gt: new Date(1000) },
        ...sessionTokenFilter(sessionToken),
      },
      { $set: hbSet }
    );
    if (!touched.matchedCount) {
      return res.json({ alive: false, status: 'session_invalid', message: 'Invalid session' });
    }

    const liveIp = appUser.lastIp || hbIp || '';
    res.json({
      alive: true,
      status: 'active',
      username: revealUser(appUser),
      pcName: appUser.pcName || pcName || '',
      ip: liveIp,
      lastIp: liveIp,
      sessionExpiresIn: sessionRemainingSeconds(req.sdkApp, appUser),
      // Expose sessionVersion so the client SDK can detect a server-side
      // kill (version bump) immediately on the next heartbeat poll.
      sessionVersion: appUser.sessionVersion || 0,
    });
  } catch (error) {
    res.json({ alive: false, status: 'error', message: 'Authentication failed' });
  }
};

router.post('/heartbeat', verifyApp, handleHeartbeat);

// Resolves the caller to an authenticated, still-entitled app user. Every file
// route goes through this so a session token alone is never enough once the
// account is banned, expired or its device changed.
const resolveSessionUser = async (req) => {
  const username = String(req.body?.username || '').trim().slice(0, 128);
  const { hwid, sessionToken } = req.body || {};
  if (!username) return { error: 'No username' };

  const vpn = await assertVpnAllowed(req.sdkApp, req);
  if (!vpn.ok) return { error: vpn.message };

  let appUser = await AppUser.findOne(userLookupFilter(req.sdkApp._id, username))
    .select('+sessionTokenHash +sessionTokenHashes +pendingHwid')
    .populate(LICENSE_KEY_POPULATE);
  if (!appUser) return { error: 'Not authorized' };
  if (appUser.status !== 'active') return { error: 'Not authorized' };
  if (appUser.sessionKilled) return { error: 'Invalid session' };
  if (!sessionToken || !sessionMatches(appUser, sessionToken)) return { error: 'Invalid session' };
  if (sessionExpired(req.sdkApp, appUser)) return { error: 'Session expired' };

  if (req.sdkApp.hwidLock) {
    const got = normalizeHwid(hwid);
    if (!got || !isValidHwid(got)) return { error: 'This device is not authorized' };
    if (!hwidAccepted(appUser, appUser.licenseKey, got)) {
      return { error: 'This device is not authorized' };
    }
    const keyHwid = appUser.licenseKey?.hwid ? normalizeHwid(appUser.licenseKey.hwid) : '';
    if (appUser.licenseKey && keyHwid && !safeEqual(keyHwid, got)) {
      await LicenseKey.updateOne(
        { _id: appUser.licenseKey._id, app: req.sdkApp._id },
        { $set: { hwid: got } }
      );
    }
  }

  if (appUser.licenseKey && appUser.licenseKey.status !== 'active') {
    if (['banned', 'expired', 'paused'].includes(appUser.licenseKey.status)) {
      return { error: 'Not authorized' };
    }
  }
  if (appUser.subscriptionExpire && new Date() > appUser.subscriptionExpire) {
    return { error: 'License expired' };
  }
  return { appUser };
};

// Quotes, backslashes and control characters would either corrupt the header or
// make Node reject it outright, so the value is reduced to a safe filename.
const contentDisposition = (raw) => {
  const safe = String(raw || '')
    .replace(/[^A-Za-z0-9._-]/g, '_')
    .slice(0, 120) || 'download.bin';
  return `attachment; filename="${safe}"`;
};

const handleFiles = async (req, res) => {
  try {
    const resolved = await resolveSessionUser(req);
    if (resolved.error) {
      return res.status(403).json({ success: false, message: resolved.error });
    }

    const files = await AppFile.find({ app: req.sdkApp._id, status: 'active' })
      .select('name filename size sha256 sourceType updatedAt')
      .sort('name');

    const envPack = getEnvPackConfig();
    const mapped = files
      .map(f => ({
        id: f._id,
        name: f.name,
        filename: f.filename || f.name,
        size: f.size,
        sha256: f.sha256,
        source: f.sourceType || 'local',
        updatedAt: f.updatedAt,
      }));

    if (envPack && !mapped.some(f => f.name === envPack.name)) {
      mapped.push({
        id: 'env',
        name: envPack.name,
        filename: envPack.name,
        size: envPack.size,
        sha256: envPack.sha256,
        source: 'remote',
        updatedAt: new Date(),
      });
    }

    res.json({
      success: true,
      files: mapped,
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

router.post('/files', verifyApp, handleFiles);

const handleTicket = async (req, res) => {
  try {
    const resolved = await resolveSessionUser(req);
    if (resolved.error) {
      return res.status(403).json({ success: false, message: resolved.error });
    }

    const fileId = String(req.body?.fileId || req.body?.id || '').trim();
    const name = String(req.body?.name || '').trim();
    const file = await findTicketFile(req.sdkApp._id, fileId, name);
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    // Externally hosted: the guarded secret is the link itself, released only
    // now that the key, session, device and build have all been verified.
    if (file.sourceType === 'remote') {
      let secret;
      try {
        secret = resolveRemotePack(file);
      } catch {
        console.error('[sdk/ticket] remote secret unreadable for', file.name);
        return res.status(500).json({ success: false, message: 'File unavailable' });
      }

      if (file._id) await AppFile.updateOne({ _id: file._id }, { $inc: { downloads: 1 } });
      await logAction(req.sdkApp._id, 'file_released', {
        username: revealUser(resolved.appUser),
        message: `link released for ${file.name}`,
      }, req);

      return res.json({
        success: true,
        source: 'remote',
        url: secret.url,
        password: secret.password || '',
        name: file.name,
        filename: file.filename || file.name,
        size: file.size,
        sha256: file.sha256,
      });
    }

    const { ticket, expiresIn } = issueTicket(req.sdkApp, file._id, resolved.appUser._id, {
      sessionVersion: resolved.appUser.sessionVersion,
    });
    const publicBase = resolvePublicAppUrl(
      process.env.APP_URL || process.env.PUBLIC_APP_URL || process.env.RENDER_EXTERNAL_URL
      || `${req.protocol}://${req.get('host')}`
    );
    res.json({
      success: true,
      source: 'local',
      url: `${publicBase}/api/d/${ticket}`,
      ticket,
      expiresIn,
      name: file.name,
      filename: file.filename || file.name,
      size: file.size,
      sha256: file.sha256,
    });
  } catch (error) {
    console.error('[sdk/ticket]', error && error.message);
    res.status(500).json({ success: false, message: 'Authentication failed' });
  }
};

router.post('/files/ticket', verifyApp, handleTicket);

const handleAlert = async (req, res) => {
  const reason = String(req.body?.reason || 'alert').slice(0, 200);
  const ip = getClientIp(req);
  const status = String(req.sdkApp?.status || '');
  const dead = status && status !== 'active';
  await logAction(req.sdkApp._id, 'security_alert', {
    message: reason,
    ip,
  }, req);
  res.json({ success: true });
  notifySecurityAlert({
    appName: req.sdkApp?.name || req.sdkApp?.appId,
    appId: req.sdkApp?.appId,
    version: req.headers['x-rakha-version'],
    reason: dead ? `${reason} · app ${status}` : reason,
    ip,
    telemetry: req.body?.telemetry,
    screenshot: req.body?.screenshot,
  }).catch(() => {});
};

const handleGateway = async (req, res) => {
  switch (req.sdkOp) {
    case SDK_OP.HELLO: return handleHandshake(req, res);
    case SDK_OP.VERIFY: return handleVerify(req, res);
    case SDK_OP.LOGIN: return handleLogin(req, res);
    case SDK_OP.HEARTBEAT: return handleHeartbeat(req, res);
    case SDK_OP.REBIND: return handleRebind(req, res);
    case SDK_OP.FILES: return handleFiles(req, res);
    case SDK_OP.TICKET: return handleTicket(req, res);
    case SDK_OP.ALERT: return handleAlert(req, res);
    case SDK_OP.INFO: return handleAppInfo(req, res);
    default:
      return res.status(401).json({ success: false, message: 'Authentication failed' });
  }
};

router.post('/q', verifyGateway, handleGateway);

// Deliberately outside verifyApp: the signed one-time ticket is the credential,
// so a plain HTTP downloader can fetch the bytes with no headers at all.
router.get('/files/download/:ticket', async (req, res) => {
  try {
    const parsed = parseTicket(req.params.ticket);
    if (!parsed) return res.status(400).json({ success: false, message: 'Invalid link' });

    const app = await Application.findOne({ appId: parsed.payload.a }).select('+appSecret');
    if (!app || !app.appSecret) {
      return res.status(403).json({ success: false, message: 'Invalid link' });
    }
    if (!verifyTicket(app.appSecret, parsed)) {
      await logAction(app._id, 'security_alert', {
        message: 'Invalid link',
        ip: getClientIp(req),
      });
      return res.status(403).json({ success: false, message: 'Link expired' });
    }
    if (app.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Service unavailable' });
    }
    if (app.maintenanceMode) {
      return res.status(403).json({ success: false, message: 'Service unavailable' });
    }

    const holder = await AppUser.findOne({ _id: parsed.payload.u, app: app._id })
      .populate(LICENSE_KEY_POPULATE);
    if (!holder || holder.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (holder.sessionKilled) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (parsed.payload.sv !== undefined
        && Number(holder.sessionVersion) !== Number(parsed.payload.sv)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }
    if (holder.subscriptionExpire && new Date() > holder.subscriptionExpire) {
      return res.status(403).json({ success: false, message: 'License expired' });
    }
    if (holder.licenseKey && ['banned', 'expired', 'paused'].includes(holder.licenseKey.status)) {
      return res.status(403).json({ success: false, message: 'Access denied' });
    }

    const file = await AppFile.findOne({
      _id: parsed.payload.f,
      app: app._id,
      status: 'active',
    }).select('+storageKey +iv +tag +wrappedKey +wrapIv +wrapTag');
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (!(await consumeNonce(app._id, parsed.payload.n, ticketTtlSeconds() * 1000 + 30000))) {
      return res.status(403).json({ success: false, message: 'Link used' });
    }

    const plain = await readSealed(file);

    await AppFile.updateOne({ _id: file._id }, { $inc: { downloads: 1 } });

    res.setHeader('Content-Type', 'application/octet-stream');
    res.setHeader('Content-Length', plain.length);
    res.setHeader('Content-Disposition', contentDisposition(file.filename || file.name));
    res.setHeader('X-Content-SHA256', file.sha256);
    res.setHeader('Cache-Control', 'no-store');
    // Prevent browsers from sniffing the binary payload as HTML or script.
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    res.send(plain);
  } catch (error) {
    console.error('[sdk/download]', error && error.message);
    res.status(500).json({ success: false, message: 'File unavailable' });
  }
});

module.exports = router;
