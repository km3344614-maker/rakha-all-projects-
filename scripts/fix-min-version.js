#!/usr/bin/env node
/** Set perm app minVersion to match Rakha Perm EXE. */
require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('../models/Application');

const TARGET = process.argv[2] || '4.6';

(async () => {
  if (!process.env.MONGODB_URI) throw new Error('MONGODB_URI required');
  await mongoose.connect(process.env.MONGODB_URI);
  const app = await Application.findOne({ status: { $ne: 'deleted' } }).sort('-createdAt');
  if (!app) throw new Error('no app');
  const before = app.minVersion || '';
  app.minVersion = TARGET;
  if (TARGET) app.version = TARGET;
  await app.save();
  console.log(`App "${app.name}": minVersion ${before || '(empty)'} -> ${TARGET}`);
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message || e);
  process.exit(1);
});
