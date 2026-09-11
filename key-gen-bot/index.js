/**
 * RAKHA KEY GEN - Official Discord License Management Bot
 * By: rakha
 * Support: mohamed
 * Color Theme: Pure Cyber White (0xFFFFFF)
 * Language: Arabic (اللغة العربية)
 */

const {
  Client,
  GatewayIntentBits,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  AttachmentBuilder,
  WebhookClient,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const express = require('express');
const cors = require('cors');

process.on('uncaughtException', (err) => {
  console.warn('[Bot Process] Handled exception:', err.message);
});

process.on('unhandledRejection', (reason) => {
  console.warn('[Bot Process] Handled rejection:', reason);
});

// 1. Load Configuration
const configPath = path.join(__dirname, 'config.json');
let config = {};
try {
  config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error('Failed to load config.json:', e);
  process.exit(1);
}

// 2. Database Setup
const dbPath = path.join(__dirname, 'database.json');
let db = { keys: {} };
if (fs.existsSync(dbPath)) {
  try {
    db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
  } catch {
    db = { keys: {} };
  }
}

function saveDB() {
  fs.writeFileSync(dbPath, JSON.stringify(db, null, 2), 'utf8');
}

function generateRandomKey() {
  const seg1 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const seg2 = crypto.randomBytes(2).toString('hex').toUpperCase();
  const seg3 = crypto.randomBytes(2).toString('hex').toUpperCase();
  return `RAKHA-${seg1}-${seg2}-${seg3}`;
}

// 3. Webhook Setup
let webhookClient = null;
if (config.logWebhook && config.logWebhook.startsWith('https://discord.com/api/webhooks/')) {
  try {
    webhookClient = new WebhookClient({ url: config.logWebhook });
  } catch (e) {
    console.warn('Invalid Webhook URL:', e.message);
  }
}

async function sendWebhookLog(embed) {
  if (!webhookClient) return;
  try {
    await webhookClient.send({
      username: 'RAKHA KEY GEN // السجلات',
      avatarURL: 'https://cdn.discordapp.com/embed/avatars/0.png',
      embeds: [embed]
    });
  } catch (err) {
    console.warn('Webhook error:', err.message);
  }
}

// 4. Discord Client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages
  ]
});

const bannerPath = path.join(__dirname, 'assets', 'banner.png');

// 5. Post Dashboards Function (All in White & Arabic)
async function postDashboards() {
  console.log('[Bot] جاري نشر وتحديث اللوحات باللغة العربية واللون الأبيض...');

  const makeBanner = () => fs.existsSync(bannerPath) ? new AttachmentBuilder(bannerPath, { name: 'banner.png' }) : null;

  // --- A. غرفة توليد المفاتيح (Generate Room: 1545060611740668046) ---
  try {
    const ch = await client.channels.fetch(config.channels.generate);
    if (ch) {
      const banner = makeBanner();
      const embed = new EmbedBuilder()
        .setTitle('⚡ لوحة توليد المفاتيح // RAKHA KEY GEN')
        .setDescription(
          `👑 **نظام توليد وإدارة مفاتيح رخص RAKHA STORE**\n` +
          `• **بواسطة**: رخا (rakha)\n` +
          `• **الدعم الفني**: محمد (mohamed)\n\n` +
          `اضغط على الزر بالأسفل لتوليد مفتاح جديد للعميل.\n` +
          `سيتم إرسال المفتاح تلقائياً في الخاص (DM) وتوثيقه في روم السجلات فوراً!`
        )
        .setColor(0xFFFFFF) // Pure White
        .setImage('attachment://banner.png')
        .setFooter({ text: 'RAKHA STORE • نظام التراخيص الرسمي' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_gen_key')
          .setLabel('⚡ توليد مفتاح جديد')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔑')
      );

      await ch.send({ embeds: [embed], components: [row], files: banner ? [banner] : [] });
      console.log('✔ تم نشر لوحة التوليد في', config.channels.generate);
    }
  } catch (e) { console.warn('خطأ في نشر لوحة التوليد:', e.message); }

  // --- B. غرفة التفعيل (Enable Room: 1545062252359716924) ---
  try {
    const ch = await client.channels.fetch(config.channels.enable);
    if (ch) {
      const banner = makeBanner();
      const embed = new EmbedBuilder()
        .setTitle('🟢 لوحة تفعيل المفاتيح // ENABLE KEY')
        .setDescription(
          `👑 **نظام تفعيل وإعادة تشغيل المفاتيح**\n` +
          `• **بواسطة**: رخا (rakha)\n` +
          `• **الدعم الفني**: محمد (mohamed)\n\n` +
          `اضغط على الزر بالأسفل لتفعيل أو إعادة تشغيل مفتاح معطل أو متوقف.\n` +
          `سيتم إعادة تفعيل المفتاح فوراً داخل التطبيق وإشعار العميل في الخاص!`
        )
        .setColor(0xFFFFFF) // Pure White
        .setImage('attachment://banner.png')
        .setFooter({ text: 'RAKHA STORE • نظام التراخيص الرسمي' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_enable_key')
          .setLabel('🟢 تفعيل المفتاح')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('✅')
      );

      await ch.send({ embeds: [embed], components: [row], files: banner ? [banner] : [] });
      console.log('✔ تم نشر لوحة التفعيل في', config.channels.enable);
    }
  } catch (e) { console.warn('خطأ في نشر لوحة التفعيل:', e.message); }

  // --- C. غرفة التعطيل (Disable Room: 1545062136311586826) ---
  try {
    const ch = await client.channels.fetch(config.channels.disable);
    if (ch) {
      const banner = makeBanner();
      const embed = new EmbedBuilder()
        .setTitle('🚫 لوحة تعطيل المفاتيح // DISABLE KEY')
        .setDescription(
          `👑 **نظام تعطيل وإلغاء المفاتيح**\n` +
          `• **بواسطة**: رخا (rakha)\n` +
          `• **الدعم الفني**: محمد (mohamed)\n\n` +
          `اضغط على الزر بالأسفل لتعطيل وإلغاء رخصة عميل نهائياً.\n` +
          `سيتم حظر المفتاح فوراً داخل التطبيق ولن يتمكن من تشغيل التعديلات!`
        )
        .setColor(0xFFFFFF) // Pure White
        .setImage('attachment://banner.png')
        .setFooter({ text: 'RAKHA STORE • نظام التراخيص الرسمي' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_disable_key')
          .setLabel('🚫 تعطيل المفتاح')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔒')
      );

      await ch.send({ embeds: [embed], components: [row], files: banner ? [banner] : [] });
      console.log('✔ تم نشر لوحة التعطيل في', config.channels.disable);
    }
  } catch (e) { console.warn('خطأ في نشر لوحة التعطيل:', e.message); }

  // --- D. غرفة الإيقاف المؤقت (Stop Room: 1545062281090564206) ---
  try {
    const ch = await client.channels.fetch(config.channels.stop);
    if (ch) {
      const banner = makeBanner();
      const embed = new EmbedBuilder()
        .setTitle('⏸️ لوحة الإيقاف المؤقت // STOP KEY')
        .setDescription(
          `👑 **نظام تجميد وإيقاف المفاتيح المؤقت**\n` +
          `• **بواسطة**: رخا (rakha)\n` +
          `• **الدعم الفني**: محمد (mohamed)\n\n` +
          `اضغط على الزر بالأسفل لإيقاف مفتاح وتجميده مؤقتاً لمدة محددة.`
        )
        .setColor(0xFFFFFF) // Pure White
        .setImage('attachment://banner.png')
        .setFooter({ text: 'RAKHA STORE • نظام التراخيص الرسمي' })
        .setTimestamp();

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('btn_stop_key')
          .setLabel('⏸️ إيقاف المفتاح')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('⏱️')
      );

      await ch.send({ embeds: [embed], components: [row], files: banner ? [banner] : [] });
      console.log('✔ تم نشر لوحة الإيقاف المؤقت في', config.channels.stop);
    }
  } catch (e) { console.warn('خطأ في نشر لوحة الإيقاف:', e.message); }
}

// 6. Interaction Handlers (الأزرار ونوافذ الإدخال باللغة العربية واللون الأبيض)
client.on('interactionCreate', async (interaction) => {
  // الأوامر
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'setup-dashboards') {
      await interaction.deferReply({ ephemeral: true });
      await postDashboards();
      return interaction.editReply({ content: '✅ تم نشر كافة اللوحات التفاعلية في الرومات المحددة بنجاح!' });
    }

    if (interaction.commandName === 'clear-dashboards' || interaction.commandName === 'delete-dashboards') {
      await interaction.deferReply({ ephemeral: true });
      const targetChannels = [
        config.channels.generate,
        config.channels.enable,
        config.channels.disable,
        config.channels.stop
      ];
      let deletedTotal = 0;
      for (const chId of targetChannels) {
        try {
          const ch = await client.channels.fetch(chId);
          if (ch && ch.isTextBased()) {
            const msgs = await ch.messages.fetch({ limit: 50 });
            for (const m of msgs.values()) {
              if (m.author.id === client.user.id) {
                await m.delete().catch(() => {});
                deletedTotal++;
              }
            }
          }
        } catch (err) {
          console.warn('Could not clear channel:', chId, err.message);
        }
      }
      return interaction.editReply({ content: `🗑️ تم مسح وحذف كافة لوحات التحكم القديمة بنجاح! (عدد الرسائل المحذوفة: ${deletedTotal})` });
    }

    if (interaction.commandName === 'clear-all-keys' || interaction.commandName === 'clear') {
      const count = Object.keys(db.keys || {}).length;
      db.keys = {};
      saveDB();

      const clearEmbed = new EmbedBuilder()
        .setTitle('🗑️ تم مسح جميع المفاتيح بنجاح // CLEARED ALL KEYS')
        .setDescription(
          `👑 **عملية تنظيف وتصفير قاعدة البيانات**\n\n` +
          `• **عدد المفاتيح المحذوفة**: \`${count}\` مفتاح\n` +
          `• **الحالة**: 🟢 تم تصفير قاعدة البيانات بالكامل بنجاح!\n` +
          `• **بواسطة**: <@${interaction.user.id}>\n\n` +
          `يمكنك الآن إصدار وتوليد مفاتيح جديدة.`
        )
        .setColor(0xFFFFFF)
        .setFooter({ text: 'RAKHA STORE • نظام إدارة المفاتيح الرسمي' })
        .setTimestamp();

      return interaction.reply({ embeds: [clearEmbed] });
    }
  }

  // ضغطات الأزرار
  if (interaction.isButton()) {
    // 1. زر توليد مفتاح
    if (interaction.customId === 'btn_gen_key') {
      const modal = new ModalBuilder()
        .setCustomId('modal_gen_key')
        .setTitle('⚡ توليد مفتاح ترخيص جديد');

      const daysInput = new TextInputBuilder()
        .setCustomId('input_days')
        .setLabel('1 - عدد الأيام (المدة)')
        .setPlaceholder('مثال: 30 أو 90 أو 365 أو lifetime')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const nameInput = new TextInputBuilder()
        .setCustomId('input_name')
        .setLabel('2 - اسم العميل')
        .setPlaceholder('مثال: عمر / أحمد')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const userIdInput = new TextInputBuilder()
        .setCustomId('input_userid')
        .setLabel('3 - آيدي العميل في ديسكورد (User ID)')
        .setPlaceholder('مثال: 1545018561846837291')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const avatarInput = new TextInputBuilder()
        .setCustomId('input_avatar')
        .setLabel('4 - رابط صورة العميل (اختياري Custom Photo)')
        .setPlaceholder('رابط مباشر للصورة: https://... (أو اتركه فارغاً)')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);

      modal.addComponents(
        new ActionRowBuilder().addComponents(daysInput),
        new ActionRowBuilder().addComponents(nameInput),
        new ActionRowBuilder().addComponents(userIdInput),
        new ActionRowBuilder().addComponents(avatarInput)
      );

      return interaction.showModal(modal);
    }

    // 2. زر تفعيل مفتاح
    if (interaction.customId === 'btn_enable_key') {
      const modal = new ModalBuilder()
        .setCustomId('modal_enable_key')
        .setTitle('🟢 تفعيل مفتاح ترخيص');

      const keyInput = new TextInputBuilder()
        .setCustomId('input_key_to_enable')
        .setLabel('ضع المفتاح هنا من فضلك :')
        .setPlaceholder('مثال: RAKHA-A1B2-C3D4-E5F6')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
      return interaction.showModal(modal);
    }

    // 3. زر تعطيل مفتاح
    if (interaction.customId === 'btn_disable_key') {
      const modal = new ModalBuilder()
        .setCustomId('modal_disable_key')
        .setTitle('🚫 تعطيل مفتاح ترخيص');

      const keyInput = new TextInputBuilder()
        .setCustomId('input_key_to_disable')
        .setLabel('ضع المفتاح هنا من فضلك :')
        .setPlaceholder('مثال: RAKHA-A1B2-C3D4-E5F6')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(new ActionRowBuilder().addComponents(keyInput));
      return interaction.showModal(modal);
    }

    // 4. زر إيقاف مفتاح
    if (interaction.customId === 'btn_stop_key') {
      const modal = new ModalBuilder()
        .setCustomId('modal_stop_key')
        .setTitle('⏸️ إيقاف / تجميد مفتاح');

      const keyInput = new TextInputBuilder()
        .setCustomId('input_key_to_stop')
        .setLabel('ضع المفتاح هنا من فضلك :')
        .setPlaceholder('مثال: RAKHA-A1B2-C3D4-E5F6')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      const timeInput = new TextInputBuilder()
        .setCustomId('input_stop_time')
        .setLabel('مدة الإيقاف المطلوبة :')
        .setPlaceholder('مثال: ساعتين / يوم / 3 أيام')
        .setStyle(TextInputStyle.Short)
        .setRequired(true);

      modal.addComponents(
        new ActionRowBuilder().addComponents(keyInput),
        new ActionRowBuilder().addComponents(timeInput)
      );
      return interaction.showModal(modal);
    }
  }

  // تسليم النوافذ (Modals Submit)
  if (interaction.isModalSubmit()) {
    // A. توليد المفتاح
    if (interaction.customId === 'modal_gen_key') {
      const days = interaction.fields.getTextInputValue('input_days').trim();
      const name = interaction.fields.getTextInputValue('input_name').trim();
      const userId = interaction.fields.getTextInputValue('input_userid').trim();
      let customAvatar = '';
      try {
        customAvatar = interaction.fields.getTextInputValue('input_avatar')?.trim() || '';
      } catch (e) {}

      const newKey = generateRandomKey();
      const createdDate = new Date().toISOString();

      db.keys[newKey] = {
        key: newKey,
        name,
        days,
        userId,
        customAvatar: customAvatar || null,
        status: 'active',
        createdAt: createdDate,
        generatedBy: interaction.user.tag
      };
      saveDB();

      // إرسال المفتاح في الخاص للعميل
      let dmSent = false;
      try {
        const targetUser = await client.users.fetch(userId);
        if (targetUser) {
          const dmEmbed = new EmbedBuilder()
            .setTitle('👑 RAKHA TWEAKS // مفتاح الترخيص الخاص بك')
            .setDescription(
              `مرحباً بك يا **${name}**، تم إنشاء وتفعيل مفتاحك الرسمي لتطبيق **RAKHA TWEAKS**!\n\n` +
              `🔑 **مفتاح الترخيص**: \`${newKey}\`\n` +
              `⏳ **المدة**: \`${days}\` يوم\n` +
              `👤 **المالك**: <@${userId}>\n\n` +
              `**طريقة الاستخدام:**\n` +
              `1. افتح تطبيق **Rakha Tweaks** على جهازك.\n` +
              `2. الصق المفتاح واضغط **ACTIVATE**.\n` +
              `3. استمتع بأقصى أداء وثبات واستجابة لجهازك!\n\n` +
              `• **بواسطة**: رخا (rakha)\n` +
              `• **الدعم الفني**: محمد (mohamed)`
            )
            .setColor(0xFFFFFF)
            .setFooter({ text: 'RAKHA STORE • نظام التراخيص الرسمي' })
            .setTimestamp();

          await targetUser.send({ embeds: [dmEmbed] });
          dmSent = true;
        }
      } catch (dmErr) {
        console.warn('تعذر إرسال رسالة خاصة للعميل:', dmErr.message);
      }

      // رسالة السجل العامة الظاهرة للجميع في روم السجلات (1545062072688189540)
      const publicEmbed = new EmbedBuilder()
        .setTitle('✅ تم توليد المفتاح بنجاح!')
        .setDescription(
          `🔑 **المفتاح**: \`${newKey}\`\n` +
          `👤 **العميل**: **${name}** (<@${userId}>)\n` +
          `⏳ **المدة**: \`${days}\` يوم\n` +
          `📬 **حالة الخاص**: ${dmSent ? '✔ تم إرسال المفتاح في الخاص للعميل!' : '⚠️ الخاص مغلق عند العميل'}\n` +
          `🛡️ **الحالة**: 🟢 **نشط (ACTIVE)**\n` +
          `👮 **بواسطة**: <@${interaction.user.id}>`
        )
        .setColor(0xFFFFFF)
        .setFooter({ text: 'By: rakha | Support: mohamed' })
        .setTimestamp();

      // نشر الرسالة في روم السجلات العامة 1545062072688189540 (تظهر للجميع ليست مخفية)
      try {
        const logChannel = await client.channels.fetch(config.channels.logs);
        if (logChannel) {
          await logChannel.send({ embeds: [publicEmbed] });
        }
      } catch (logErr) {
        console.warn('خطأ في إرسال السجل لروم السجلات:', logErr.message);
      }

      // إغلاق النافذة بصمت تام ليبقى روم التوليد نظيفاً بلوحة التحكم فقط بدون أي رسائل زائدة
      return interaction.deferUpdate();
    }

    // B. تفعيل المفتاح
    if (interaction.customId === 'modal_enable_key') {
      const keyToEnable = interaction.fields.getTextInputValue('input_key_to_enable').trim().toUpperCase();
      const record = db.keys[keyToEnable];

      if (!record) {
        return interaction.reply({ content: `❌ المفتاح \`${keyToEnable}\` غير موجود في قاعدة البيانات!`, ephemeral: true });
      }

      record.status = 'active';
      record.enabledAt = new Date().toISOString();
      record.enabledBy = interaction.user.tag;
      saveDB();

      // إرسال إشعار للعميل في الخاص
      if (record.userId) {
        try {
          const targetUser = await client.users.fetch(record.userId);
          if (targetUser) {
            const enableEmbed = new EmbedBuilder()
              .setTitle('🟢 RAKHA TWEAKS // تم تفعيل رخصتك')
              .setDescription(
                `مرحباً **${record.name}**، تم إعادة تفعيل رخصتك \`${keyToEnable}\` بنجاح!\n` +
                `يمكنك الآن استخدام التطبيق بشكل طبيعي.`
              )
              .setColor(0xFFFFFF)
              .setTimestamp();
            await targetUser.send({ embeds: [enableEmbed] });
          }
        } catch {}
      }

      // نشر في روم السجلات
      const enableLog = new EmbedBuilder()
        .setTitle('🟢 [تم تفعيل المفتاح] RAKHA KEY GEN')
        .setDescription(
          `🔑 **المفتاح**: \`${keyToEnable}\`\n` +
          `👤 **العميل**: **${record.name}** (<@${record.userId}>)\n` +
          `🛡️ **الحالة الجديدة**: 🟢 **نشط (ACTIVE)**\n` +
          `👮 **المسؤول**: <@${interaction.user.id}>`
        )
        .setColor(0xFFFFFF)
        .setFooter({ text: 'By: rakha | Support: mohamed' })
        .setTimestamp();

      try {
        const logChannel = await client.channels.fetch(config.channels.logs);
        if (logChannel) await logChannel.send({ embeds: [enableLog] });
      } catch {}

      return interaction.deferUpdate();
    }

    // C. تعطيل المفتاح
    if (interaction.customId === 'modal_disable_key') {
      const keyToDisable = interaction.fields.getTextInputValue('input_key_to_disable').trim().toUpperCase();
      const record = db.keys[keyToDisable];

      if (!record) {
        return interaction.reply({ content: `❌ المفتاح \`${keyToDisable}\` غير موجود في قاعدة البيانات!`, ephemeral: true });
      }

      record.status = 'disabled';
      record.disabledAt = new Date().toISOString();
      record.disabledBy = interaction.user.tag;
      saveDB();

      // إشعار الخاص
      if (record.userId) {
        try {
          const targetUser = await client.users.fetch(record.userId);
          if (targetUser) {
            const disEmbed = new EmbedBuilder()
              .setTitle('🚫 RAKHA TWEAKS // تم تعطيل رخصتك')
              .setDescription(
                `مرحباً **${record.name}**، تم تعطيل وإلغاء رخصتك \`${keyToDisable}\`.\n` +
                `للمزيد من التفاصيل يرجى التواصل مع الدعم: @mohamed أو @rakha`
              )
              .setColor(0xFFFFFF)
              .setTimestamp();
            await targetUser.send({ embeds: [disEmbed] });
          }
        } catch {}
      }

      // نشر في روم السجلات
      const disLog = new EmbedBuilder()
        .setTitle('🚫 [تم تعطيل المفتاح] RAKHA KEY GEN')
        .setDescription(
          `🔑 **المفتاح**: \`${keyToDisable}\`\n` +
          `👤 **العميل**: **${record.name}** (<@${record.userId}>)\n` +
          `🛡️ **الحالة الجديدة**: 🔴 **معطل (DISABLED)**\n` +
          `👮 **المسؤول**: <@${interaction.user.id}>`
        )
        .setColor(0xFFFFFF)
        .setFooter({ text: 'By: rakha | Support: mohamed' })
        .setTimestamp();

      try {
        const logChannel = await client.channels.fetch(config.channels.logs);
        if (logChannel) await logChannel.send({ embeds: [disLog] });
      } catch {}

      return interaction.deferUpdate();
    }

    // D. إيقاف المفتاح
    if (interaction.customId === 'modal_stop_key') {
      const keyToStop = interaction.fields.getTextInputValue('input_key_to_stop').trim().toUpperCase();
      const stopTime = interaction.fields.getTextInputValue('input_stop_time').trim();
      const record = db.keys[keyToStop];

      if (!record) {
        return interaction.reply({ content: `❌ المفتاح \`${keyToStop}\` غير موجود في قاعدة البيانات!`, ephemeral: true });
      }

      record.status = 'paused';
      record.pausedDuration = stopTime;
      record.pausedAt = new Date().toISOString();
      record.pausedBy = interaction.user.tag;
      saveDB();

      // إشعار الخاص
      if (record.userId) {
        try {
          const targetUser = await client.users.fetch(record.userId);
          if (targetUser) {
            const pauseEmbed = new EmbedBuilder()
              .setTitle('⏸️ RAKHA TWEAKS // تم إيقاف رخصتك مؤقتاً')
              .setDescription(
                `مرحباً **${record.name}**، تم تجميد رخصتك \`${keyToStop}\` مؤقتاً.\n` +
                `⏱️ **مدة الإيقاف**: \`${stopTime}\`\n\n` +
                `للاستفسار يرجى التواصل مع الدعم: @mohamed أو @rakha`
              )
              .setColor(0xFFFFFF)
              .setTimestamp();
            await targetUser.send({ embeds: [pauseEmbed] });
          }
        } catch {}
      }

      // نشر في روم السجلات
      const stopLog = new EmbedBuilder()
        .setTitle('⏸️ [تم إيقاف المفتاح] RAKHA KEY GEN')
        .setDescription(
          `🔑 **المفتاح**: \`${keyToStop}\`\n` +
          `👤 **العميل**: **${record.name}** (<@${record.userId}>)\n` +
          `⏱️ **مدة الإيقاف**: \`${stopTime}\`\n` +
          `🛡️ **الحالة الجديدة**: 🟡 **متوقف مؤقتاً (PAUSED)**\n` +
          `👮 **المسؤول**: <@${interaction.user.id}>`
        )
        .setColor(0xFFFFFF)
        .setFooter({ text: 'By: rakha | Support: mohamed' })
        .setTimestamp();

      try {
        const logChannel = await client.channels.fetch(config.channels.logs);
        if (logChannel) await logChannel.send({ embeds: [stopLog] });
      } catch {}

      return interaction.deferUpdate();
    }
  }
});

// 7. API Server for App
const apiApp = express();
apiApp.use(cors());
apiApp.use(express.json());

apiApp.post('/api/verify-license', async (req, res) => {
  const { key, hwid } = req.body || {};
  if (!key) return res.json({ success: false, message: 'لم يتم إدخال مفتاح ترخيص.' });

  try {
    if (fs.existsSync(dbPath)) {
      db = JSON.parse(fs.readFileSync(dbPath, 'utf8'));
    }
  } catch {}

  const record = db.keys[key.trim().toUpperCase()];
  if (!record) return res.json({ success: false, message: 'مفتاح الترخيص غير صالح.' });
  if (record.status === 'disabled') return res.json({ success: false, message: 'تم تعطيل هذا المفتاح من قبل الإدارة.' });
  if (record.status === 'paused') return res.json({ success: false, message: `هذا المفتاح متوقف مؤقتاً (${record.pausedDuration || 'صيانة'}).` });

  if (!record.hwid && hwid) {
    record.hwid = hwid;
    saveDB();
  } else if (record.hwid && hwid && record.hwid !== hwid) {
    return res.json({ success: false, message: 'هذا المفتاح مقفل على جهاز آخر.' });
  }

  // Fetch Discord User info if userId exists
  let discordUser = null;
  if (record.userId) {
    try {
      const u = await client.users.fetch(record.userId);
      if (u) {
        discordUser = {
          id: u.id,
          username: u.username,
          displayName: u.globalName || u.username,
          avatar: record.customAvatar || u.displayAvatarURL({ extension: 'png', size: 256 })
        };
      }
    } catch (e) {
      console.warn('Failed to fetch Discord user for key:', e.message);
    }
  }

  if (!discordUser && (record.name || record.customAvatar)) {
    discordUser = {
      id: record.userId || 'USER',
      username: record.name || 'Rakha Client',
      displayName: record.name || 'Rakha Client',
      avatar: record.customAvatar || 'https://cdn.discordapp.com/embed/avatars/0.png'
    };
  } else if (discordUser && record.customAvatar) {
    discordUser.avatar = record.customAvatar;
  }

  return res.json({
    success: true,
    message: 'المفتاح نشط ومفعل بنجاح!',
    data: {
      key: record.key,
      name: record.name,
      days: record.days,
      status: record.status,
      product: record.product || 'all',
      discordUser: discordUser
    }
  });
});

// Submit Review Directly to Discord (Webhook + Log Channel)
apiApp.post('/api/submit-review', async (req, res) => {
  try {
    const { key, user, rating, reviewText, avatar } = req.body || {};
    if (!reviewText || !reviewText.trim()) {
      return res.status(400).json({ success: false, message: 'Review text is required.' });
    }

    const userAvatar = (avatar && String(avatar).startsWith('http'))
      ? avatar
      : 'https://cdn-icons-png.flaticon.com/512/3135/3135715.png';

    const stars = '⭐'.repeat(Math.max(1, Math.min(5, parseInt(rating) || 5)));
    const embed = new EmbedBuilder()
      .setTitle('🌟 تقييم ورأي جديد // NEW CLIENT REVIEW')
      .setDescription(
        `💬 **نص التقييم:**\n\`\`\`\n${reviewText.trim()}\n\`\`\`\n` +
        `• **التقييم**: ${stars} (${rating || 5}/5)\n` +
        `• **العميل**: **${user || 'عميل RAKHA'}**\n` +
        `• **التاريخ**: <t:${Math.floor(Date.now() / 1000)}:F>`
      )
      .setThumbnail(userAvatar)
      .setColor(0x00D2FF)
      .setFooter({ text: 'RAKHA TWEAKS • Real-time Feedback Engine', iconURL: userAvatar })
      .setTimestamp();

    // 1. Send via Webhook
    await sendWebhookLog(embed);

    // 2. Send directly to reviews room (1532195725688180857) USING REVIEWS BOT
    try {
      const reviewChId = config.channels?.reviews || '1532195725688180857';
      const https = require('https');
      const reviewsBotToken = "MTU0NzY4OTQxMTg1NDk5MTM3Mg.GuUcAH.hff10DLvfkqxzDnW0AKpleO1JCfqeZe-48x9IQ";
      const msgData = JSON.stringify({ embeds: [embed.toJSON()] });
      const postReq = https.request({
        hostname: 'discord.com',
        path: `/api/v10/channels/${reviewChId}/messages`,
        method: 'POST',
        headers: {
          'Authorization': `Bot ${reviewsBotToken}`,
          'Content-Type': 'application/json',
          'Content-Length': Buffer.byteLength(msgData),
          'User-Agent': 'RakhaReviewsBot (https://rakha.me, 1.0.0)'
        }
      });
      postReq.on('error', (err) => console.warn('Reviews bot post error:', err));
      postReq.write(msgData);
      postReq.end();
    } catch (e) {
      console.warn('Could not send review via reviews bot:', e.message);
    }

    // 3. Send to logs channel if available
    try {
      if (config.channels?.logs) {
        const logCh = await client.channels.fetch(config.channels.logs);
        if (logCh) await logCh.send({ embeds: [embed] });
      }
    } catch (e) {
      console.warn('Could not send review to log channel:', e.message);
    }

    return res.json({ success: true, message: 'Review sent directly to Discord successfully!' });
  } catch (err) {
    console.error('Error handling submit-review:', err);
    return res.status(500).json({ success: false, message: 'Failed to submit review: ' + err.message });
  }
});

apiApp.post('/api/deliver-key', async (req, res) => {
  try {
    const { userId, key, days = '30', clientName = 'Rakha Client' } = req.body || {};
    if (!userId || !key) {
      return res.status(400).json({ success: false, message: 'userId and key are required' });
    }

    const cleanId = String(userId).replace(/[^0-9]/g, '');
    if (!cleanId) {
      return res.status(400).json({ success: false, message: 'Invalid Discord User ID' });
    }

    const targetUser = await client.users.fetch(cleanId).catch(() => null);
    if (!targetUser) {
      return res.status(404).json({ success: false, message: 'Discord user not found' });
    }

    const isLifetime = String(days).toLowerCase().includes('life') || days === 0 || days === '0';
    const embed = new EmbedBuilder()
      .setTitle('👑 RAKHA TWEAKS V3 • مفتاح التفعيل الخاص بك')
      .setDescription(
        `مرحباً بك يا **${targetUser.username || clientName}**!\n` +
        `تم إصدار ترخيصك بنجاح من متجر رخا الرسمي.\n\n` +
        `🔑 **مفتاح التفعيل (License Key):**\n\`\`\`\n${key}\n\`\`\`\n` +
        `⏳ **المدة:** \`${isLifetime ? '♾️ Lifetime VIP (مدى الحياة)' : `${days} يوم`}\`\n` +
        `🛡️ **الحالة:** 🟢 **نشط وموثق (Active)\`\n` +
        `⚡ **التأخير:** \`0.0ms True Latency Reduction\`\n\n` +
        `> ⚠️ *ملاحظة: هذا الترخيص مربوط بجهازك (HWID-Locked). لا تشاركه مع أي شخص منعاً للإيقاف التلقائي.*`
      )
      .setColor(0xFFFFFF)
      .setFooter({ text: 'Rakha Services • Official License Delivery Engine' })
      .setTimestamp();

    await targetUser.send({ embeds: [embed] });
    console.log(`[Delivery Bot] Key ${key} sent to ${targetUser.tag} (${cleanId}) in DM`);
    return res.json({ success: true, message: `Key sent to ${targetUser.tag} in DM!` });
  } catch (err) {
    console.error('[Delivery Bot] DM error:', err.message);
    return res.status(500).json({ success: false, message: err.message });
  }
});

apiApp.get('/', (req, res) => {
  res.json({ status: 'ONLINE', bot: 'RAKHA KEY GEN', host: 'rakha-key-gen-bot.509.rip', totalKeys: Object.keys(db.keys).length });
});

apiApp.get('/health', (req, res) => {
  res.status(200).send('OK');
});

const API_PORT = process.env.PORT || config.apiPort || 3000;
apiApp.listen(API_PORT, '0.0.0.0', () => {
  console.log(`[License API] خادم التحقق من التراخيص يعمل على المنفذ ${API_PORT} (0.0.0.0)`);
});

// 8. Ready Event & Auto-Setup Commands
client.once('ready', async () => {
  console.log(`\n======================================================`);
  console.log(`⚡ RAKHA KEY GEN BOT ONLINE AS: ${client.user.tag}`);
  console.log(`• اللون: أبيض ملكي (0xFFFFFF)`);
  console.log(`• اللغة: العربية بالكامل`);
  console.log(`• روم التوليد: ${config.channels.generate}`);
  console.log(`• روم التفعيل: ${config.channels.enable}`);
  console.log(`• روم التعطيل: ${config.channels.disable}`);
  console.log(`• روم الإيقاف: ${config.channels.stop}`);
  console.log(`• روم السجلات العامة: ${config.channels.logs}`);
  console.log(`======================================================\n`);

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(config.botToken);
  try {
    const commands = [
      new SlashCommandBuilder()
        .setName('setup-dashboards')
        .setDescription('نشر لوحات التحكم التفاعلية في الرومات'),
      new SlashCommandBuilder()
        .setName('clear-dashboards')
        .setDescription('مسح وحذف كافة لوحات التحكم التفاعلية القديمة من الرومات'),
      new SlashCommandBuilder()
        .setName('clear-all-keys')
        .setDescription('حذف وتصفير جميع مفاتيح الترخيص من قاعدة البيانات'),
      new SlashCommandBuilder()
        .setName('clear')
        .setDescription('مسح وتصفير جميع مفاتيح الترخيص')
    ];

    await rest.put(
      Routes.applicationCommands(config.clientId),
      { body: commands }
    );
    console.log('✔ تم تسجيل الأوامر: /setup-dashboards و /clear-dashboards و /clear-all-keys و /clear بنجاح!');
  } catch (err) {
    console.warn('Slash command notice:', err.message);
  }
});

client.login(config.botToken);

// Text Command Support: /clear all keys, !clear-dashboards, etc.
client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  const content = message.content.trim().toLowerCase();

  // Command to clear all dashboards
  if (content === '!clear-dashboards' || content === '/clear-dashboards' || content === 'clear dashboards' || content === '!cleardashboards') {
    const targetChannels = [
      config.channels.generate,
      config.channels.enable,
      config.channels.disable,
      config.channels.stop
    ];
    let deletedTotal = 0;
    for (const chId of targetChannels) {
      try {
        const ch = await client.channels.fetch(chId);
        if (ch && ch.isTextBased()) {
          const msgs = await ch.messages.fetch({ limit: 50 });
          for (const m of msgs.values()) {
            if (m.author.id === client.user.id) {
              await m.delete().catch(() => {});
              deletedTotal++;
            }
          }
        }
      } catch (err) {
        console.warn('Could not clear channel:', chId, err.message);
      }
    }
    return message.reply(`🗑️ تم مسح وحذف كافة لوحات التحكم من الرومات بنجاح! (عدد الرسائل المحذوفة: ${deletedTotal})`);
  }

  // Command to clear all keys
  if (content === '/clear all keys' || content === '!clear all keys' || content === 'clear all keys' || content === '/clear-all-keys') {
    const count = Object.keys(db.keys || {}).length;
    db.keys = {};
    saveDB();

    const clearEmbed = new EmbedBuilder()
      .setTitle('🗑️ تم مسح جميع المفاتيح بنجاح // CLEARED ALL KEYS')
      .setDescription(
        `👑 **عملية تنظيف وتصفير قاعدة البيانات**\n\n` +
        `• **عدد المفاتيح المحذوفة**: \`${count}\` مفتاح\n` +
        `• **الحالة**: 🟢 تم تصفير قاعدة البيانات بالكامل بنجاح!\n` +
        `• **بواسطة**: <@${message.author.id}>`
      )
      .setColor(0xFFFFFF)
      .setFooter({ text: 'RAKHA STORE • نظام إدارة المفاتيح الرسمي' })
      .setTimestamp();

    return message.reply({ embeds: [clearEmbed] });
  }
});
