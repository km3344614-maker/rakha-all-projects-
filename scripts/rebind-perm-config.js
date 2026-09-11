#!/usr/bin/env node
/**
 * Rebind Rakha Perm app_config.h kSec/kKid from MongoDB.
 * Does not print secrets to stdout.
 * Usage: node scripts/rebind-perm-config.js
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const { appKidOf } = require('../utils/sdkGuards');

const APP_CONFIG = path.join(__dirname, '..', '..', 'Rakha Perm', 'Rakha Perm', 'auth', 'app_config.h');

const fmtBytes = (buf) => {
  const lines = [];
  for (let i = 0; i < buf.length; i += 8) {
    const chunk = buf.slice(i, i + 8);
    lines.push('        ' + Array.from(chunk).map((b) => `0x${b.toString(16).padStart(2, '0')}`).join(', ') + (i + 8 < buf.length ? ',' : ''));
  }
  return lines.join('\n');
};

const replaceBlock = (src, name, seed, buf) => {
  const re = new RegExp(
    `(static constexpr HiddenBytes<32, 0x${seed}> ${name}\\{)[\\s\\S]*?(\\};)`,
    'm'
  );
  if (!re.test(src)) throw new Error(`block ${name} not found`);
  const body = fmtBytes(buf);
  return src.replace(re, `$1\n${body}\n    $2`);
};

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI required');
  if (!fs.existsSync(APP_CONFIG)) throw new Error(`missing ${APP_CONFIG}`);

  const Application = require('../models/Application');
  await mongoose.connect(process.env.MONGODB_URI);
  const app = await Application.findOne({ status: { $ne: 'deleted' } })
    .sort('-createdAt')
    .select('+appSecret appId appKid name');
  if (!app?.appSecret) throw new Error('no app with secret');

  const secretBuf = Buffer.from(String(app.appSecret), 'hex');
  const kidHex = app.appKid || appKidOf(app.appId);
  const kidBuf = Buffer.from(kidHex, 'hex');
  if (secretBuf.length !== 32 || kidBuf.length !== 32) throw new Error('invalid kid/secret length');

  let src = fs.readFileSync(APP_CONFIG, 'utf8');
  src = replaceBlock(src, 'kKid', 'A31C9E47u', kidBuf);
  src = replaceBlock(src, 'kSec', '5D82F10Bu', secretBuf);
  fs.writeFileSync(APP_CONFIG, src, 'utf8');

  console.log(`Updated app_config.h for app "${app.name}" (${app.appId}). Rebuild Rakha Perm.`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
