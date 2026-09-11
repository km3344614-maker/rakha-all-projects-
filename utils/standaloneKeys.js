const fs = require('fs');
const path = require('path');
const https = require('https');

// Persistent storage location on Render (/data if mounted, else local directory)
const DATA_DIR = fs.existsSync('/data') ? '/data' : path.join(__dirname, '..');
const DB_FILE = path.join(DATA_DIR, 'keys_database.json');

// Initial seed keys if DB doesn\'t exist
const SEED_KEYS = {
  'RAKHA-LIFE-S7CE-FTF0': {
    key: 'RAKHA-LIFE-S7CE-FTF0',
    name: 'Rakha VIP Client',
    days: 'lifetime',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  'RAKHA-LIFE-BXLM-HRHW': {
    key: 'RAKHA-LIFE-BXLM-HRHW',
    name: 'Rakha VIP Client',
    days: 'lifetime',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z'
  },
  'RAKHA-VIP-PRO-2026': {
    key: 'RAKHA-VIP-PRO-2026',
    name: 'Rakha Owner / VIP',
    days: 'lifetime',
    status: 'active',
    createdAt: '2026-01-01T00:00:00.000Z'
  }
};

function readDb() {
  try {
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf8');
      const parsed = JSON.parse(content);
      if (parsed && typeof parsed.keys === 'object') {
        return parsed;
      }
    }
  } catch (e) {
    console.warn('[StandaloneKeys] Read error:', e.message);
  }
  return { keys: { ...SEED_KEYS } };
}

function writeDb(data) {
  try {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf8');
  } catch (e) {
    console.error('[StandaloneKeys] Write error:', e.message);
  }
}

function getAllKeys() {
  const db = readDb();
  return Object.values(db.keys || {});
}

function getKey(rawKey) {
  if (!rawKey) return null;
  const db = readDb();
  const clean = String(rawKey).trim().toUpperCase();
  return db.keys[clean] || db.keys[rawKey.trim()] || null;
}

function saveKey(keyData) {
  if (!keyData || !keyData.key) return null;
  const db = readDb();
  const cleanKey = String(keyData.key).trim().toUpperCase();
  const isLife = String(keyData.days || keyData.duration).toLowerCase().includes('life') || keyData.days === 0 || keyData.duration === 0;

  const record = {
    _id: keyData._id || cleanKey,
    key: cleanKey,
    name: keyData.clientName || keyData.name || 'Rakha Client',
    clientName: keyData.clientName || keyData.name || 'Rakha Client',
    days: isLife ? 'lifetime' : String(keyData.days || keyData.duration || 30),
    duration: isLife ? 0 : Number(keyData.days || keyData.duration || 30),
    userId: keyData.userId || keyData.discordUserId || '',
    discordUserId: keyData.userId || keyData.discordUserId || '',
    customAvatar: keyData.customAvatar || null,
    status: keyData.status || 'active',
    createdAt: keyData.createdAt || new Date().toISOString(),
    activatedAt: keyData.activatedAt || null,
    hwid: keyData.hwid || null,
    generatedBy: keyData.generatedBy || 'Dashboard'
  };

  db.keys[cleanKey] = record;
  writeDb(db);

  // Sync to 509 Cloud Bot
  syncKeyTo509Bot(record).catch(() => {});

  return record;
}

function updateKey(rawKey, updates) {
  if (!rawKey) return null;
  const db = readDb();
  const cleanKey = String(rawKey).trim().toUpperCase();
  if (!db.keys[cleanKey]) return null;

  Object.assign(db.keys[cleanKey], updates);
  writeDb(db);

  // Sync to 509 Cloud Bot
  syncKeyTo509Bot(db.keys[cleanKey]).catch(() => {});
  return db.keys[cleanKey];
}

function deleteKey(rawKey) {
  if (!rawKey) return false;
  const db = readDb();
  const cleanKey = String(rawKey).trim().toUpperCase();
  if (db.keys[cleanKey]) {
    delete db.keys[cleanKey];
    writeDb(db);
    deleteKeyFrom509Bot(cleanKey).catch(() => {});
    return true;
  }
  return false;
}

// Forward to 509 Cloud bot
function syncKeyTo509Bot(record) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify(record);
      const req = https.request({
        hostname: 'rakha-bots-unified.509.rip',
        path: '/api/sync-key',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 4000
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.write(payload);
      req.end();
    } catch {
      resolve(false);
    }
  });
}

function deleteKeyFrom509Bot(cleanKey) {
  return new Promise((resolve) => {
    try {
      const payload = JSON.stringify({ key: cleanKey });
      const req = https.request({
        hostname: 'rakha-bots-unified.509.rip',
        path: '/api/sync-delete-key',
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        },
        timeout: 4000
      }, (res) => {
        resolve(res.statusCode === 200);
      });
      req.on('error', () => resolve(false));
      req.write(payload);
      req.end();
    } catch {
      resolve(false);
    }
  });
}

module.exports = {
  getAllKeys,
  getKey,
  saveKey,
  updateKey,
  deleteKey,
  syncKeyTo509Bot,
  deleteKeyFrom509Bot
};

