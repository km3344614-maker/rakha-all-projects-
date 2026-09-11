const axios = require('axios');

const url = process.argv[2];
if (!url || !url.startsWith('https://discord.com/api/webhooks/')) {
  console.error('Usage: node scripts/test-discord-webhook.js <webhookUrl>');
  process.exit(1);
}

axios
  .post(url, {
    embeds: [
      {
        title: 'Rakha Auth Connected',
        description: 'Webhook linked successfully.',
        color: 0xffffff,
        timestamp: new Date().toISOString(),
        footer: { text: 'RakhaAuth Notifications' },
      },
    ],
  })
  .then((r) => console.log('ok', r.status))
  .catch((e) => {
    console.error('fail', e.response?.status || e.message);
    process.exit(1);
  });
