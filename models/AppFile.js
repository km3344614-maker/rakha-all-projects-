const mongoose = require('mongoose');

function isLocal() {
  return this.sourceType !== 'remote';
}

const appFileSchema = new mongoose.Schema({
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true,
    index: true
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: [64, 'Name max 64 chars']
  },
  filename: {
    type: String,
    default: '',
    maxlength: 255
  },
  size: {
    type: Number,
    default: 0
  },
  sha256: {
    type: String,
    default: ''
  },
  // 'local' keeps the bytes sealed on this server; 'remote' keeps only a sealed
  // pointer to an external host and never stores the payload itself.
  sourceType: {
    type: String,
    enum: ['local', 'remote'],
    default: 'local'
  },
  storageKey: { type: String, required: isLocal, select: false },
  iv: { type: String, required: isLocal, select: false },
  tag: { type: String, required: isLocal, select: false },
  wrappedKey: { type: String, required: isLocal, select: false },
  wrapIv: { type: String, required: isLocal, select: false },
  wrapTag: { type: String, required: isLocal, select: false },
  // Sealed JSON holding the external URL and archive password. Never selected by
  // default so an accidental query or log cannot leak the link.
  remoteSecret: { type: String, default: '', select: false },
  // Host only, safe to show in the panel so the owner can see where it points.
  remoteHost: {
    type: String,
    default: '',
    maxlength: 255
  },
  status: {
    type: String,
    enum: ['active', 'disabled'],
    default: 'active'
  },
  downloads: {
    type: Number,
    default: 0
  },
  createdAt: {
    type: Date,
    default: Date.now
  },
  updatedAt: {
    type: Date,
    default: Date.now
  }
});

appFileSchema.index({ app: 1, name: 1 }, { unique: true });

module.exports = mongoose.model('AppFile', appFileSchema);
