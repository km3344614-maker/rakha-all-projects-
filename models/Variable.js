const mongoose = require('mongoose');
const { wrap, peek, isSealed } = require('../utils/fieldCrypto');

const variableSchema = new mongoose.Schema({
  app: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'Application',
    required: true,
  },
  name: {
    type: String,
    required: true,
    trim: true,
    maxlength: 64,
    match: [/^[A-Za-z][A-Za-z0-9_]*$/, 'Name must start with a letter'],
  },
  value: {
    type: String,
    default: '',
    maxlength: 24576,
  },
  valueType: {
    type: String,
    enum: ['string', 'number', 'boolean', 'json'],
    default: 'string',
  },
  authenticated: {
    type: Boolean,
    default: false,
  },
  createdAt: {
    type: Date,
    default: Date.now,
  },
  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

variableSchema.index({ app: 1, name: 1 }, { unique: true });

variableSchema.pre('save', function () {
  if (this.isModified('value') && this.value && !isSealed(this.value)) {
    this.value = wrap(this.value);
  }
});

const openValue = (_doc, ret) => {
  ret.value = peek(_doc.value);
  delete ret.__v;
  return ret;
};

variableSchema.set('toJSON', { transform: openValue });
variableSchema.set('toObject', { transform: openValue });

module.exports = mongoose.model('Variable', variableSchema);
