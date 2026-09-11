#!/usr/bin/env node
/**
 * Rakha Auth — Backup Script
 * ─────────────────────────────
 * Usage:
 *   node scripts/backup.js              → creates timestamped JSON backup
 *   node scripts/backup.js --keep 7    → keeps last 7 backups (default: 14)
 *   node scripts/backup.js --out ./my_backups
 *
 * Schedule with cron (daily at 3 AM):
 *   0 3 * * * node /path/to/scripts/backup.js --keep 30 >> /var/log/rakha-backup.log 2>&1
 */

require('dotenv').config({ path: require('path').join(__dirname, '..', '.env') });

const mongoose  = require('mongoose');
const fs        = require('fs');
const fsp       = require('fs/promises');
const path      = require('path');
const zlib      = require('zlib');

// ── CLI args ─────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const getArg = (flag, fallback) => {
  const i = args.indexOf(flag);
  return i !== -1 && args[i + 1] ? args[i + 1] : fallback;
};
const KEEP    = Math.max(1, parseInt(getArg('--keep', '14'), 10));
const OUT_DIR = path.resolve(getArg('--out', path.join(__dirname, '..', 'backups')));

// ── Collections to back up (model paths relative to this script) ─────────────
const MODELS = [
  { name: 'applications', path: '../models/Application' },
  { name: 'licensekeys',  path: '../models/LicenseKey'  },
  { name: 'appusers',     path: '../models/AppUser'      },
  { name: 'variables',    path: '../models/Variable'     },
  { name: 'appfiles_meta',path: '../models/AppFile'      }, // metadata only, not blobs
  { name: 'logs',         path: '../models/Log'          },
];

const pad = (n) => String(n).padStart(2, '0');

async function run() {
  const uri = process.env.MONGODB_URI;
  if (!uri) {
    console.error('❌  MONGODB_URI not set in .env');
    process.exit(1);
  }

  console.log('🔌  Connecting to MongoDB…');
  await mongoose.connect(uri, { serverSelectionTimeoutMS: 10000 });
  console.log('✅  Connected');

  // ── Prepare output directory ────────────────────────────────────────────────
  await fsp.mkdir(OUT_DIR, { recursive: true });

  const now = new Date();
  const stamp = [
    now.getFullYear(),
    pad(now.getMonth() + 1),
    pad(now.getDate()),
    pad(now.getHours()),
    pad(now.getMinutes()),
    pad(now.getSeconds()),
  ].join('');
  const filename = `rakha-backup-${stamp}.json.gz`;
  const fullPath = path.join(OUT_DIR, filename);

  // ── Dump each collection ────────────────────────────────────────────────────
  const backup = {
    meta: {
      createdAt: now.toISOString(),
      version: '1',
      collections: [],
    },
    data: {},
  };

  for (const { name, path: modelPath } of MODELS) {
    try {
      const Model = require(modelPath);
      // Use lean() for raw BSON objects; select all fields including hidden ones
      // (except password hashes for security)
      const docs = await Model.find({})
        .select(name === 'appusers'
          ? '-password -sessionTokenHash -sessionTokenHashes'
          : name === 'applications'
            ? '+appSecret'
            : '')
        .lean();
      backup.data[name] = docs;
      backup.meta.collections.push({ name, count: docs.length });
      console.log(`  📦  ${name}: ${docs.length} document(s)`);
    } catch (e) {
      console.warn(`  ⚠️   ${name}: skipped (${e.message})`);
      backup.data[name] = [];
      backup.meta.collections.push({ name, count: 0, error: e.message });
    }
  }

  // ── Write compressed JSON ───────────────────────────────────────────────────
  const json   = JSON.stringify(backup, null, 2);
  const gzData = zlib.gzipSync(Buffer.from(json, 'utf8'));
  await fsp.writeFile(fullPath, gzData);

  const sizeMb = (gzData.length / 1048576).toFixed(2);
  console.log(`\n✅  Backup saved: ${fullPath} (${sizeMb} MB)`);

  // ── Rotate old backups (keep last N) ────────────────────────────────────────
  const files = (await fsp.readdir(OUT_DIR))
    .filter(f => f.startsWith('rakha-backup-') && f.endsWith('.json.gz'))
    .sort(); // ISO-ish names sort chronologically

  if (files.length > KEEP) {
    const toDelete = files.slice(0, files.length - KEEP);
    for (const f of toDelete) {
      await fsp.unlink(path.join(OUT_DIR, f));
      console.log(`  🗑️   Removed old backup: ${f}`);
    }
  }

  console.log(`\n📊  Summary:`);
  console.log(`    Backups kept : ${Math.min(files.length, KEEP)}`);
  console.log(`    Location     : ${OUT_DIR}`);
  console.log(`    Timestamp    : ${now.toISOString()}`);

  await mongoose.disconnect();
  console.log('\n🎉  Done.');
}

run().catch(err => {
  console.error('❌  Backup failed:', err.message);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});
