const mongoose = require('mongoose');
const { wrap, peek, isSealed } = require('../utils/fieldCrypto');
const { appKidOf } = require('../utils/sdkGuards');

const applicationSchema = new mongoose.Schema({
  owner: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  name: {
    type: String,
    required: [true, 'Application name is required'],
    trim: true,
    maxlength: [50, 'App name cannot exceed 50 characters']
  },

  slug: {
    type: String,
    unique: true,
    lowercase: true,
    trim: true
  },
  appId: {
    type: String,
    unique: true,
    required: true
  },
  appKid: {
    type: String,
    unique: true,
    sparse: true,
    index: true,
  },
  appSecret: {
    type: String,
    required: true,
    select: false
  },
  version: {
    type: String,
    default: '1.0.0'
  },
  status: {
    type: String,
    enum: ['active', 'paused', 'disabled', 'deleted'],
    default: 'active'
  },
  description: {
    type: String,
    maxlength: [200, 'Description cannot exceed 200 characters'],
    default: ''
  },

  keyPrefix: {
    type: String,
    default: 'SVGA',
    maxlength: [8, 'Key prefix max 8 chars'],
    uppercase: true,
    trim: true
  },
  hwidLock: {
    type: Boolean,
    default: true
  },
  totalRequests: {
    type: Number,
    default: 0
  },
  maintenanceMode: {
    type: Boolean,
    default: false
  },
  maintenanceMessage: {
    type: String,
    default: 'Under maintenance'
  },
  minVersion: {
    type: String,
    default: '1.0.0',
  },
  vpnBlock: {
    type: Boolean,
    default: false
  },
  sessionExpirySeconds: {
    type: Number,
    default: 900,
    min: 30,
    max: 86400
  },
  oneSessionPerCredential: {
    type: Boolean,
    default: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

applicationSchema.post('init', function () {
  if (this.appSecret && isSealed(this.appSecret)) {
    const plain = peek(this.appSecret);
    if (plain) {
      this.set('appSecret', plain);
      this.unmarkModified('appSecret');
    }
  }
});

applicationSchema.pre('save', function () {
  if (this.appId) this.appKid = appKidOf(this.appId);
  if (this.appSecret && !isSealed(this.appSecret)) {
    this.appSecret = wrap(this.appSecret);
  }
});

applicationSchema.set('toJSON', {
  transform: (_doc, ret) => {
    delete ret.appSecret;
    delete ret.__v;
    return ret;
  },
});

module.exports = mongoose.model('Application', applicationSchema);
