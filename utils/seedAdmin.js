const mongoose = require('mongoose');
const User = require('../models/User');
const Application = require('../models/Application');
const { getAdminUsername, escapeRegex } = require('./security');

const seedAdmin = async () => {
  const password = process.env.ADMIN_PASSWORD;
  const username = getAdminUsername();

  try {
    const r1 = await Application.updateMany(
      mongoose.trusted({ oneSessionPerCredential: { $exists: false } }),
      { $set: { oneSessionPerCredential: true } }
    );
    const r2 = await Application.updateMany(
      mongoose.trusted({ hwidLock: { $exists: false } }),
      { $set: { hwidLock: true } }
    );
    const n = (r1.modifiedCount || 0) + (r2.modifiedCount || 0);
    if (n > 0) {
      console.log(`✅ Applied default lock settings on ${n} field update(s)`);
    }
  } catch (e) {
    console.warn('⚠️  Could not apply default app lock settings:', e.message);
  }

  const accounts = [
    { username: 'kareem198020121980@gmail.com', password: 'RAKHAV55HIAL.COMNANA' },
    { username: 'MOHAMED BEST RAKHA TWEAKS@GMAIL', password: 'MOHAMED 20121928189219' }
  ];

  for (const acc of accounts) {
    let user = await User.findOne(mongoose.trusted({
      username: { $regex: `^${escapeRegex(acc.username)}$`, $options: 'i' },
    })).select('+password');

    if (!user) {
      await User.create({
        username: acc.username,
        password: acc.password,
        role: 'admin',
        isVerified: true,
        isActive: true
      });
      console.log(`✅ Admin account created: ${acc.username}`);
      continue;
    }

    let changed = false;
    if (user.role !== 'admin') { user.role = 'admin'; changed = true; }
    if (!user.isVerified) { user.isVerified = true; changed = true; }
    if (!user.isActive) { user.isActive = true; changed = true; }
    const samePass = await user.comparePassword(acc.password);
    if (!samePass) {
      user.password = acc.password;
      changed = true;
    }
    if (user.failedLoginAttempts || user.lockUntil) {
      user.failedLoginAttempts = 0;
      user.lockUntil = undefined;
      changed = true;
    }

    if (changed) {
      await user.save();
      console.log(`✅ Admin account synced: ${acc.username}`);
    } else {
      console.log(`✅ Admin account ready: ${acc.username}`);
    }
  }
};

module.exports = { seedAdmin };
