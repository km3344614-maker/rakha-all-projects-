const mongoose = require('mongoose');
const Application = require('../models/Application');

const verifyAppOwner = async (req, res, next) => {
  try {
    // 1. Standalone fallback (offline or mock app)
    if (req.params.appId === 'app_rakha_v3' || mongoose.connection.readyState !== 1) {
      req.ownerApp = {
        _id: req.params.appId || 'app_rakha_v3',
        keyPrefix: 'RAKHA',
        name: 'RAKHA TWEAKS V3',
        hwidLock: true
      };
      return next();
    }

    if (!mongoose.Types.ObjectId.isValid(req.params.appId)) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    const query = req.user?.role === 'admin'
      ? { _id: req.params.appId, status: { $ne: 'deleted' } }
      : { _id: req.params.appId, owner: req.user._id, status: { $ne: 'deleted' } };

    const app = await Application.findOne(query);
    if (!app) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }

    req.ownerApp = app;
    next();
  } catch {
    res.status(500).json({ success: false, message: 'Server error' });
  }
};

module.exports = { verifyAppOwner };
