#!/usr/bin/env node
/**
 * Diagnose Rakha Perm EXE app_config.h vs MongoDB app + license key.
 * Usage: node scripts/diagnose-perm-bind.js [license-key]
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { licenseMatchesTyped, revealLicense } = require('../utils/fieldCrypto');
const { appKidOf } = require('../utils/sdkGuards');

const APP_CONFIG = path.join(__dirname, '..', '..', 'Rakha Perm', 'Rakha Perm', 'auth', 'app_config.h');
const KEY_ARG = (process.argv[2] || 'Rakha-Perm-One-iBsg7f').trim();

const plainBlock32 = (src, name, seedHex) => {
  const re = new RegExp(`HiddenBytes<32, 0x${seedHex}> ${name}\\{([^}]+)\\}`, 's');
  const m = src.match(re);
  if (!m) throw new Error(`missing ${name}`);
  return Buffer.from(m[1].split(',').map((s) => parseInt(s.trim(), 16)));
};

(async () => {
  const Application = require('../models/Application');
  const LicenseKey = require('../models/LicenseKey');

  if (!fs.existsSync(APP_CONFIG)) {
    console.error('Missing:', APP_CONFIG);
    process.exit(1);
  }
  if (!process.env.MONGODB_URI) {
    console.error('Set MONGODB_URI in .env');
    process.exit(1);
  }

  const src = fs.readFileSync(APP_CONFIG, 'utf8');
  const kidRaw = plainBlock32(src, 'kKid', 'A31C9E47u');
  const secRaw = plainBlock32(src, 'kSec', '5D82F10Bu');
  const exeKid = kidRaw.toString('hex');
  const exeSecret = secRaw.toString('hex');

  await mongoose.connect(process.env.MONGODB_URI);
  const apps = await Application.find({ status: { $ne: 'deleted' } }).select('+appSecret name appId appKid minVersion version').lean();

  console.log('\n=== EXE bind (app_config.h) ===');
  console.log('appKid:', exeKid);
  console.log('appSecret:', `${exeSecret.slice(0, 8)}...${exeSecret.slice(-8)}`);

  let matchedApp = null;
  for (const app of apps) {
    const kidFromAppId = appKidOf(app.appId);
    const secretOk = String(app.appSecret || '').toLowerCase() === exeSecret.toLowerCase();
    const kidOk = String(app.appKid || '').toLowerCase() === exeKid.toLowerCase()
      || kidFromAppId.toLowerCase() === exeKid.toLowerCase();
    if (secretOk && kidOk) {
      matchedApp = app;
      break;
    }
  }

  if (!matchedApp) {
    console.log('\n❌ EXE credentials do NOT match any app in the database.');
    console.log('   Fix: rebind app_config.h from Dashboard → same app → correct secret.\n');
    console.log('Apps in DB:');
    for (const app of apps) {
      const kid = app.appKid || appKidOf(app.appId);
      const sec = String(app.appSecret || '').toLowerCase();
      console.log(` - ${app.name}`);
      console.log(`   appId=${app.appId}`);
      console.log(`   kid match=${kid.toLowerCase() === exeKid.toLowerCase()}`);
      console.log(`   secret match=${sec === exeSecret.toLowerCase()}`);
    }
  } else {
    const verM = src.match(/VMP_STR\("([^"]+)"\)/);
    const exeVer = verM ? verM[1] : '(unknown)';
    console.log('\n✅ EXE matches app:', matchedApp.name, `(${matchedApp.appId})`);
    console.log('minVersion:', matchedApp.minVersion || '(none)', '| EXE version:', exeVer);
    if (matchedApp.minVersion) {
      const { meetsMinVersion } = require('../utils/appVersion');
      if (!meetsMinVersion(exeVer, matchedApp.minVersion)) {
        console.log('⚠️  Version mismatch — set minVersion to', exeVer, 'or rebuild the EXE.');
      }
    }

    const keys = await LicenseKey.find({ app: matchedApp._id }).select('+keySealed +keyHash status boundUser').lean();
    let keyDoc = null;
    for (const k of keys) {
      if (licenseMatchesTyped(k, KEY_ARG)) { keyDoc = k; break; }
    }

    console.log('\n=== License:', KEY_ARG, '===');
    if (!keyDoc) {
      console.log('❌ Key NOT under this app.');
      console.log('   The key may belong to another application in the dashboard.');
    } else {
      console.log('✅ Key found | status:', keyDoc.status, '| used:', keyDoc.boundUser ? 'yes' : 'no');
    }
  }

  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
