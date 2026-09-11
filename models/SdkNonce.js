const mongoose = require('mongoose');

const sdkNonceSchema = new mongoose.Schema({
  _id: { type: String, required: true },
  expiresAt: { type: Date, required: true },
});

sdkNonceSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model('SdkNonce', sdkNonceSchema);
