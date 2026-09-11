#!/usr/bin/env node
/**
 * Sync MongoDB app secret with the value embedded in Rakha Perm EXE.
 * Usage: node scripts/sync-app-secret.js <64-hex-secret>
 */
require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('../models/Application');
const AppUser = require('../models/AppUser');
const { killAllAppSessions } = require('../utils/sdkGuards');
const { peek } = require('../utils/fieldCrypto');

const secret = String(process.argv[2] || process.env.SYNC_APP_SECRET || '').trim().toLowerCase();
if (!/^[0-9a-f]{64}$/.test(secret)) {
  console.error('Provide 64-char hex app secret as argument.');
  process.exit(1);
}

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI required');
  await mongoose.connect(process.env.MONGODB_URI);

  const app = await Application.findOne({ status: { $ne: 'deleted' } })
    .sort('-createdAt')
    .select('+appSecret name appId');
  if (!app) throw new Error('No application found');

  const before = peek(app.appSecret) || String(app.appSecret || '');
  if (before.toLowerCase() === secret) {
    console.log(`App "${app.name}" secret already matches. No change needed.`);
    await mongoose.disconnect();
    return;
  }

  app.appSecret = secret;
  await app.save();
  await killAllAppSessions(AppUser, app._id);

  console.log(`Updated app "${app.name}" (${app.appId}) secret and revoked active SDK sessions.`);
  console.log('Redeploy/restart the server if it caches credentials.');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
