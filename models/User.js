const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
  username: {
    type: String,
    required: [true, 'Username is required'],
    unique: true,
    trim: true,
    minlength: [3, 'Username must be at least 3 characters'],
    maxlength: [60, 'Username cannot exceed 60 characters'],
  },
  password: {
    type: String,
    required: [true, 'Password is required'],
    minlength: [4, 'Password must be at least 4 characters'],
    select: false
  },
  role: {
    type: String,
    enum: ['admin', 'user'],
    default: 'user'
  },
  isVerified: {
    type: Boolean,
    default: true
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
  dashboardSessionHash: {
    type: String,
    select: false,
    index: true,
  },
  dashboardSessionExp: {
    type: Date,
    select: false,
  },
  dashboardSessionSeenAt: {
    type: Date,
    select: false,
  },
  dashboardSessionIpPrefix: {
    type: String,
    select: false,
  },
  dashboardSessionUaHash: {
    type: String,
    select: false,
  },
  tokenVersion: {
    type: Number,
    default: 0
  },
  lastLogin: Date,
  lastLoginIp: String,
  loginCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  discordId: {
    type: String,
    unique: true,
    sparse: true
  },

  avatarUrl: {
    type: String,
    default: '',
    trim: true,
  },
  avatar: {
    type: Buffer,
    select: false,
  },
  avatarMime: {
    type: String,
    default: '',
    select: false,
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.pre('save', async function(next) {
  if (!this.isModified('password')) return next();
  const salt = await bcrypt.genSalt(14);
  this.password = await bcrypt.hash(this.password, salt);

  this.tokenVersion = (this.tokenVersion || 0) + 1;
  next();
});

userSchema.methods.comparePassword = async function(candidatePassword) {
  return await bcrypt.compare(candidatePassword, this.password);
};

userSchema.methods.isLocked = function() {
  return !!(this.lockUntil && this.lockUntil > Date.now());
};

userSchema.methods.incLoginFail = async function(threshold, lockMinutes) {
  this.failedLoginAttempts = (this.failedLoginAttempts || 0) + 1;
  if (this.failedLoginAttempts >= threshold) {
    this.lockUntil = new Date(Date.now() + lockMinutes * 60 * 1000);
    this.failedLoginAttempts = 0;
  }
  await this.save({ validateBeforeSave: false });
};

userSchema.methods.resetLoginFail = async function() {
  if (this.failedLoginAttempts || this.lockUntil) {
    this.failedLoginAttempts = 0;
    this.lockUntil = undefined;
    await this.save({ validateBeforeSave: false });
  }
};

module.exports = mongoose.model('User', userSchema);
