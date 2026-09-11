const User = require('../models/User');
const mongoose = require('mongoose');
const {
  getTokenFromRequest,
  isDashboardOwner,
  isIpAllowed,
  getClientIp,
  assertDashboardOrigin,
  sha256,
  dashboardSessionValid,
  dashboardCsrfValid,
  dashboardSessionUnset,
  setAuthCookie,
  setCsrfCookie,
  dashboardIpPrefix,
  SESSION_MS,
} = require('../utils/security');

const sameOrigin = (req, res, next) => {
  if (!assertDashboardOrigin(req)) {
    console.warn(`[SECURITY] Origin denied: ${req.method} ${req.originalUrl} origin=${req.headers.origin || '-'}`);
    return res.status(403).json({ success: false, message: 'Origin denied' });
  }
  next();
};

const { getStandaloneSession } = require('../utils/standaloneSession');

const protect = async (req, res, next) => {
  const raw = getTokenFromRequest(req);

  if (!raw) {
    return res.status(401).json({ success: false, message: 'Access denied' });
  }

  // 1. Check in-memory standalone session (works offline / when MongoDB is disconnected)
  const standalone = getStandaloneSession(req);
  if (standalone) {
    req.user = standalone.user;
    return next();
  }

  if (mongoose.connection.readyState !== 1) {
    return res.status(401).json({ success: false, message: 'Access denied' });
  }

  try {
    const user = await User.findOne(mongoose.trusted({
      dashboardSessionHash: sha256(raw),
      dashboardSessionExp: { $gt: new Date() },
    })).select(
      '+dashboardSessionHash +dashboardSessionExp +dashboardSessionSeenAt '
      + '+dashboardSessionIpPrefix +dashboardSessionUaHash'
    );
    if (!user || !user.isActive || !dashboardSessionValid(user, req)) {
      if (user) {
        await User.updateOne(
          { _id: user._id, dashboardSessionHash: sha256(raw) },
          { $unset: dashboardSessionUnset() }
        ).catch(() => {});
      }
      return res.status(401).json({ success: false, message: 'Access denied' });
    }
    if (!dashboardCsrfValid(user, req)) {
      return res.status(403).json({ success: false, message: 'Request denied' });
    }

    req.user = user;
    const now = new Date();
    if (!user.dashboardSessionSeenAt
      || now.getTime() - new Date(user.dashboardSessionSeenAt).getTime() > 60000) {
      User.updateOne(
        { _id: user._id, dashboardSessionHash: sha256(raw) },
        {
          $set: {
            dashboardSessionSeenAt: now,
            dashboardSessionExp: new Date(now.getTime() + SESSION_MS),
            dashboardSessionIpPrefix: dashboardIpPrefix(getClientIp(req)),
          },
        }
      ).catch(() => {});
      setAuthCookie(res, raw);
      const csrf = String((req.headers.cookie || '').split(';')
        .map((p) => p.trim())
        .find((p) => p.startsWith('sa_csrf=')) || '').slice('sa_csrf='.length);
      if (/^[a-f0-9]{64}$/.test(csrf)) setCsrfCookie(res, csrf);
    }
    next();
  } catch (error) {
    return res.status(401).json({ success: false, message: 'Access denied' });
  }
};

const adminOnly = (req, res, next) => {
  if (req.user?.role === 'admin') {
    next();
  } else {
    res.status(403).json({ success: false, message: 'Admin access required' });
  }
};

const ownerOnly = (req, res, next) => {
  if (!isDashboardOwner(req.user?.username)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

const ipAllowlist = (req, res, next) => {
  if (!isIpAllowed(req)) {
    console.warn(`[SECURITY] Blocked dashboard IP: ${getClientIp(req)}`);
    return res.status(403).json({ success: false, message: 'Access denied' });
  }
  next();
};

const dashboardProtect = [sameOrigin, ipAllowlist, protect, adminOnly, ownerOnly];

module.exports = { protect, adminOnly, ownerOnly, ipAllowlist, sameOrigin, dashboardProtect };
