const express = require('express');
const router = express.Router({ mergeParams: true });
const Log = require('../models/Log');
const { dashboardProtect } = require('../middleware/auth');
const { verifyAppOwner } = require('../middleware/verifyAppOwner');

router.get('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const { action, success } = req.query;
    const filter = { app: req.params.appId };
    if (action) filter.action = String(action).slice(0, 64);
    if (success !== undefined) filter.success = success === 'true';

    const total = await Log.countDocuments(filter);
    const logs = await Log.find(filter)
      .sort('-createdAt')
      .skip((page - 1) * limit)
      .limit(limit);

    res.json({ success: true, logs, total, page });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    await Log.deleteMany({ app: req.params.appId });
    res.json({ success: true, message: 'Logs cleared' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
