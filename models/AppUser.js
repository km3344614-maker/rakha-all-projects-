const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const { packUser, revealUser, looksLikeHash, isSealed } = require('../utils/fieldCrypto');

const appUserSchema = new mongoose.Schema({
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true
  },
  username: {
    type: String,
    required: true,
    trim: true
  },
  usernameHash: {
    type: String,
    index: true
  },
  usernameSealed: {
    type: String,
    default: ''
  },
  password: {
    type: String,
    required: true,
    select: false
  },
  licenseKey: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'LicenseKey',
    default: null
  },
  hwid: {
    type: String,
    default: null
  },
  pendingHwid: {
    type: String,
    default: null,
    select: false
  },
  // One-shot: next login may bind any device. Set by Reset HWID, cleared after that login.
  hwidUnlock: {
    type: Boolean,
    default: false
  },
  hwidRebindAt: {
    type: Date,
    default: null
  },
  hwidRebindCount: {
    type: Number,
    default: 0
  },
  status: {
    type: String,
    enum: ['active', 'banned', 'expired'],
    default: 'active'
  },
  subscriptionExpire: {
    type: Date,
    default: null
  },
  variables: {
    type: Map,
    of: String,
    default: {}
  },
  loginCount: {
    type: Number,
    default: 0
  },
  failedLoginAttempts: {
    type: Number,
    default: 0,
    select: false
  },
  lockUntil: {
    type: Date,
    default: null,
    select: false
  },
  lastLogin: Date,
  lastIp: String,

  pcName: {
    type: String,
    default: '',
    trim: true,
    maxlength: 64,
  },
  lastSeen: Date,

  sessionTokenHash: {
    type: String,
    default: null,
    select: false
  },

  sessionTokenHashes: {
    type: [String],
    default: undefined,
    select: false
  },
  sessionVersion: {
    type: Number,
    default: 0
  },
  sessionKilled: {
    type: Boolean,
    default: false
  },
  discordId: {
    type: String,

    default: undefined,
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

appUserSchema.pre('save', async function(next) {
  if (this.isModified('username')) {
    const plain = String(this.username || '').trim();
    if (plain && !looksLikeHash(plain) && !isSealed(plain)) {
      const packed = packUser(this.app, plain);
      this.usernameHash = packed.usernameHash;
      this.usernameSealed = packed.usernameSealed;
      this.username = packed.username;
    }
  }
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(12);
  this.password = await bcrypt.hash(this.password, salt);
  next();
});

const stripUserSecrets = (_doc, ret) => {
  ret.username = revealUser(_doc);
  delete ret.usernameSealed;
  delete ret.usernameHash;
  delete ret.password;
  delete ret.sessionTokenHash;
  delete ret.sessionTokenHashes;
  delete ret.__v;
  return ret;
};

appUserSchema.set('toJSON', { transform: stripUserSecrets });
appUserSchema.set('toObject', { transform: stripUserSecrets });

appUserSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

appUserSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

appUserSchema.methods.incLoginFail = async function(threshold, lockMinutes) {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= threshold) {
    this.lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    this.failedLoginAttempts = 0;
  }
  if (typeof this.depopulate === 'function') this.depopulate('licenseKey');
  await this.save({ validateBeforeSave: false });
};

appUserSchema.methods.resetLoginFail = async function() {
  if (this.failedLoginAttempts || this.lockUntil) {
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
    if (typeof this.depopulate === 'function') this.depopulate('licenseKey');
    await this.save({ validateBeforeSave: false });
  }
};

appUserSchema.index({ app: 1, username: 1 }, { unique: true });
appUserSchema.index({ app: 1, discordId: 1 }, { unique: true, sparse: true });
appUserSchema.index({ app: 1, lastSeen: -1 });
appUserSchema.index({ app: 1, createdAt: -1 });
appUserSchema.index({ app: 1, status: 1 });

appUserSchema.statics.uniqueUnsetDiscordId = function uniqueUnsetDiscordId() {
  return `unset_${require('crypto').randomBytes(16).toString('hex')}`;
};

appUserSchema.statics.repairIndexes = async function repairIndexes() {
  try {
    const col = this.collection;
    const indexes = await col.indexes();
    if (indexes.some((i) => i.name === 'discordId_1')) {
      await col.dropIndex('discordId_1');
      console.log('✔ Dropped legacy appusers.discordId_1 index');
    }
  } catch (e) {
    console.warn('⚠ appusers index repair:', e.message);
  }
};

module.exports = mongoose.model('AppUser', appUserSchema);
