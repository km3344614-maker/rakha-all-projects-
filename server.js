require('dotenv').config();
const express = require('express');
const mongoose = require('mongoose');
const cors = require('cors');
const rateLimit = require('express-rate-limit');
const path = require('path');
const fs = require('fs');
const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const { seedAdmin } = require('./utils/seedAdmin');
const { assertSecurityConfig, rateLimitKey, jsonReviver, stripMongoOperators, warmDummyPasswordHashes } = require('./utils/security');
const { dashboardTransport, getSpkiB64 } = require('./utils/dashboardCrypto');
const AppUser = require('./models/AppUser');

const app = express();
app.set('query parser', 'simple');

const trustProxyEnv = (process.env.TRUST_PROXY || '').trim().toLowerCase();
if (trustProxyEnv === 'true' || trustProxyEnv === '1') {
  app.set('trust proxy', 1);
} else if (trustProxyEnv && Number.isFinite(Number(trustProxyEnv))) {
  app.set('trust proxy', Number(trustProxyEnv));
}
app.disable('x-powered-by');

assertSecurityConfig();

app.use(helmet({
  contentSecurityPolicy: {
    useDefaults: true,
    directives: {
      'default-src': ["'self'"],
      'script-src': ["'self'", "'unsafe-inline'"],
      'style-src': ["'self'", 'https://fonts.googleapis.com', "'unsafe-inline'"],
      'style-src-attr': ["'unsafe-inline'"],
      'font-src': ["'self'", 'https://fonts.gstatic.com', 'data:'],
      'img-src': ["'self'", 'data:', 'blob:', 'https:'],
      'connect-src': ["'self'", 'https:', 'http:', 'ws:', 'wss:'],
      'worker-src': ["'self'", 'blob:'],
      'frame-ancestors': ["'none'"],
      'base-uri': ["'self'"],
      'form-action': ["'self'"],
      'object-src': ["'none'"],
    }
  },
  crossOriginEmbedderPolicy: false,
  referrerPolicy: { policy: 'no-referrer' },
  permittedCrossDomainPolicies: { permittedPolicies: 'none' },
}));

app.use((req, res, next) => {
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=(), payment=(), usb=()');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-DNS-Prefetch-Control', 'off');
  next();
});

const { PUBLIC_APP_URL, resolvePublicAppUrl } = require('./utils/publicUrl');
const allowedOrigins = new Set(
  [
    resolvePublicAppUrl(process.env.APP_URL),
    PUBLIC_APP_URL,
    'https://auth.rakha.me',
    'http://auth.rakha.me'
  ].filter(Boolean)
);
for (const origin of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:5050', 'http://127.0.0.1:5050']) {
  allowedOrigins.add(origin);
}

app.use(cors({
  origin: (origin, cb) => {
    if (!origin) return cb(null, true);
    if (allowedOrigins.has(origin)) return cb(null, true);
    try {
      const u = new URL(origin);
      const h = u.hostname.toLowerCase();
      if (
        h === 'rakha.me' ||
        h.endsWith('.rakha.me') ||
        h === 'onrender.com' ||
        h.endsWith('.onrender.com') ||
        h === 'localhost' ||
        h === '127.0.0.1'
      ) {
        return cb(null, true);
      }
    } catch (_) {}
    return cb(null, true);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type', 'Authorization', 'x-sa-ek',
    'x-rakha-signature', 'x-rakha-timestamp', 'x-rakha-nonce',
    'x-rakha-version', 'x-rakha-enc', 'x-rakha-auth',
    'x-rakha-session', 'x-rakha-k', 'x-rakha-kid',
    'appid', 'appsecret', 'x-app-id', 'x-rakha-appid',
  ],
  exposedHeaders: ['x-rakha-time', 'x-rakha-proof']
}));

const sdkJsonPaths = (url = '') => (
  url.startsWith('/api/sdk')
  || url.startsWith('/api/q')
  || url.startsWith('/api/handshake')
  || url.startsWith('/api/verify')
);

app.use((req, res, next) => {
  const sdkGate = sdkJsonPaths(req.originalUrl || '');
  express.json({
    limit: '50mb',
    reviver: jsonReviver,
    verify: (innerReq, _res, buf) => {
      if (sdkJsonPaths(innerReq.originalUrl || '')) {
        innerReq.rawBody = buf.toString('utf8');
      }
    },
  })(req, res, next);
});
app.use(express.urlencoded({ extended: true, limit: '50mb' }));
app.use(mongoSanitize({ replaceWith: '_' }));
app.use((req, _res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = stripMongoOperators(req.body);
  }
  next();
});

const sdkClientPath = (path = '') => {
  const p = String(path || '');
  return p === '/q' || p === '/d'
    || p.startsWith('/sdk')
    || p === '/handshake' || p === '/verify'
    || p.startsWith('/bot')
    || p.startsWith('/local-')
    || p.startsWith('/app-verify-key')
    || p.startsWith('/submit-review')
    || p.startsWith('/sync-bot-key')
    || p.startsWith('/all-keys')
    || p.startsWith('/health');
};

app.use('/api', (req, res, next) => {
  if (sdkClientPath(req.path)) return next();
  if (
    process.env.NODE_ENV === 'production'
    && !req.headers.origin
    && !['GET', 'HEAD', 'OPTIONS'].includes(req.method)
    && req.path !== '/health'
  ) {
    return res.status(403).json({ success: false, message: 'Origin required' });
  }
  next();
});

// Temporary: set true to restore rate limits.
const RATE_LIMITS_ENABLED = true;

const limitBase = {
  standardHeaders: false,
  legacyHeaders: false,
  validate: { xForwardedForHeader: false },
  keyGenerator: (req) => rateLimitKey(req),
  skip: () => !RATE_LIMITS_ENABLED,
};

const limiter = rateLimit({
  ...limitBase,
  windowMs: 15 * 60 * 1000,
  max: 350,
  message: { success: false, message: 'Too many requests, please try again later' },
  skip: (req) => !RATE_LIMITS_ENABLED || req.path === '/health' || req.path === '/api/health',
});

const authLimiter = rateLimit({
  ...limitBase,
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many auth attempts' }
});

const sdkLimiter = rateLimit({
  ...limitBase,
  windowMs: 60 * 1000,
  max: 80,
  message: { success: false, message: 'Too many SDK requests' }
});

const sdkAuthLimiter = rateLimit({
  ...limitBase,
  windowMs: 60 * 1000,
  max: 10,
  message: { success: false, message: 'Too many SDK auth attempts' }
});

const sdkFileLimiter = rateLimit({
  ...limitBase,
  windowMs: 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many file requests' }
});

const sdkAppKey = (req) => {
  const ip = rateLimitKey(req);
  const id = String(
    req.headers['x-rakha-k']
    || req.headers['x-rakha-kid']
    || req.headers['x-rakha-appid']
    || req.headers['x-app-id']
    || req.headers.appid
    || ''
  ).trim().toLowerCase().slice(0, 64);
  return id ? `${ip}:${id}` : ip;
};

const sdkAppLimiter = rateLimit({
  ...limitBase,
  windowMs: 60 * 1000,
  max: 150,
  message: { success: false, message: 'Too many SDK requests' },
  keyGenerator: sdkAppKey,
});

const sdkAppAuthLimiter = rateLimit({
  ...limitBase,
  windowMs: 60 * 1000,
  max: 20,
  message: { success: false, message: 'Too many SDK auth attempts' },
  keyGenerator: sdkAppKey,
});

const botLimiter = rateLimit({
  ...limitBase,
  windowMs: 15 * 60 * 1000,
  max: 30,
  message: { success: false, message: 'Too many bot requests' }
});

app.get('/api/health', (req, res) => {
  const ok = mongoose.connection.readyState === 1;
  if (!ok) return res.status(503).json({ ok: false });
  res.json({ ok: true });
});

app.use('/api/', limiter);
app.use('/api/auth/login', authLimiter);
app.use('/api/auth/password', authLimiter);
app.all('/api/auth/crypto', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});
app.use('/api/sdk/login', sdkAuthLimiter);
app.use('/api/sdk/login', sdkAppAuthLimiter);
app.use('/api/sdk/handshake', sdkAuthLimiter);
app.use('/api/sdk/handshake', sdkAppAuthLimiter);
app.use('/api/sdk/verify', sdkAuthLimiter);
app.use('/api/sdk/verify', sdkAppAuthLimiter);
app.use('/api/sdk/files', sdkFileLimiter);
app.use('/api/sdk/', sdkAppLimiter);
app.use('/api/sdk/', sdkLimiter);
app.use('/api/bot/', botLimiter);

const allowSdkPathAliases = () => process.env.ALLOW_LEGACY_SDK === 'true';
const hideNamedSdkRoutes = () => process.env.ALLOW_LEGACY_SDK === 'false';

// Local disk database endpoints for bot & dashboard synchronization
const ALL_BOT_DB_PATHS = [
  'G:\\V2\\SYSTEM & TICKET & REVIEWS & DILV\\RAKHA BOTS (REVIEWS & KEY GEN)\\BOTH\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHA BOTS (REVIEWS & KEY GEN)\\BOTH\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHA BOTS (REVIEWS & KEY GEN)\\KEY GENERATOR BOT\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\LUNCH\\key-gen-bot\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\SOURCE\\RAKHA DILV BOT (DONE)\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA DILV BOT\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA AUTH\\bot\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA AUTH & TWEAKS APP ON RENDER HOST\\bot\\database.json',
  path.resolve(__dirname, 'key-gen-bot/database.json'),
  path.resolve(__dirname, 'bot/database.json'),
  'C:\\Users\\RAKHA\\Desktop\\حمايه رخا\\حمايه رخا\\Rakha Auth\\bot\\database.json'
];

app.post('/api/app-verify-key', async (req, res) => {
  try {
    const rawKey = String(req.body?.key || '').trim();
    const key = rawKey.toUpperCase();
    const hwid = String(req.body?.hwid || '').trim();
    if (!rawKey) return res.status(400).json({ success: false, message: 'Key is required' });

    // 1. Admin VIP keys
    if (['RAKHA-VIP', 'RAKHA-SERVICES-ADMIN', 'RAKHA-VIP-ADMIN-2026'].includes(key)) {
      return res.json({
        success: true,
        key: rawKey,
        type: 'Lifetime Admin VIP',
        isLifetime: true,
        clientName: 'Rakha Owner / VIP',
        customAvatar: null,
        avatar: null,
        message: 'Admin VIP Activated!'
      });
    }

    // 2. Check MongoDB LicenseKey
    try {
      const LicenseKey = require('./models/LicenseKey');
      const { keyHashVariants, packLicense } = require('./utils/fieldCrypto');
      const hashes = keyHashVariants(rawKey);
      if (key !== rawKey) hashes.push(...keyHashVariants(key));
      let doc = await LicenseKey.findOne({ keyHash: { $in: hashes } });
      if (!doc) {
        doc = await LicenseKey.findOne({ key: rawKey }).select('+key');
      }
      if (!doc && key !== rawKey) {
        doc = await LicenseKey.findOne({ key }).select('+key');
      }

      if (doc) {
        if (doc.status === 'banned') {
          return res.status(403).json({ success: false, status: 'banned', message: '🚫 YOUR LICENSE HAS BEEN BANNED BY RAKHA SERVICES' });
        }
        if (doc.status === 'paused') {
          return res.status(403).json({ success: false, status: 'paused', message: '⏸️ This license is currently paused' });
        }
        if (doc.status === 'expired' || (doc.expireDate && new Date(doc.expireDate) < new Date())) {
          return res.status(403).json({ success: false, status: 'expired', message: '⏳ This license has expired' });
        }
        if (doc.hwid && hwid && doc.hwid !== hwid) {
          return res.status(403).json({ success: false, status: 'hwid_mismatch', message: '🚫 License locked to another PC' });
        }
        if (!doc.hwid && hwid) {
          doc.hwid = hwid;
          doc.activatedAt = new Date();
          if (doc.status === 'unused') doc.status = 'active';
          await doc.save();
        }
        const isLifetime = doc.duration === 0;
        return res.json({
          success: true,
          key: rawKey,
          type: isLifetime ? 'Lifetime VIP' : `${doc.duration} Days License`,
          isLifetime,
          clientName: doc.clientName || 'Rakha Client',
          customAvatar: doc.customAvatar || null,
          avatar: doc.customAvatar || null,
          discordUserId: doc.discordUserId || '',
          message: 'Key verified successfully!'
        });
      }
    } catch (dbErr) {
      console.error('DB verify error:', dbErr.message);
    }

    // 3. Check standalone persistent keys
    try {
      const standaloneKeys = require('./utils/standaloneKeys');
      const sRec = standaloneKeys.getKey(key) || standaloneKeys.getKey(rawKey);
      if (sRec) {
        if (sRec.status === 'disabled' || sRec.status === 'banned') {
          return res.status(403).json({ success: false, status: 'banned', message: '🚫 License banned by Rakha Services' });
        }
        if (sRec.status === 'paused') {
          return res.status(403).json({ success: false, status: 'paused', message: '⏸️ License currently paused' });
        }
        if (sRec.hwid && hwid && sRec.hwid !== hwid) {
          return res.status(403).json({ success: false, status: 'hwid_mismatch', message: '🚫 License locked to another PC' });
        }
        if (!sRec.hwid && hwid) {
          sRec.hwid = hwid;
          standaloneKeys.saveKey(sRec);
        }
        const isLife = String(sRec.days).toLowerCase().includes('life') || sRec.days === '0' || sRec.days === 0;
        return res.json({
          success: true,
          key: rawKey,
          type: isLife ? 'Lifetime VIP' : `${sRec.days || 30} Days License`,
          isLifetime: isLife,
          clientName: sRec.name || sRec.clientName || 'Rakha Client',
          customAvatar: sRec.customAvatar || null,
          avatar: sRec.customAvatar || null,
          discordUserId: sRec.userId || sRec.discordUserId || '',
          message: 'Key verified successfully!'
        });
      }
    } catch (sErr) {}

    // 4. Check bot database.json files on disk
    for (const p of ALL_BOT_DB_PATHS) {
      if (fs.existsSync(p)) {
        try {
          const parsed = JSON.parse(fs.readFileSync(p, 'utf8'));
          if (parsed?.keys && (parsed.keys[key] || parsed.keys[rawKey])) {
            const bRec = parsed.keys[key] || parsed.keys[rawKey];
            if (bRec.status === 'disabled' || bRec.status === 'banned') {
              return res.status(403).json({ success: false, status: 'banned', message: '🚫 License banned by Rakha Services' });
            }
            if (bRec.status === 'paused') {
              return res.status(403).json({ success: false, status: 'paused', message: '⏸️ License currently paused' });
            }
            if (bRec.hwid && hwid && bRec.hwid !== hwid) {
              return res.status(403).json({ success: false, status: 'hwid_mismatch', message: '🚫 License locked to another PC' });
            }
            const isLife = String(bRec.days).toLowerCase().includes('life') || bRec.days === '0' || bRec.days === 0;
            return res.json({
              success: true,
              key: rawKey,
              type: isLife ? 'Lifetime VIP' : `${bRec.days || 30} Days License`,
              isLifetime: isLife,
              clientName: bRec.name || 'Rakha Client',
              customAvatar: bRec.customAvatar || null,
              avatar: bRec.customAvatar || null,
              discordUserId: bRec.userId || '',
              message: 'Key verified successfully!'
            });
          }
        } catch (e) {}
      }
    }

    // 5. Query 509 Cloud Unified Bot API
    try {
      const https = require('https');
      const check509 = await new Promise((resolve) => {
        const postPayload = JSON.stringify({ key: rawKey, hwid });
        const botReq = https.request({
          hostname: 'rakha-bots-unified.509.rip',
          path: '/api/app-verify-key',
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postPayload)
          },
          timeout: 4000
        }, (botRes) => {
          let buf = '';
          botRes.on('data', c => buf += c);
          botRes.on('end', () => {
            try {
              const parsed = JSON.parse(buf);
              parsed._statusCode = botRes.statusCode;
              resolve(parsed);
            } catch {
              resolve(null);
            }
          });
        });
        botReq.on('error', () => resolve(null));
        botReq.on('timeout', () => { botReq.destroy(); resolve(null); });
        botReq.write(postPayload);
        botReq.end();
      });

      if (check509 && check509.success) {
        try {
          const standaloneKeys = require('./utils/standaloneKeys');
          standaloneKeys.saveKey(check509);
        } catch (e) {}
        return res.json(check509);
      } else if (check509 && (check509.status === 'banned' || check509.status === 'paused')) {
        return res.status(403).json(check509);
      }
    } catch (e) {}

    return res.status(404).json({ success: false, status: 'not_found', message: '❌ Invalid license key or key was deleted!' });
  } catch (err) {
    return res.status(500).json({ success: false, message: err.message });
  }
});

// Sync bot key to Render persistent storage
app.post('/api/sync-bot-key', (req, res) => {
  try {
    const standaloneKeys = require('./utils/standaloneKeys');
    const saved = standaloneKeys.saveKey(req.body);
    return res.json({ success: true, key: saved });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// All keys for bot sync
app.get('/api/all-keys', (req, res) => {
  try {
    const standaloneKeys = require('./utils/standaloneKeys');
    return res.json({ success: true, keys: standaloneKeys.getAllKeys() });
  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/local-keys', (req, res) => {
  try {
    const standaloneKeys = require('./utils/standaloneKeys');
    const all = standaloneKeys.getAllKeys();
    let keys = {};
    for (const k of all) {
      if (k && k.key) keys[k.key] = k;
    }
    for (const p of ALL_BOT_DB_PATHS) {
      if (fs.existsSync(p)) {
        try {
          const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
          if (db.keys) {
            keys = { ...db.keys, ...keys };
          }
        } catch (e) {}
      }
    }
    return res.json({ success: true, keys });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/local-sync-key', (req, res) => {
  try {
    const data = req.body || {};
    if (!data.key) return res.status(400).json({ error: 'Key is required' });
    const cleanKey = String(data.key).trim().toUpperCase();
    const isLifetime = String(data.days || data.duration).toLowerCase().includes('life') || data.duration === 0 || data.duration === '0';
    const finalDays = isLifetime ? 'lifetime' : String(data.days || data.duration || 30);
    const clientName = data.clientName || data.name || 'Rakha Client';
    const targetUserId = String(data.discordUserId || data.userId || '').trim();

    // 1. Save to Standalone Persistent Keys
    const standaloneKeys = require('./utils/standaloneKeys');
    const saved = standaloneKeys.saveKey({
      key: cleanKey,
      clientName: clientName,
      name: clientName,
      days: finalDays,
      duration: isLifetime ? 0 : Number(finalDays) || 30,
      userId: targetUserId,
      discordUserId: targetUserId,
      customAvatar: data.customAvatar || null,
      status: data.status || 'active',
      createdAt: data.createdAt || new Date().toISOString(),
      hwid: data.hwid || null,
      generatedBy: data.generatedBy || 'Dashboard'
    });

    // 2. Save to local disk paths if they exist
    for (const p of ALL_BOT_DB_PATHS) {
      try {
        let db = { keys: {} };
        if (fs.existsSync(p)) {
          const raw = fs.readFileSync(p, 'utf8').replace(/^\uFEFF/, '');
          db = JSON.parse(raw) || { keys: {} };
        }
        if (!db.keys) db.keys = {};
        db.keys[cleanKey] = {
          key: cleanKey,
          name: clientName,
          days: finalDays,
          customAvatar: data.customAvatar || null,
          userId: targetUserId,
          status: 'active',
          createdAt: data.createdAt || new Date().toISOString(),
          activatedAt: null,
          hwid: null,
          generatedBy: 'dashboard'
        };
        fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
      } catch (err) {}
    }

    // 3. Deliver DM if Discord User ID provided
    if (targetUserId) {
      const cleanId = targetUserId.replace(/[^0-9]/g, '');
      if (cleanId.length >= 16) {
        try {
          const https = require('https');
          const payload = JSON.stringify({
            userId: cleanId,
            key: cleanKey,
            days: finalDays,
            clientName: clientName
          });
          const botReq = https.request({
            hostname: 'rakha-bots-unified.509.rip',
            path: '/api/deliver-key',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(payload)
            },
            timeout: 5000
          });
          botReq.on('error', (e) => {
            console.warn('⚠️ [DM Notification] Bot delivery error:', e.message);
          });
          botReq.write(payload);
          botReq.end();
        } catch (e) {}
      }
    }

    return res.json({ success: true, message: 'Key saved and synced successfully', key: cleanKey, data: saved });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/local-delete-key', (req, res) => {
  try {
    const { key, keys } = req.body || {};
    const keysToDelete = keys || (key ? [key] : []);
    const standaloneKeys = require('./utils/standaloneKeys');
    keysToDelete.forEach(k => {
      const clean = String(k).trim().toUpperCase();
      standaloneKeys.deleteKey(clean);
      standaloneKeys.deleteKeyFrom509Bot(clean).catch(() => {});
    });
    for (const p of ALL_BOT_DB_PATHS) {
      if (fs.existsSync(p)) {
        try {
          const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
          if (db.keys) {
            keysToDelete.forEach(k => delete db.keys[k]);
            fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
          }
        } catch (e) {}
      }
    }
    return res.json({ success: true, deleted: keysToDelete.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/local-ban-key', (req, res) => {
  try {
    const { key, reason, status } = req.body || {};
    const targetStatus = status || 'banned';
    const cleanKey = String(key || '').trim().toUpperCase();
    const standaloneKeys = require('./utils/standaloneKeys');
    standaloneKeys.updateKey(cleanKey, { status: targetStatus, banReason: reason || 'Banned' });
    standaloneKeys.syncKeyTo509Bot({ key: cleanKey, status: targetStatus, banReason: reason }).catch(() => {});

    for (const p of ALL_BOT_DB_PATHS) {
      if (fs.existsSync(p)) {
        try {
          const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
          if (db.keys && db.keys[cleanKey]) {
            db.keys[cleanKey].status = targetStatus;
            if (reason) db.keys[cleanKey].banReason = reason;
            db.keys[cleanKey].bannedAt = new Date().toISOString();
            fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
          }
        } catch (e) {}
      }
    }
    return res.json({ success: true, message: 'Key banned successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.post('/api/local-update-key', (req, res) => {
  try {
    const { key, updates } = req.body || {};
    const cleanKey = String(key || '').trim().toUpperCase();
    const standaloneKeys = require('./utils/standaloneKeys');
    standaloneKeys.updateKey(cleanKey, updates);
    standaloneKeys.syncKeyTo509Bot({ key: cleanKey, ...updates }).catch(() => {});

    for (const p of ALL_BOT_DB_PATHS) {
      if (fs.existsSync(p)) {
        try {
          const db = JSON.parse(fs.readFileSync(p, 'utf8')) || {};
          if (db.keys && db.keys[cleanKey]) {
            Object.assign(db.keys[cleanKey], updates || {});
            fs.writeFileSync(p, JSON.stringify(db, null, 2), 'utf8');
          }
        } catch (e) {}
      }
    }
    return res.json({ success: true, message: 'Key updated successfully' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

app.use('/api/auth', dashboardTransport);
app.use('/api/apps', dashboardTransport);
app.use('/api/auth', require('./routes/auth'));
app.use('/api/apps', require('./routes/apps'));
app.use('/api/apps/:appId/keys', require('./routes/keys'));
app.use('/api/apps/:appId/users', require('./routes/users'));
app.use('/api/apps/:appId/files', require('./routes/files'));
app.use('/api/apps/:appId/variables', require('./routes/variables'));
app.use('/api/apps/:appId/logs', require('./routes/logs'));
const sdkRouter = require('./routes/sdk');
if (allowSdkPathAliases()) {
  app.use('/api/handshake', sdkAuthLimiter);
  app.use('/api/handshake', sdkAppAuthLimiter);
  app.use('/api/handshake', (req, res, next) => {
    req.url = '/handshake';
    sdkRouter(req, res, next);
  });
  app.use('/api/verify', sdkAuthLimiter);
  app.use('/api/verify', sdkAppAuthLimiter);
  app.use('/api/verify', (req, res, next) => {
    req.url = '/verify';
    sdkRouter(req, res, next);
  });
}
app.use('/api/q', sdkAppLimiter);
app.use('/api/q', sdkLimiter);
app.use('/api/q', (req, res, next) => {
  req.url = '/q';
  sdkRouter(req, res, next);
});
app.use('/api/d', sdkFileLimiter);
app.use('/api/d', (req, res, next) => {
  req.url = '/files/download' + (req.url === '/' ? '' : req.url);
  sdkRouter(req, res, next);
});
app.use('/api/sdk', (req, res, next) => {
  if (!hideNamedSdkRoutes()) return next();
  const p = String(req.path || '').split('?')[0];
  if (p === '/q' || p.startsWith('/files/download')) return next();
  return res.status(404).json({ success: false, message: 'Not found' });
});
app.use('/api/sdk', sdkRouter);
app.use('/api/bot', require('./routes/bot'));

const uploadsDir = process.env.UPLOADS_DIR
  ? path.resolve(process.env.UPLOADS_DIR)
  : path.join(__dirname, 'uploads');
const uploadMimeByExt = {
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
};
app.use('/uploads', express.static(uploadsDir, {
  maxAge: '7d',
  setHeaders: (res, filePath) => {
    const ext = path.extname(filePath).toLowerCase();
    const mime = uploadMimeByExt[ext];
    if (!mime) {
      res.setHeader('Content-Disposition', 'attachment');
      return;
    }
    res.setHeader('Content-Type', mime);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cross-Origin-Resource-Policy', 'same-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; sandbox");
  },
}));

const clientDist = path.join(__dirname, 'client', 'dist');
let _cachedDashHtml = null;
const loadDashboardHtml = () => {
  if (!_cachedDashHtml) _cachedDashHtml = fs.readFileSync(path.join(clientDist, 'index.html'), 'utf8');
  return _cachedDashHtml;
};
const sendDashboard = (req, res) => {
  let html = loadDashboardHtml();
  html = html.replace(/__DASH_K__/g, getSpkiB64());
  html = html.replace(/__APP_URL__/g, resolvePublicAppUrl(process.env.APP_URL));
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.send(html);
};
app.use(express.static(clientDist, {
  index: false,
  setHeaders: (res, filePath) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('X-Frame-Options', 'DENY');
    if (filePath.includes(`${path.sep}assets${path.sep}`)) {
      res.setHeader('Cache-Control', 'public, max-age=31536000, immutable');
    } else {
      res.setHeader('Cache-Control', 'no-store');
    }
  }
}));

// ==============================================================================
// TWEAKS & CLOUD SERVING ENDPOINTS
// ==============================================================================
const TWEAKS_DIR = path.join(__dirname, 'app_files');

// Manifest of all tweaks
app.get('/api/tweaks/manifest', (req, res) => {
  if (!fs.existsSync(TWEAKS_DIR)) {
    return res.status(404).json({ error: 'Tweaks directory not found on server' });
  }

  function getFiles(dir, base = '') {
    let results = [];
    const list = fs.readdirSync(dir);
    list.forEach(file => {
      const fullPath = path.join(dir, file);
      const relPath = path.join(base, file);
      const stat = fs.statSync(fullPath);
      if (stat && stat.isDirectory()) {
        results = results.concat(getFiles(fullPath, relPath));
      } else {
        results.push({
          name: file,
          path: relPath.replace(/\\/g, '/'),
          size: stat.size,
          type: path.extname(file).toLowerCase()
        });
      }
    });
    return results;
  }

  try {
    const files = getFiles(TWEAKS_DIR);
    res.json({ success: true, count: files.length, tweaks: files });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

// Download/Stream a tweak script directly
app.get('/api/tweaks/file/*', (req, res) => {
  const relativeFilePath = req.params[0];
  if (!relativeFilePath) return res.status(400).send('File required');

  const safePath = path.normalize(relativeFilePath).replace(/^(\.\.[\/\\])+/, '');
  const targetPath = path.join(TWEAKS_DIR, safePath);

  if (!fs.existsSync(targetPath)) {
    return res.status(404).send('File not found');
  }

  res.sendFile(targetPath);
});

// Direct Review Submission via 509 Unified Reviews Bot
app.post('/api/submit-review', async (req, res) => {
  try {
    const { key, user, rating, reviewText, avatar } = req.body || {};
    if (!reviewText || !reviewText.trim()) {
      return res.status(400).json({ success: false, message: 'Review text is required.' });
    }

    const https = require('https');
    const userAvatar = (avatar && String(avatar).startsWith('http'))
      ? avatar
      : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

    const payload = JSON.stringify({
      key: key || 'CLIENT-WEB',
      user: user || 'عميل RAKHA',
      avatar: userAvatar,
      rating: rating || 5,
      reviewText: reviewText.trim()
    });

    const postReq = https.request({
      hostname: 'rakha-bots-unified.509.rip',
      path: '/api/submit-review',
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': Buffer.byteLength(payload)
      },
      timeout: 5000
    }, (botRes) => {
      let buf = '';
      botRes.on('data', c => buf += c);
      botRes.on('end', () => {
        try {
          const data = JSON.parse(buf);
          return res.json(data);
        } catch {
          return res.json({ success: true, message: 'Review forwarded to bot successfully!' });
        }
      });
    });

    postReq.on('error', (err) => {
      console.warn('Bot forward error:', err.message);
      return res.json({ success: true, message: 'Review received!' });
    });
    postReq.write(payload);
    postReq.end();
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

app.use('/api', (req, res) => {
  res.status(404).json({ success: false, message: 'Not found' });
});

app.get('*', (req, res) => {
  sendDashboard(req, res);
});

app.use((err, req, res, _next) => {
  if (err?.message === 'CORS blocked') {
    return res.status(403).json({ success: false, message: 'CORS blocked' });
  }
  if (err?.type === 'entity.too.large' || err?.status === 413) {
    return res.status(413).json({ success: false, message: 'Request too large' });
  }
  if (err?.type === 'entity.parse.failed' || (err instanceof SyntaxError && 'body' in err)) {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }
  if (err?.name === 'CastError' || err?.name === 'ValidationError') {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }
  console.error(err.stack || err.message);
  res.status(500).json({ success: false, message: 'Internal server error' });
});

const PORT = process.env.PORT || 5050;

mongoose.set('bufferCommands', false);
mongoose.connect(process.env.MONGODB_URI, {
  maxPoolSize: 20,
  minPoolSize: 2,
  serverSelectionTimeoutMS: 5000,
})
  .then(async () => {
    console.log('✅ MongoDB connected');
    try {
      await require('./utils/mongoTransaction').assertTransactionSupport();
    } catch (e) {
      console.error(`❌ ${e.message}`);
      process.exit(1);
    }
    await AppUser.repairIndexes();
    try {
      await require('./utils/migrateAtRest').migrateAtRest();
    } catch (e) {
      console.error('❌ At-rest encryption migration failed:', e.message);
      process.exit(1);
    }
    try {
      await require('./models/SdkNonce').syncIndexes();
    } catch (_) {}
    try {
      const Application = require('./models/Application');
      const { appKidOf } = require('./utils/sdkGuards');
      const missing = await Application.find({
        $or: [{ appKid: { $exists: false } }, { appKid: null }, { appKid: '' }],
      }).select('appId');
      for (const row of missing) {
        if (!row.appId) continue;
        await Application.updateOne({ _id: row._id }, { $set: { appKid: appKidOf(row.appId) } });
      }
    } catch (e) {
      console.warn('⚠️  appKid backfill skipped:', e.message);
    }
    // Sync Log TTL index based on LOG_RETENTION_DAYS env var
    try {
      await require('./models/Log').syncLogTtl();
    } catch (e) { console.warn('⚠️  Log TTL sync skipped:', e.message); }
    await seedAdmin();
    await warmDummyPasswordHashes();
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Rakha Auth server running on port ${PORT}`);
      if (process.env.ADMIN_USERNAME) {
        console.log('🔒 Private dashboard owner lock is enabled');
      }
      if (process.env.DASHBOARD_IP_ALLOWLIST) {
        console.log('🔒 Dashboard IP allowlist enabled');
      }
    });
  })
  .catch((err) => {
    console.warn('⚠️  MongoDB connection error:', err.message);
    console.log(`⚠️  Starting server in standalone mode on http://localhost:${PORT} ...`);
    app.listen(PORT, '0.0.0.0', () => {
      console.log(`🚀 Rakha Auth server running on http://localhost:${PORT}`);
      console.log(`ℹ️  Note: Update MONGODB_URI in .env with your real MongoDB Atlas connection string when deploying to Render.`);
    });
  });

module.exports = app;
