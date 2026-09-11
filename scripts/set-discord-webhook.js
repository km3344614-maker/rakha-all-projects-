require('dotenv').config();
const mongoose = require('mongoose');
const Application = require('../models/Application');

const url = process.argv[2];
if (!url || !url.startsWith('https://discord.com/api/webhooks/')) {
  console.error('Usage: node scripts/set-discord-webhook.js <webhookUrl>');
  process.exit(1);
}

(async () => {
  await mongoose.connect(process.env.MONGODB_URI || process.env.MONGO_URI);
  const r = await Application.updateMany({}, { $set: { discordWebhookUrl: url } });
  console.log('updated', r.modifiedCount, 'app(s)');
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e.message);
  process.exit(1);
});
