const mongoose = require('mongoose');
const { packLicense, revealLicense } = require('../utils/fieldCrypto');

const licenseKeySchema = new mongoose.Schema({
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true
  },
  // Legacy plaintext. Cleared after at-rest migration; never selected.
  key: {
    type: String,
    default: undefined,
    select: false
  },
  keyHash: {
    type: String,
    default: ''
  },
  keySealed: {
    type: String,
    default: ''
  },
  status: {
    type: String,
    enum: ['unused', 'active', 'expired', 'banned', 'paused'],
    default: 'unused'
  },

  maxUses: {
    type: Number,
    default: 1,
    min: 1,
  },
  currentUses: {
    type: Number,
    default: 0
  },
  expireDate: {
    type: Date,
    default: null
  },
  duration: {
    type: Number,
    default: 30
  },
  hwid: {
    type: String,
    default: null
  },
  boundUser: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'AppUser',
    default: null
  },
  note: {
    type: String,
    default: '',
    maxlength: 500,
  },
  clientName: {
    type: String,
    default: '',
  },
  discordUserId: {
    type: String,
    default: '',
  },
  customAvatar: {
    type: String,
    default: null,
  },
  createdBy: {
    type: String,
    default: ''
  },
  lastUsed: Date,
  activatedAt: {
    type: Date,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

licenseKeySchema.index({ app: 1, createdAt: -1 });
licenseKeySchema.index({ app: 1, status: 1 });
licenseKeySchema.index({ app: 1, boundUser: 1 });
licenseKeySchema.index(
  { keyHash: 1 },
  { unique: true, partialFilterExpression: { keyHash: { $type: 'string', $gt: '' } } }
);

licenseKeySchema.pre('validate', function () {
  const plain = this.key;
  if (plain && typeof plain === 'string' && plain.trim() && !this.keyHash) {
    const packed = packLicense(plain);
    this.keyHash = packed.keyHash;
    this.keySealed = packed.keySealed;
    this.key = undefined;
  }
});

const stripSecrets = (_doc, ret) => {
  delete ret.key;
  delete ret.keySealed;
  delete ret.keyHash;
  delete ret.__v;
  return ret;
};

licenseKeySchema.set('toJSON', { transform: stripSecrets });
licenseKeySchema.set('toObject', { transform: stripSecrets });

licenseKeySchema.statics.pack = packLicense;
licenseKeySchema.statics.reveal = revealLicense;

module.exports = mongoose.model('LicenseKey', licenseKeySchema);
