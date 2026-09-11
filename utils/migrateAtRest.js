const LicenseKey = require('../models/LicenseKey');
const AppUser = require('../models/AppUser');
const Application = require('../models/Application');
const Variable = require('../models/Variable');
const {
  isSealed,
  wrap,
  peek,
  looksLikeHash,
  packLicense,
  packUser,
} = require('./fieldCrypto');

const BATCH = 200;

async function dropIndexQuiet(model, name) {
  try {
    await model.collection.dropIndex(name);
    console.log(`✔ Dropped index ${model.modelName}.${name}`);
  } catch (e) {
    if (!/index not found|ns not found/i.test(e.message || '')) {
      console.warn(`⚠ dropIndex ${model.modelName}.${name}:`, e.message);
    }
  }
}

async function migrateLicenseKeys() {
  let n = 0;
  for (;;) {
    const docs = await LicenseKey.find({
      $or: [
        { keyHash: { $in: [null, ''] } },
        { key: { $exists: true, $nin: [null, ''] } },
      ],
    })
      .select('+key +keySealed')
      .limit(BATCH);
    if (!docs.length) break;
    for (const doc of docs) {
      const plain = peek(doc.keySealed) || (!isSealed(doc.key) && !looksLikeHash(doc.key) ? String(doc.key || '').trim() : '');
      if (!plain) continue;
      const packed = packLicense(plain);
      await LicenseKey.updateOne(
        { _id: doc._id },
        { $set: { keyHash: packed.keyHash, keySealed: packed.keySealed }, $unset: { key: 1 } }
      );
      n += 1;
    }
    if (docs.length < BATCH) break;
  }
  await dropIndexQuiet(LicenseKey, 'key_1');
  return n;
}

async function migrateAppUsers() {
  let n = 0;
  for (;;) {
    const docs = await AppUser.find({
      $or: [
        { usernameSealed: { $in: [null, ''] } },
        { usernameHash: { $in: [null, ''] } },
      ],
    }).limit(BATCH);
    if (!docs.length) break;
    for (const doc of docs) {
      const raw = String(doc.username || '').trim();
      const plain = peek(doc.usernameSealed)
        || (!looksLikeHash(raw) && !isSealed(raw) ? raw : '');
      if (!plain) continue;
      const packed = packUser(doc.app, plain);
      await AppUser.updateOne(
        { _id: doc._id },
        {
          $set: {
            username: packed.username,
            usernameHash: packed.usernameHash,
            usernameSealed: packed.usernameSealed,
          },
        }
      );
      n += 1;
    }
    if (docs.length < BATCH) break;
  }
  return n;
}

async function migrateAppSecrets() {
  let n = 0;
  const docs = await Application.find({}).select('+appSecret').lean();
  for (const doc of docs) {
    const raw = String(doc.appSecret || '');
    if (!raw || isSealed(raw)) continue;
    await Application.updateOne(
      { _id: doc._id },
      { $set: { appSecret: wrap(raw) } }
    );
    n += 1;
  }
  return n;
}

async function migrateVariables() {
  let n = 0;
  const docs = await Variable.find({}).lean();
  for (const doc of docs) {
    const raw = String(doc.value || '');
    if (!raw || isSealed(raw)) continue;
    await Variable.updateOne({ _id: doc._id }, { $set: { value: wrap(raw) } });
    n += 1;
  }
  return n;
}

const migrateAtRest = async () => {
  const keys = await migrateLicenseKeys();
  const users = await migrateAppUsers();
  const secrets = await migrateAppSecrets();
  const vars = await migrateVariables();
  try {
    await LicenseKey.syncIndexes();
    await AppUser.syncIndexes();
  } catch (e) {
    console.warn('⚠ at-rest index sync:', e.message);
  }
  if (keys || users || secrets || vars) {
    console.log(`✅ At-rest encryption migrated: keys=${keys} users=${users} secrets=${secrets} vars=${vars}`);
  }
};

module.exports = { migrateAtRest };
