const { isDiscordWebhookUrl } = require('./security');

const BRAND = 0xffffff;
const alertCooldown = new Map();

let warnedMissingSecurityWebhook = false;

const securityWebhookUrl = () => String(process.env.DISCORD_SECURITY_WEBHOOK || '').trim();

const JUNK = /^(?:—|-|unknown|n\/a|null|undefined|invalid namespace)$/i;

const clean = (v, max = 180) => {
  const s = String(v || '')
    .replace(/[`\u001b]/g, '')
    .replace(/```/g, '')
    .replace(/\r?\n/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
  if (!s || JUNK.test(s) || /invalid namespace/i.test(s)) return '';
  return s;
};

const tick = (v) => (v ? `\`${v}\`` : '');

const allowAlertBurst = (key) => {
  const now = Date.now();
  const prev = alertCooldown.get(key) || 0;
  if (now - prev < 15_000) return false;
  alertCooldown.set(key, now);
  if (alertCooldown.size > 2000) {
    const cut = now - 60_000;
    for (const [k, t] of alertCooldown) {
      if (t < cut) alertCooldown.delete(k);
    }
  }
  return true;
};

const egyptNow = () => {
  try {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Africa/Cairo',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    }).format(new Date());
  } catch {
    return new Date().toISOString();
  }
};

const field = (name, value, inline = false) => {
  if (!value) return null;
  return { name, value, inline };
};

const lines = (rows) => {
  const out = rows
    .filter((row) => row && row[1])
    .map(([label, value, code]) => `**${label}**  ${code ? tick(value) : value}`);
  return out.length ? out.join('\n') : '';
};

const buildProtectionEmbed = ({ reason, telemetry, ip, appName, appId, version, hasShot }) => {
  const tel = telemetry && typeof telemetry === 'object' ? telemetry : {};
  const why = clean(reason, 120) || 'Unknown signal';
  const winUser = clean(tel.username);
  const license = clean(tel.license);
  const hwid = clean(tel.hwid, 128);
  const host = clean(tel.pc);
  const country = clean(tel.country);
  const city = clean(tel.city);
  const region = clean(tel.region);
  const isp = clean(tel.isp);
  const os = clean(tel.os, 220);
  const cpu = clean(tel.cpu, 220);
  const gpu = clean(tel.gpu, 220);
  const ram = clean(tel.ram, 32);
  const mac = clean(tel.mac, 32);
  const ipVal = clean(tel.ip || ip, 64);
  const place = [city, region, country].filter(Boolean).join(', ');

  // Build description
  const descParts = [
    `> **\`${why}\`**`,
  ];
  if (license) {
    descParts.push('', `🔑 **License:** \`${license}\``);
  }

  const fields = [
    // Row 1: Identity | Network | Location
    field('👤  Identity', lines([
      ['User', winUser, true],
      ['PC', host, true],
    ]), true),
    field('🌐  Network', lines([
      ['IP', ipVal, true],
      ['ISP', isp, false],
    ]), true),
    field('📍  Location', place || null, true),
    // Row 2: System | Hardware | MAC
    field('🖥️  System', lines([
      ['OS', os, false],
      ['CPU', cpu, false],
    ]), true),
    field('⚙️  Hardware', lines([
      ['GPU', gpu, false],
      ['RAM', ram, false],
    ]), true),
    field('📶  MAC', mac ? `\`${mac}\`` : null, true),
  ].filter(Boolean);

  const embed = {
    author: { name: '🛡️ RAKHA SECURITY' },
    title: '🚨 Security Alert',
    description: descParts.join('\n'),
    color: BRAND,
    fields,
    footer: { text: `Rakha Auth  ·  ${egyptNow()}` },
  };

  if (hasShot) {
    embed.image = { url: 'attachment://alert_ss.jpg' };
  }

  return embed;
};

const decodeJpegB64 = (raw) => {
  const s = String(raw || '').replace(/\s/g, '');
  if (!s || s.length > 8_000_000) return null;
  if (!/^[A-Za-z0-9+/]+=*$/.test(s)) return null;
  let buf;
  try {
    buf = Buffer.from(s, 'base64');
  } catch {
    return null;
  }
  if (buf.length < 100 || buf.length > 5_500_000) return null;
  if (buf[0] !== 0xff || buf[1] !== 0xd8) return null;
  return buf;
};

const notifySecurityAlert = async ({ appName, appId, version, reason, ip, telemetry, screenshot }) => {
  const url = securityWebhookUrl();
  if (!url) {
    if (!warnedMissingSecurityWebhook) {
      warnedMissingSecurityWebhook = true;
      console.warn('[discord] DISCORD_SECURITY_WEBHOOK is not set — security alerts will not be delivered');
    }
    return;
  }
  const stamp = `${appName || ''}|${ip || ''}|${reason || ''}`;
  if (!allowAlertBurst(stamp)) return;

  const jpeg = decodeJpegB64(screenshot);
  const embed = buildProtectionEmbed({
    reason,
    telemetry,
    ip,
    appName,
    appId,
    version,
    hasShot: Boolean(jpeg),
  });
  await sendDiscordNotification(url, embed, jpeg
    ? { buffer: jpeg, name: 'alert_ss.jpg', type: 'image/jpeg' }
    : null);
};

const sendDiscordNotification = async (webhookUrl, embed, file = null) => {
  if (!webhookUrl || !isDiscordWebhookUrl(webhookUrl)) {
    return;
  }

  const payload = {
    username: 'Rakha Shield',
    embeds: [
      {
        ...embed,
        timestamp: new Date().toISOString(),
      },
    ],
  };

  try {
    const ctrl = new AbortController();
    const t = setTimeout(() => ctrl.abort(), 12000);
    if (file && file.buffer && file.buffer.length) {
      const form = new FormData();
      form.append('payload_json', JSON.stringify(payload));
      form.append('files[0]', new Blob([file.buffer], { type: file.type || 'image/jpeg' }), file.name || 'alert_ss.jpg');
      await fetch(webhookUrl, { method: 'POST', body: form, redirect: 'error', signal: ctrl.signal });
    } else {
      await fetch(webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        redirect: 'error',
        signal: ctrl.signal,
      });
    }
    clearTimeout(t);
  } catch (error) {
    console.error('[discord] security webhook failed:', error.message);
  }
};

module.exports = { sendDiscordNotification, notifySecurityAlert, securityWebhookUrl };
