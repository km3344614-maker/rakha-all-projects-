const express = require('express');
const router = express.Router();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { protect, ipAllowlist, sameOrigin } = require('../middleware/auth');
const {
  isDashboardOwner,
  setAuthCookie,
  setCsrfCookie,
  clearAuthCookie,
  getTokenFromRequest,
  issueDashboardSession,
  isStrongPassword,
  PASSWORD_HINT,
  getClientIp,
  resolveSessionIp,
  isIpAllowed,
  LOCK_THRESHOLD,
  LOCK_MINUTES,
  isValidLoginIdentifier,
  asSafeString,
  stripMongoOperators,
  sha256,
  escapeRegex,
  dummyPasswordCheck,
  dashboardSessionUnset,
} = require('../utils/security');

const AVATAR_MAX_BYTES = 400 * 1024;
const AVATAR_MIME = {
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

const avatarDataUrl = (user) => {
  if (!user?.avatar) return '';
  const buf = Buffer.isBuffer(user.avatar) ? user.avatar : Buffer.from(user.avatar);
  if (!buf.length) return '';
  const mime = user.avatarMime || 'image/jpeg';
  return `data:${mime};base64,${buf.toString('base64')}`;
};

const publicUser = (user, extras = {}) => ({
  id: user._id,
  username: user.username,
  role: user.role,
  createdAt: user.createdAt,
  lastLogin: user.lastLogin,
  lastLoginIp: user.lastLoginIp,
  avatarUrl: avatarDataUrl(user) || (String(user.avatarUrl || '').startsWith('/uploads/') ? user.avatarUrl : ''),
  ...extras,
});

const loadPublicUser = (id, extras = {}) =>
  User.findById(id).select('+avatar +avatarMime').then((user) => publicUser(user, extras));

const findLoginUser = (identifier) => {
  const value = asSafeString(identifier, 60);
  if (!isValidLoginIdentifier(value)) return null;
  return User.findOne(mongoose.trusted({
    username: { $regex: `^${escapeRegex(value)}$`, $options: 'i' },
  })).select('+password +failedLoginAttempts +lockUntil');
};

const denyAccess = (res) =>
  res.status(401).json({ success: false, message: 'Access denied' });

const issueSession = async (req, res, user) => {
  const { raw, csrf } = await issueDashboardSession(user, req);
  setAuthCookie(res, raw);
  setCsrfCookie(res, csrf);
  return {
    success: true,
    user: await loadPublicUser(user._id),
    csrf,
  };
};

const guardDashboardIp = (req, res) => {
  if (!isIpAllowed(req)) {
    console.warn(`[SECURITY] Auth blocked from IP: ${getClientIp(req)}`);
    denyAccess(res);
    return false;
  }
  return true;
};

const {
  verifyStandaloneLogin,
  createStandaloneSession,
  getStandaloneSession,
  clearStandaloneSession,
} = require('../utils/standaloneSession');

router.post('/login', sameOrigin, async (req, res) => {
  if (!guardDashboardIp(req, res)) return;

  try {
    const body = req.body || {};
    const username = asSafeString(body.username, 60);
    const password = typeof body.password === 'string' ? body.password : '';

    // Check offline/standalone local admin credentials first or if MongoDB is disconnected
    if (mongoose.connection.readyState !== 1) {
      console.log(`[AUTH-DEBUG] Attempting login: username='${username}' mongoose.readyState=${mongoose.connection.readyState}`);
      const standaloneUser = verifyStandaloneLogin(username, password);
      if (standaloneUser) {
        console.log(`[AUTH-DEBUG] Login success for standaloneUser: ${standaloneUser.username}`);
        const sessionResult = createStandaloneSession(standaloneUser, req, res);
        return res.json(sessionResult);
      }
      console.log(`[AUTH-DEBUG] verifyStandaloneLogin returned null`);
      return denyAccess(res);
    }

    const user = username && password ? await findLoginUser(username) : null;
    const ok = user
      ? await bcrypt.compare(password || '\0', user.password)
      : await dummyPasswordCheck(password, 14);

    if (
      !user
      || !ok
      || user.role !== 'admin'
      || !isDashboardOwner(user.username)
      || user.isLocked()
      || !user.isActive
    ) {
      if (user && !ok && !user.isLocked()) {
        user.incLoginFail(LOCK_THRESHOLD, LOCK_MINUTES).catch(() => {});
      }
      return denyAccess(res);
    }

    await user.resetLoginFail();
    const lastLoginIp = await resolveSessionIp(req);
    await User.updateOne(
      { _id: user._id },
      {
        $set: { lastLogin: new Date(), lastLoginIp },
        $inc: { loginCount: 1 },
      }
    );

    return res.json(await issueSession(req, res, user));
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/logout', sameOrigin, async (req, res) => {
  clearStandaloneSession(req, res);
  try {
    const raw = getTokenFromRequest(req);
    if (raw && mongoose.connection.readyState === 1) {
      await User.updateOne(
        { dashboardSessionHash: sha256(raw) },
        { $unset: dashboardSessionUnset() }
      );
    }
  } catch {

  }
  clearAuthCookie(res);
  res.json({ success: true, message: 'Logged out' });
});

router.post('/logout-all', sameOrigin, ipAllowlist, protect, async (req, res) => {
  clearStandaloneSession(req, res);
  if (req.user.role !== 'admin' || !isDashboardOwner(req.user.username)) {
    clearAuthCookie(res);
    return denyAccess(res);
  }
  if (mongoose.connection.readyState === 1) {
    await User.updateOne(
      { _id: req.user._id },
      {
        $unset: dashboardSessionUnset(),
        $inc: { tokenVersion: 1 },
      }
    );
  }
  clearAuthCookie(res);
  res.json({ success: true, message: 'All sessions revoked' });
});

router.get('/me', sameOrigin, ipAllowlist, protect, async (req, res) => {
  if (req.user.role !== 'admin' || !isDashboardOwner(req.user.username)) {
    clearAuthCookie(res);
    return denyAccess(res);
  }
  const currentIp = await resolveSessionIp(req);
  if (mongoose.connection.readyState === 1 && currentIp && req.user.lastLoginIp !== currentIp) {
    await User.updateOne({ _id: req.user._id }, { $set: { lastLoginIp: currentIp } });
  }
  if (mongoose.connection.readyState !== 1) {
    return res.json({
      success: true,
      user: {
        id: req.user._id,
        username: req.user.username,
        role: req.user.role,
        avatarUrl: req.user.avatarUrl || '/rakha.jpg',
        createdAt: req.user.createdAt,
        lastLogin: req.user.lastLogin,
        lastLoginIp: currentIp || req.user.lastLoginIp || '127.0.0.1',
        currentIp: currentIp || '127.0.0.1',
      }
    });
  }
  res.json({
    success: true,
    user: await loadPublicUser(req.user._id, { currentIp: currentIp || req.user.lastLoginIp || '' }),
  });
});

const detectImageKind = (buf) => {
  if (buf.length >= 3 && buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'jpeg';
  if (
    buf.length >= 8 &&
    buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4e && buf[3] === 0x47 &&
    buf[4] === 0x0d && buf[5] === 0x0a && buf[6] === 0x1a && buf[7] === 0x0a
  ) return 'png';
  if (
    buf.length >= 12 &&
    buf.toString('ascii', 0, 4) === 'RIFF' &&
    buf.toString('ascii', 8, 12) === 'WEBP'
  ) return 'webp';
  return null;
};

router.put('/avatar', sameOrigin, ipAllowlist, protect, async (req, res) => {
  if (req.user.role !== 'admin' || !isDashboardOwner(req.user.username)) {
    return denyAccess(res);
  }

  try {
    const image = typeof req.body?.image === 'string' ? req.body.image.trim() : '';
    const match = /^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/=\s]+)$/i.exec(image);
    if (!match) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image. Use JPEG, PNG, or WebP.',
      });
    }

    const claimed = match[1].toLowerCase();
    const buf = Buffer.from(match[2].replace(/\s/g, ''), 'base64');
    if (!buf.length || buf.length > AVATAR_MAX_BYTES) {
      return res.status(400).json({
        success: false,
        message: 'Image must be under 400KB. Try a smaller photo.',
      });
    }

    const kind = detectImageKind(buf);
    if (!kind || kind !== claimed) {
      return res.status(400).json({
        success: false,
        message: 'Invalid image data (content does not match type).',
      });
    }

    await User.updateOne(
      { _id: req.user._id },
      {
        $set: {
          avatar: buf,
          avatarMime: AVATAR_MIME[kind],
          avatarUrl: '',
        },
      }
    );
    res.json({ success: true, user: await loadPublicUser(req.user._id) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to upload avatar' });
  }
});

router.delete('/avatar', sameOrigin, ipAllowlist, protect, async (req, res) => {
  if (req.user.role !== 'admin' || !isDashboardOwner(req.user.username)) {
    return denyAccess(res);
  }

  try {
    await User.updateOne(
      { _id: req.user._id },
      { $set: { avatarUrl: '' }, $unset: { avatar: 1, avatarMime: 1 } }
    );
    res.json({ success: true, user: await loadPublicUser(req.user._id) });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Failed to remove avatar' });
  }
});

router.put('/password', sameOrigin, ipAllowlist, protect, async (req, res) => {
  if (req.user.role !== 'admin' || !isDashboardOwner(req.user.username)) {
    return denyAccess(res);
  }

  try {
    const body = stripMongoOperators(req.body || {});
    const currentPassword = typeof body.currentPassword === 'string' ? body.currentPassword : '';
    const newPassword = typeof body.newPassword === 'string' ? body.newPassword : '';
    if (!currentPassword || !newPassword) {
      return res.status(400).json({ success: false, message: 'Current and new password are required' });
    }
    if (!isStrongPassword(newPassword)) {
      return res.status(400).json({ success: false, message: PASSWORD_HINT });
    }

    const user = await User.findById(req.user._id).select('+password');
    const isMatch = await user.comparePassword(currentPassword);
    if (!isMatch) {
      return res.status(401).json({ success: false, message: 'Current password is incorrect' });
    }

    user.password = newPassword;
    await user.save();
    const { raw, csrf } = await issueDashboardSession(user, req);
    setAuthCookie(res, raw);
    setCsrfCookie(res, csrf);
    return res.json({ success: true, message: 'Password updated', csrf });
  } catch (error) {
    console.error(error);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
