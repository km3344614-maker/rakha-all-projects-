/**
 * RAKHA REVIEWS - Official Discord Reviews Bot
 * Token: MTU0NzY4OTQxMTg1NDk5MTM3Mg.GuUcAH.hff10DLvfkqxzDnW0AKpleO1JCfqeZe-48x9IQ
 * Reviews Channel: 1532195725688180857
 * Client ID: 1547689411854991372
 */

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActivityType,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const express = require('express');
const cors = require('cors');

// 1. Configuration
const configPath = path.join(__dirname, 'config.json');
let config = {
  botToken: process.env.REVIEWS_BOT_TOKEN || 'MTU0NzY4OTQxMTg1NDk5MTM3Mg.GuUcAH.hff10DLvfkqxzDnW0AKpleO1JCfqeZe-48x9IQ',
  clientId: '1547689411854991372',
  reviewsChannelId: '1532195725688180857',
  apiPort: process.env.REVIEWS_PORT || 3001
};

if (fs.existsSync(configPath)) {
  try {
    const fileConf = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    config = { ...config, ...fileConf };
  } catch (e) {}
}

// 2. Reviews Storage
const dbPath = path.join(__dirname, 'reviews.json');
let reviewsDb = [];
if (fs.existsSync(dbPath)) {
  try { reviewsDb = JSON.parse(fs.readFileSync(dbPath, 'utf8')); } catch { reviewsDb = []; }
}
function saveReviews() {
  try { fs.writeFileSync(dbPath, JSON.stringify(reviewsDb, null, 2), 'utf8'); } catch (e) {}
}

// 3. Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent
  ]
});

client.once('ready', async () => {
  console.log(`======================================================`);
  console.log(`? RAKHA REVIEWS BOT ONLINE AS: ${client.user.tag}`);
  console.log(`• Reviews Channel: ${config.reviewsChannelId}`);
  console.log(`======================================================`);

  client.user.setPresence({
    activities: [{ name: '? ??????? ??????? | RAKHA TWEAKS V3', type: ActivityType.Watching }],
    status: 'online'
  });

  // Register slash command
  try {
    const rest = new REST({ version: '10' }).setToken(config.botToken);
    const commands = [
      new SlashCommandBuilder()
        .setName('reviews-stats')
        .setDescription('??? ???????? ??????? ??????? ?? RAKHA TWEAKS')
    ];
    await rest.put(Routes.applicationCommands(config.clientId), { body: commands });
  } catch (err) {
    console.warn('Slash command registration:', err.message);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;
  if (interaction.commandName === 'reviews-stats') {
    const total = reviewsDb.length;
    const sum = reviewsDb.reduce((acc, r) => acc + (parseInt(r.rating) || 5), 0);
    const avg = total > 0 ? (sum / total).toFixed(1) : '5.0';

    const embed = new EmbedBuilder()
      .setTitle('?? ???????? ??????? RAKHA TWEAKS')
      .setDescription(
        `?? **??? ???? ???????? ??????? ???????**\n\n` +
        `• **?????? ????????? ????????**: \`${total}\` ?????\n` +
        `• **????? ??????? ?????**: ? **${avg} / 5**\n` +
        `• **???? ?????**: ?? ???? ????? ????? 24/7`
      )
      .setColor(0x00FF88)
      .setFooter({ text: 'RAKHA REVIEWS • Official Feedback System' })
      .setTimestamp();

    await interaction.reply({ embeds: [embed] });
  }
});

// 4. Function to Dispatch Review to Discord
async function dispatchReviewEmbed(reviewData) {
  const { key, user, rating, reviewText, avatar } = reviewData || {};
  if (!reviewText || !reviewText.trim()) {
    throw new Error('Review text is required');
  }

  const numRating = Math.max(1, Math.min(5, parseInt(rating) || 5));
  const stars = '?'.repeat(numRating);
  const userAvatar = (avatar && String(avatar).startsWith('http'))
    ? avatar
    : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

  const embed = new EmbedBuilder()
    .setAuthor({
      name: `${user || '???? RAKHA'} // Verified Client`,
      iconURL: userAvatar
    })
    .setTitle(`?? ????? ???? ???? // NEW VERIFIED REVIEW!`)
    .setDescription(
      `?? **?? ???????:**\n\`\`\`\n${reviewText.trim()}\n\`\`\`\n` +
      `• **???????**: ${stars} (${numRating}/5)\n` +
      `• **??????**: **${user || '???? RAKHA'}**\n` +
      `• **??????**: ??? **Verified Customer**\n` +
      `• **???????**: <t:${Math.floor(Date.now() / 1000)}:F>`
    )
    .setThumbnail(userAvatar)
    .setColor(0x00FF88)
    .setFooter({ text: 'RAKHA REVIEWS • Real-time Feedback Engine', iconURL: userAvatar })
    .setTimestamp();

  // Send to reviews channel
  const ch = await client.channels.fetch(config.reviewsChannelId);
  if (!ch || !ch.isTextBased()) {
    throw new Error(`Reviews channel ${config.reviewsChannelId} not found`);
  }

  const sentMsg = await ch.send({ embeds: [embed] });
  // Add auto reactions
  await sentMsg.react('?').catch(() => {});
  await sentMsg.react('??').catch(() => {});

  // Save to DB
  reviewsDb.push({
    id: sentMsg.id,
    key: key || 'CLIENT-APP',
    user: user || 'Rakha Client',
    rating: numRating,
    reviewText: reviewText.trim(),
    avatar: userAvatar,
    createdAt: new Date().toISOString()
  });
  saveReviews();

  return { success: true, messageId: sentMsg.id };
}

// 5. Express API for App / Web Submission
const apiApp = express();
apiApp.use(cors());
apiApp.use(express.json());

apiApp.get('/api/health', (req, res) => {
  res.json({
    status: 'ONLINE',
    bot: 'RAKHA REVIEWS',
    channel: config.reviewsChannelId,
    totalReviews: reviewsDb.length
  });
});

apiApp.get('/api/reviews', (req, res) => {
  const total = reviewsDb.length;
  const sum = reviewsDb.reduce((acc, r) => acc + (parseInt(r.rating) || 5), 0);
  const avg = total > 0 ? (sum / total).toFixed(1) : '5.0';
  res.json({ total, averageRating: avg, reviews: reviewsDb.slice(-50).reverse() });
});

apiApp.post('/api/submit-review', async (req, res) => {
  try {
    const result = await dispatchReviewEmbed(req.body);
    res.json({ success: true, message: 'Review sent directly via RAKHA REVIEWS bot!', ...result });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

// Start bot
client.login(config.botToken).catch(err => {
  console.error('Failed to login RAKHA REVIEWS bot:', err.message);
});

// Start API server if running standalone
if (require.main === module) {
  apiApp.listen(config.apiPort, '0.0.0.0', () => {
    console.log(`[Reviews API] Listening on port ${config.apiPort}`);
  });
}

module.exports = { client, dispatchReviewEmbed, apiApp };
