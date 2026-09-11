const mongoose = require('mongoose');
const Application = require('../models/Application');

const verifyAppOwner = async (req, res, next) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.appId)) {
      return res.status(404).json({ success: false, message: 'Application not found' });
    }
    const app = await Application.findOne({ _id: req.params.appId, owner: req.user._id });
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
