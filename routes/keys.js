const express = require('express');
const router = express.Router({ mergeParams: true });
const mongoose = require('mongoose');
const LicenseKey = require('../models/LicenseKey');
const AppUser = require('../models/AppUser');
const standaloneKeys = require('../utils/standaloneKeys');
const { dashboardProtect } = require('../middleware/auth');
const { verifyAppOwner } = require('../middleware/verifyAppOwner');
const { generateLicenseKey, generateFromMask, generateBulkKeys } = require('../utils/keyGenerator');
const { packLicense, revealLicense, keyHashClause, effectiveLicenseStatus, licenseInUse, revealUser } = require('../utils/fieldCrypto');
const { pickObjectIds, isObjectId } = require('../utils/security');
const { resetDeviceBinding } = require('../utils/hwidFingerprint');
const {
  buildKeyUsageIndex,
  repairKeysFromUsage,
  reloadLicenseRows,
  formatLicenseKeyDisplay,
} = require('../utils/licenseUsageSync');

const unlinkUsers = async (appId, keyIds) => {
  if (!keyIds?.length) return;
  await AppUser.updateMany(
    { app: appId, licenseKey: { $in: keyIds } },
    { $set: { licenseKey: null } }
  );
};

const toDurationDays = (value, expiryType = 'days') => {
  const n = Math.max(0, Number(value) || 0);
  switch (String(expiryType).toLowerCase()) {
    case 'minutes':
      return Math.max(1 / (24 * 60), n / (24 * 60));
    case 'hours':
      return Math.max(1 / 24, n / 24);
    case 'weeks':
      return n * 7;
    case 'months':
      return n * 30;
    case 'lifetime':
      return 0;
    case 'days':
    default:
      return n;
  }
};

const revealKeyForOwner = (doc, usageHint = null) => {
  const raw = doc && typeof doc.toObject === 'function'
    ? doc.toObject({ transform: false })
    : { ...(doc || {}) };
  if (usageHint) {
    if (!raw.boundUser) raw.boundUser = usageHint.userId;
    if (!raw.lastUsed && usageHint.lastLogin) raw.lastUsed = usageHint.lastLogin;
    if (Number(raw.currentUses) <= 0 && Number(usageHint.loginCount) > 0) raw.currentUses = 1;
    if (!raw.activatedAt && usageHint.lastLogin) raw.activatedAt = usageHint.lastLogin;
  }
  const key = formatLicenseKeyDisplay(revealLicense(doc));
  delete raw.keySealed;
  delete raw.keyHash;
  delete raw.__v;
  return { ...raw, key, status: effectiveLicenseStatus(raw) };
};

const mapRepairedKeys = async (appId, rows, usageIndex) => {
  const freshMap = await reloadLicenseRows(appId, rows.map((row) => row._id));
  return rows.map((row) => {
    const doc = freshMap.get(String(row._id)) || row;
    return revealKeyForOwner(doc, usageIndex.get(String(row._id)));
  });
};

router.get('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      const all = standaloneKeys.getAllKeys();
      const page = Math.max(1, parseInt(req.query.page, 10) || 1);
      const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
      const search = (req.query.search || '').trim().toLowerCase();
      let filtered = all;
      if (search) {
        filtered = all.filter(k => (k.key || '').toLowerCase().includes(search) || (k.name || '').toLowerCase().includes(search) || (k.userId || '').includes(search));
      }
      const total = filtered.length;
      const paginated = filtered.slice((page - 1) * limit, page * limit);
      return res.json({
        success: true,
        keys: paginated,
        total,
        page,
        pages: Math.ceil(total / limit) || 1,
        generators: ['Dashboard', 'Admin'],
        counts: {
          unused: all.filter(k => k.status === 'unused').length,
          used: all.filter(k => k.status === 'active').length,
          expired: all.filter(k => k.status === 'expired').length,
          all: total
        }
      });
    }

    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 25));
    const { status, search, createdBy } = req.query;
    const filter = { app: req.params.appId };
    const ALLOWED_STATUS = new Set(['unused', 'active', 'banned', 'expired', 'paused']);

    if (typeof status === 'string' && ALLOWED_STATUS.has(status)) {
      if (status === 'active') {
        filter.$or = [
          { status: 'active' },
          { boundUser: { $ne: null } },
          { currentUses: { $gt: 0 } },
          { activatedAt: { $ne: null } },
          { lastUsed: { $ne: null } },
        ];
      } else if (status === 'unused') {
        filter.status = 'unused';
        filter.boundUser = null;
        filter.currentUses = { $lte: 0 };
        filter.activatedAt = null;
        filter.lastUsed = null;
      } else {
        filter.status = status;
      }
    }
    if (typeof createdBy === 'string' && createdBy) filter.createdBy = createdBy.slice(0, 64);

    const q = typeof search === 'string' ? search.trim().slice(0, 64) : '';
    let keys;
    let total;

    if (q) {
      const hashClause = keyHashClause(q);
      let exact = [];
      if (hashClause) {
        exact = await LicenseKey.find({ ...filter, keyHash: hashClause })
          .populate('boundUser', 'username usernameSealed')
          .sort('-createdAt');
      }
      if (exact.length) {
        const usageIndex = await buildKeyUsageIndex(req.params.appId, exact);
        await repairKeysFromUsage(req.params.appId, exact, usageIndex);
        keys = await mapRepairedKeys(req.params.appId, exact, usageIndex);
        total = exact.length;
      } else {
        keys = [];
        total = 0;
      }
    } else {
      total = await LicenseKey.countDocuments(filter);
      const rows = await LicenseKey.find(filter)
        .populate('boundUser', 'username usernameSealed')
        .sort('-createdAt')
        .skip((page - 1) * limit)
        .limit(limit);
      const usageIndex = await buildKeyUsageIndex(req.params.appId, rows);
      await repairKeysFromUsage(req.params.appId, rows, usageIndex);
      keys = await mapRepairedKeys(req.params.appId, rows, usageIndex);
    }

    const generators = await LicenseKey.distinct('createdBy', {
      app: req.params.appId,
      createdBy: { $nin: [null, ''] },
    });

    const appId = req.params.appId;
    const now = new Date();
    const [unusedCount, usedCount, expiredCount, allCount] = await Promise.all([
      LicenseKey.countDocuments({
        app: appId,
        status: 'unused',
        boundUser: null,
        currentUses: { $lte: 0 },
        activatedAt: null,
        lastUsed: null,
      }),
      LicenseKey.countDocuments({
        app: appId,
        status: { $nin: ['banned', 'paused', 'expired'] },
        $or: [
          { status: 'active' },
          { boundUser: { $ne: null } },
          { currentUses: { $gt: 0 } },
          { activatedAt: { $ne: null } },
          { lastUsed: { $ne: null } },
        ],
        $and: [{ $or: [{ expireDate: null }, { expireDate: { $gt: now } }] }],
      }),
      LicenseKey.countDocuments({
        app: appId,
        $or: [
          { status: 'expired' },
          { expireDate: { $ne: null, $lte: now } },
        ],
      }),
      LicenseKey.countDocuments({ app: appId }),
    ]);

    res.json({
      success: true,
      keys,
      total,
      page,
      pages: Math.ceil(total / limit) || 1,
      generators,
      counts: {
        unused: unusedCount,
        used: usedCount,
        expired: expiredCount,
        all: allCount,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/:keyId/details', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (!isObjectId(req.params.keyId)) {
      return res.status(400).json({ success: false, message: 'Invalid request' });
    }
    const keyDoc = await LicenseKey.findOne({
      _id: req.params.keyId,
      app: req.params.appId,
    })
      .select('keySealed keyHash status duration expireDate hwid boundUser currentUses activatedAt lastUsed createdAt note');
    if (!keyDoc) return res.status(404).json({ success: false, message: 'Key not found' });

    const usageIndex = await buildKeyUsageIndex(req.params.appId, [keyDoc]);
    await repairKeysFromUsage(req.params.appId, [keyDoc], usageIndex);
    const revealed = revealKeyForOwner(keyDoc, usageIndex.get(String(keyDoc._id)));

    const userId = revealed.boundUser?._id || revealed.boundUser || usageIndex.get(String(keyDoc._id))?.userId;
    const user = userId
      ? await AppUser.findOne({ _id: userId, app: req.params.appId })
        .select('username usernameSealed hwid hwidUnlock lastIp lastLogin subscriptionExpire status')
        .lean()
      : null;

    const expiresAt = keyDoc.expireDate || user?.subscriptionExpire || null;
    const activatedAt = revealed.activatedAt || revealed.lastUsed || user?.lastLogin || null;
    const hwid = user?.hwidUnlock ? null : (user?.hwid || revealed.hwid || null);
    const activated = licenseInUse(revealed);
    const banned = revealed.status === 'banned' || user?.status === 'banned';

    res.json({
      success: true,
      details: {
        id: String(keyDoc._id),
        key: revealed.key,
        product: req.ownerApp.name,
        activated,
        status: revealed.status,
        duration: Number(keyDoc.duration) || 0,
        expiresAt,
        hwid,
        ip: user?.lastIp || null,
        activatedAt,
        banned,
        banReason: banned ? (keyDoc.note || null) : null,
      },
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const syncToDiscordBot = async (keyStr, daysCount, clientName, clientUserId, avatarUrl, createdBy = 'Dashboard') => {
  try {
    const fs = require('fs');
    const path = require('path');
    const isLifetime = String(daysCount).toLowerCase().includes('life') || daysCount === 0 || daysCount === '0';
    const finalDays = isLifetime ? 'lifetime' : String(daysCount);

    // 1. Sync to local bot DBs if they exist
    const botDbPaths = [
      'C:\\Users\\RAKHA\\Desktop\\RAKHA BOTS (REVIEWS & KEY GEN)\\KEY GENERATOR BOT\\database.json',
      'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\SOURCE\\RAKHA DILV BOT (DONE)\\database.json',
      'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\LUNCH\\key-gen-bot\\database.json',
      'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA DILV BOT\\database.json',
      'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA AUTH\\bot\\database.json',
      'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA AUTH & TWEAKS APP ON RENDER HOST\\bot\\database.json',
      path.join(__dirname, '..', 'bot', 'database.json'),
      'C:\\Users\\RAKHA\\Desktop\\حمايه رخا\\حمايه رخا\\Rakha Auth\\bot\\database.json'
    ];
    for (const dbPath of botDbPaths) {
      if (fs.existsSync(dbPath)) {
        let botDb = { keys: {} };
        try {
          botDb = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
        } catch (e) {
          botDb = { keys: {} };
        }
        if (!botDb.keys) botDb.keys = {};
        botDb.keys[keyStr] = {
          key: keyStr,
          name: clientName || 'Rakha Client',
          days: finalDays,
          userId: clientUserId || '',
          customAvatar: avatarUrl || null,
          status: 'active',
          createdAt: new Date().toISOString(),
          generatedBy: createdBy || 'Dashboard'
        };
        fs.writeFileSync(dbPath, JSON.stringify(botDb, null, 2), 'utf8');
      }
    }

    // 2. Sync to 509 Cloud Bot
    standaloneKeys.syncKeyTo509Bot({
      key: keyStr,
      name: clientName || 'Rakha Client',
      clientName: clientName || 'Rakha Client',
      days: finalDays,
      userId: clientUserId || '',
      customAvatar: avatarUrl || null,
      status: 'active',
      generatedBy: createdBy || 'Dashboard'
    }).catch(() => {});

    // 3. Send notification to Discord Webhook
    const webhookUrl = 'https://discord.com/api/webhooks/1545060653906272306/kTZPuXrOxjA8VlKxlBzcs11lQULN4KmrB78W3Q5IEcWBmRelBpMNBkrH9gSsmrdmxXgs';
    try {
      const https = require('https');
      const payload = JSON.stringify({
        username: 'RAKHA KEY GEN // السجلات',
        avatar_url: avatarUrl || 'https://cdn.discordapp.com/embed/avatars/0.png',
        embeds: [{
          title: '✅ تم توليد المفتاح من لوحة التحكم بنجاح!',
          description: `🔑 **المفتاح**: \`${keyStr}\`\n` +
            `👤 **العميل**: **${clientName || 'Rakha Client'}** ${clientUserId ? `(<@${clientUserId}>)` : ''}\n` +
            `⏳ **المدة**: \`${isLifetime ? '♾️ Lifetime' : `${daysCount} يوم`}\`\n` +
            `🛡️ **الحالة**: 🟢 **نشط (ACTIVE)**\n` +
            `👮 **بواسطة**: **${createdBy || 'Admin'} (Web Dashboard)**`,
          color: 0xFFFFFF,
          thumbnail: avatarUrl ? { url: avatarUrl } : undefined,
          footer: { text: 'RAKHA STORE • نظام التراخيص الرسمي' },
          timestamp: new Date().toISOString()
        }]
      });
      const urlObj = new URL(webhookUrl);
      const reqObj = https.request({
        hostname: urlObj.hostname,
        path: urlObj.pathname + urlObj.search,
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(payload)
        }
      });
      reqObj.on('error', () => {});
      reqObj.write(payload);
      reqObj.end();
    } catch (e) {}

    // 4. Direct DM Delivery to User
    if (clientUserId) {
      const cleanId = String(clientUserId).replace(/[^0-9]/g, '');
      if (cleanId.length >= 16) {
        // A. Call 509 Cloud delivery endpoint
        try {
          const https = require('https');
          const deliverPayload = JSON.stringify({
            userId: cleanId,
            key: keyStr,
            days: finalDays,
            clientName: clientName || 'Rakha Client'
          });
          const dReq = https.request({
            hostname: 'rakha-bots-unified.509.rip',
            path: '/api/deliver-key',
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
              'Content-Length': Buffer.byteLength(deliverPayload)
            },
            timeout: 5000
          });
          dReq.on('error', () => {});
          dReq.write(deliverPayload);
          dReq.end();
        } catch (e) {}

        // B. Direct Discord API DM with Active Bot Token
        try {
          const https = require('https');
          const botToken = "MTU0NTAxODU2MTg0NjgzNzI5MQ.GigaDa.adiqzTvOOsQdZtejXcyOkK2Gw9Stldk8BjyC50";
          const openDmPayload = JSON.stringify({ recipient_id: cleanId });
          const dmReq = https.request({
            hostname: 'discord.com',
            path: '/api/v10/users/@me/channels',
            method: 'POST',
            headers: {
              'Authorization': `Bot ${botToken}`,
              'Content-Type': 'application/json',
              'User-Agent': 'RakhaKeyGenBot (https://rakha.me, 1.0.0)'
            }
          }, (dmRes) => {
            let dmBuf = '';
            dmRes.on('data', c => dmBuf += c);
            dmRes.on('end', () => {
              try {
                const ch = JSON.parse(dmBuf);
                if (ch && ch.id) {
                  const dmMsg = JSON.stringify({
                    embeds: [{
                      title: '👑 RAKHA TWEAKS V3 • مفتاح التفعيل الخاص بك',
                      description: `مرحباً بك يا **${clientName || 'عزيزنا العميل'}**!\nتم إصدار ترخيصك بنجاح من متجر رخا. استخدم هذا المفتاح لتفعيل البرنامج:\n\n` +
                        `🔑 **مفتاح التفعيل (License Key):**\n\`\`\`\n${keyStr}\n\`\`\`\n` +
                        `⏳ **المدة:** \`${isLifetime ? '♾️ Lifetime VIP (مدى الحياة)' : `${daysCount} يوم`}\`\n` +
                        `🛡️ **الحالة:** 🟢 **نشط وموثق (Active)**\n` +
                        `⚡ **التأخير:** \`0.0ms True Delay Reduction\`\n\n` +
                        `> ⚠️ *ملاحظة: هذا الترخيص مربوط بجهازك (HWID). لا تقم بمشاركته.*`,
                      color: 0xFFFFFF,
                      footer: { text: 'Rakha Services • Delivery Engine' },
                      timestamp: new Date().toISOString()
                    }]
                  });
                  const msgReq = https.request({
                    hostname: 'discord.com',
                    path: `/api/v10/channels/${ch.id}/messages`,
                    method: 'POST',
                    headers: {
                      'Authorization': `Bot ${botToken}`,
                      'Content-Type': 'application/json',
                      'Content-Length': Buffer.byteLength(dmMsg),
                      'User-Agent': 'RakhaKeyGenBot (https://rakha.me, 1.0.0)'
                    }
                  });
                  msgReq.on('error', () => {});
                  msgReq.write(dmMsg);
                  msgReq.end();
                }
              } catch (e) {}
            });
          });
          dmReq.on('error', () => {});
          dmReq.write(openDmPayload);
          dmReq.end();
        } catch (e) {}
      }
    }
  } catch (err) {
    console.warn('syncToDiscordBot error:', err.message);
  }
};

router.post('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const {
      duration = 30,
      expiryType = 'days',
      note = '',
      prefix,
      mask,
      lowercase = true,
      uppercase = true,
      amount = 1,
      name = '',
      userId = '',
      customAvatar = '',
    } = req.body;

    const maxUses = 1;
    const count = Math.min(500, Math.max(1, parseInt(amount, 10) || 1));
    const days = toDurationDays(duration, expiryType);
    const keyPrefix = prefix
      ? String(prefix).replace(/[^A-Za-z0-9]/g, '').substring(0, 8)
      : (req.ownerApp.keyPrefix || 'SVGA');
    const createdBy = req.user?.username || '';

    const maskStr = mask != null ? String(mask).trim() : '';

    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      const isLifetime = expiryType === 'lifetime' || days === 0;
      const createdKeys = [];
      for (let i = 0; i < count; i++) {
        const keyValue = maskStr
          ? generateFromMask(maskStr, { lowercase: !!lowercase, uppercase: !!uppercase })
          : generateLicenseKey(keyPrefix);

        const saved = standaloneKeys.saveKey({
          key: keyValue,
          clientName: name || 'Rakha Client',
          name: name || 'Rakha Client',
          duration: isLifetime ? 0 : days,
          days: isLifetime ? 'lifetime' : String(days),
          userId: userId || '',
          customAvatar: customAvatar || null,
          status: 'active',
          note: note || '',
          generatedBy: createdBy || 'Dashboard'
        });
        createdKeys.push(saved);
        syncToDiscordBot(saved.key, days, name, userId, customAvatar, createdBy).catch(() => {});
      }
      return res.status(201).json({
        success: true,
        key: createdKeys[0],
        keys: createdKeys,
        count: createdKeys.length
      });
    }

    if (count === 1) {
      const keyValue = maskStr
        ? generateFromMask(maskStr, { lowercase: !!lowercase, uppercase: !!uppercase })
        : generateLicenseKey(keyPrefix);

      const key = await LicenseKey.create({
        app: req.params.appId,
        key: keyValue,
        duration: days,
        maxUses,
        note: typeof note === 'string' ? note.slice(0, 500) : '',
        clientName: typeof name === 'string' ? name.slice(0, 100) : '',
        discordUserId: typeof userId === 'string' ? userId.slice(0, 40) : '',
        customAvatar: typeof customAvatar === 'string' ? customAvatar : null,
        createdBy,
      });

      const exposed = revealKeyForOwner(key);
      syncToDiscordBot(exposed.key, days, name, userId, customAvatar, createdBy).catch(() => {});
      return res.status(201).json({ success: true, key: exposed, keys: [exposed], count: 1 });
    }

    const keysData = generateBulkKeys(count, keyPrefix, days, {
      mask: maskStr,
      lowercase: !!lowercase,
      uppercase: !!uppercase,
      note: typeof note === 'string' ? note.slice(0, 500) : '',
      maxUses,
      createdBy,
    });
    const keys = keysData.map(k => ({
      ...packLicense(k.key),
      app: req.params.appId,
      duration: k.duration,
      status: k.status || 'unused',
      note: k.note || '',
      maxUses: 1,
      createdBy: k.createdBy || createdBy,
      boundUser: null,
      currentUses: 0,
    }));
    const created = await LicenseKey.insertMany(keys);

    for (const k of keysData) {
      syncToDiscordBot(k.key, days, name, userId, customAvatar).catch(() => {});
    }

    res.status(201).json({
      success: true,
      keys: created.map(revealKeyForOwner),
      count: created.length,
    });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(409).json({ success: false, message: 'Key collision — try again' });
    }
    if (error?.message && /mask needs at least/i.test(error.message)) {
      return res.status(400).json({ success: false, message: error.message });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

const ALL_BOT_DB_PATHS = [
  'C:\\Users\\RAKHA\\Desktop\\RAKHA BOTS (REVIEWS & KEY GEN)\\KEY GENERATOR BOT\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\SOURCE\\RAKHA DILV BOT (DONE)\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\LUNCH\\key-gen-bot\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA DILV BOT\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA AUTH\\bot\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHAS TWEAKS PROJECT\\RAKHA AUTH & TWEAKS APP ON RENDER HOST\\bot\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\RAKHA_PROTECTION_AUTH_WEBSITE\\bot\\database.json',
  'C:\\Users\\RAKHA\\Desktop\\حمايه رخا\\حمايه رخا\\Rakha Auth\\bot\\database.json'
];

function syncKeyStatusToBots(plainKey, status, reason = '') {
  if (!plainKey) return;
  const fs = require('fs');
  const upper = plainKey.toUpperCase();
  for (const p of ALL_BOT_DB_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (data && data.keys) {
          const target = data.keys[plainKey] ? plainKey : (data.keys[upper] ? upper : null);
          if (target) {
            data.keys[target].status = status;
            if (status === 'banned') data.keys[target].banReason = reason || 'Banned by Rakha Services';
            fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
          }
        }
      } catch (e) {}
    }
  }
  // Also forward status to 509 Cloud
  standaloneKeys.syncKeyTo509Bot({ key: plainKey, status: status, banReason: reason }).catch(() => {});
}

function deleteKeyFromBots(plainKey) {
  if (!plainKey) return;
  const fs = require('fs');
  const upper = plainKey.toUpperCase();
  for (const p of ALL_BOT_DB_PATHS) {
    if (fs.existsSync(p)) {
      try {
        const data = JSON.parse(fs.readFileSync(p, 'utf8'));
        if (data && data.keys) {
          delete data.keys[plainKey];
          delete data.keys[upper];
          fs.writeFileSync(p, JSON.stringify(data, null, 2), 'utf8');
        }
      } catch (e) {}
    }
  }
  // Also forward deletion to 509 Cloud
  standaloneKeys.deleteKeyFrom509Bot(plainKey).catch(() => {});
}

router.put('/:keyId', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const { status, note, duration } = req.body;
    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      const updated = standaloneKeys.updateKey(req.params.keyId, { status, note, duration });
      if (updated) {
        syncKeyStatusToBots(updated.key, status, note);
        return res.json({ success: true, key: updated });
      }
      return res.status(404).json({ success: false, message: 'Key not found' });
    }

    const key = await LicenseKey.findOne({ _id: req.params.keyId, app: req.params.appId });
    if (!key) return res.status(404).json({ success: false, message: 'Key not found' });

    const ALLOWED_STATUS = new Set(['unused', 'active', 'banned', 'expired', 'paused']);
    if (typeof status === 'string' && ALLOWED_STATUS.has(status)) key.status = status;
    if (note !== undefined) key.note = typeof note === 'string' ? note.slice(0, 500) : '';
    if (duration !== undefined) {
      key.duration = Math.max(0, Number(duration) || 0);
    }

    key.maxUses = 1;

    await key.save();
    const revealedKey = revealKeyForOwner(key);
    if (revealedKey?.key && status) {
      syncKeyStatusToBots(revealedKey.key, status, note);
    }
    res.json({ success: true, key: revealedKey });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/:keyId/reset-hwid', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      standaloneKeys.updateKey(req.params.keyId, { hwid: null });
      return res.json({ success: true, hwid: null, message: 'HWID reset successfully' });
    }
    const result = await resetDeviceBinding({
      appId: req.params.appId,
      licenseKeyId: req.params.keyId,
    });
    if (!result.ok) return res.status(404).json({ success: false, message: 'Key not found' });
    res.json({ success: true, hwid: null, message: 'HWID reset — close the old program, then login on the new device' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/delete-selected', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      const ids = req.body?.ids || [];
      for (const id of ids) {
        standaloneKeys.deleteKey(id);
        deleteKeyFromBots(id);
      }
      return res.json({ success: true, deleted: ids.length });
    }

    const ids = pickObjectIds(req.body?.ids);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No keys selected' });
    }
    const keysToDelete = await LicenseKey.find({ app: req.params.appId, _id: { $in: ids } });
    for (const k of keysToDelete) {
      const revealed = revealKeyForOwner(k);
      if (revealed?.key) deleteKeyFromBots(revealed.key);
    }
    const result = await LicenseKey.deleteMany({
      app: req.params.appId,
      _id: { $in: ids },
    });
    await unlinkUsers(req.params.appId, ids);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/bulk/unused', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      const all = standaloneKeys.getAllKeys();
      const targets = all.filter(k => k.status === 'unused');
      targets.forEach(k => {
        standaloneKeys.deleteKey(k.key);
        deleteKeyFromBots(k.key);
      });
      return res.json({ success: true, deleted: targets.length });
    }

    const result = await LicenseKey.deleteMany({ app: req.params.appId, status: 'unused' });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/bulk/used', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      const all = standaloneKeys.getAllKeys();
      const targets = all.filter(k => k.status === 'active' || k.hwid);
      targets.forEach(k => {
        standaloneKeys.deleteKey(k.key);
        deleteKeyFromBots(k.key);
      });
      return res.json({ success: true, deleted: targets.length });
    }

    const keys = await LicenseKey.find({
      app: req.params.appId,
      status: { $in: ['active'] },
    }).select('_id');
    const ids = keys.map((k) => k._id);
    const keysToDelete = await LicenseKey.find({ app: req.params.appId, _id: { $in: ids } });
    for (const k of keysToDelete) {
      const revealed = revealKeyForOwner(k);
      if (revealed?.key) deleteKeyFromBots(revealed.key);
    }
    const result = await LicenseKey.deleteMany({ _id: { $in: ids }, app: req.params.appId });
    await unlinkUsers(req.params.appId, ids);
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/bulk/expired', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      const all = standaloneKeys.getAllKeys();
      const targets = all.filter(k => k.status === 'expired');
      targets.forEach(k => {
        standaloneKeys.deleteKey(k.key);
        deleteKeyFromBots(k.key);
      });
      return res.json({ success: true, deleted: targets.length });
    }

    const now = new Date();
    const keysToDelete = await LicenseKey.find({
      app: req.params.appId,
      $or: [
        { status: 'expired' },
        { expireDate: { $ne: null, $lte: now } },
      ],
    });
    for (const k of keysToDelete) {
      const revealed = revealKeyForOwner(k);
      if (revealed?.key) deleteKeyFromBots(revealed.key);
    }
    const result = await LicenseKey.deleteMany({
      app: req.params.appId,
      $or: [
        { status: 'expired' },
        { expireDate: { $ne: null, $lte: now } },
      ],
    });
    res.json({ success: true, deleted: result.deletedCount });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:keyId', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (mongoose.connection.readyState !== 1 || req.params.appId === 'app_rakha_v3') {
      standaloneKeys.deleteKey(req.params.keyId);
      deleteKeyFromBots(req.params.keyId);
      return res.json({ success: true, message: 'Key deleted' });
    }

    const deleted = await LicenseKey.findOneAndDelete({ _id: req.params.keyId, app: req.params.appId });
    if (!deleted) return res.status(404).json({ success: false, message: 'Key not found' });
    await unlinkUsers(req.params.appId, [deleted._id]);
    const revealedDeleted = revealKeyForOwner(deleted);
    if (revealedDeleted?.key) {
      deleteKeyFromBots(revealedDeleted.key);
    }
    res.json({ success: true, message: 'Key deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
