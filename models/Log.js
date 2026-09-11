const mongoose = require('mongoose');

// Retention period in seconds.  Default: 90 days.
// Override with LOG_RETENTION_DAYS in .env  (0 = keep forever).
const retentionSeconds = () => {
  const days = Number(process.env.LOG_RETENTION_DAYS ?? 90);
  if (!Number.isFinite(days) || days <= 0) return 0;
  return Math.round(days * 86400);
};

const logSchema = new mongoose.Schema({
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true
  },
  action: {
    type: String,
    required: true
  },
  username: String,
  ip: String,
  hwid: String,
  success: {
    type: Boolean,
    default: true
  },
  message: String,
  createdAt: {
    type: Date,
    default: Date.now,
  }
});

logSchema.index({ app: 1, createdAt: -1 });

// TTL index — MongoDB will automatically purge documents older than
// retentionSeconds().  A value of 0 means "never expire" (no TTL index).
// syncLogTtl() is called from server.js after DB connect so that changing
// LOG_RETENTION_DAYS takes effect without a manual db.runCommand.
logSchema.statics.syncLogTtl = async function () {
  const secs = retentionSeconds();
  const collection = this.collection;

  let existing = null;
  try {
    const indexes = await collection.indexes();
    existing = indexes.find(
      (idx) => idx.key && idx.key.createdAt === 1 && idx.expireAfterSeconds !== undefined
    );
  } catch (_) { /* collection may not exist yet on first boot */ }

  // Case 1: retention disabled — drop old TTL index if present
  if (secs === 0) {
    if (existing) {
      await collection.dropIndex(existing.name).catch(() => {});
      console.log('🗑️  Log TTL index removed (LOG_RETENTION_DAYS=0 → keep forever)');
    }
    return;
  }

  // Case 2: TTL index exists with wrong value — recreate it
  if (existing && existing.expireAfterSeconds !== secs) {
    await collection.dropIndex(existing.name).catch(() => {});
    existing = null;
    console.log(`🔄  Log TTL index updated → ${secs}s (${secs / 86400} days)`);
  }

  // Case 3: no TTL index yet — create it
  if (!existing) {
    await collection.createIndex(
      { createdAt: 1 },
      { expireAfterSeconds: secs, background: true }
    );
    console.log(`✅  Log TTL index set to ${secs}s (${secs / 86400} days)`);
  }
};

module.exports = mongoose.model('Log', logSchema);
