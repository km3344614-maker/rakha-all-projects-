const EGYPT_TZ = 'Africa/Cairo';

function parseInstant(value) {
  if (value == null || value === '') return null;
  const d = value instanceof Date ? value : new Date(value);
  if (Number.isNaN(d.getTime())) return null;
  return d;
}

function egyptParts(d, { withTime = false, withSeconds = false, month = '2-digit' } = {}) {
  const opts = {
    timeZone: EGYPT_TZ,
    year: 'numeric',
    month,
    day: '2-digit',
    hourCycle: 'h23',
  };
  if (withTime) {
    opts.hour = '2-digit';
    opts.minute = '2-digit';
    if (withSeconds) opts.second = '2-digit';
  }
  const parts = new Intl.DateTimeFormat('en-GB', opts).formatToParts(d);
  const get = (type) => parts.find((p) => p.type === type)?.value || '';
  return {
    day: String(get('day')).padStart(2, '0'),
    month: get('month'),
    year: get('year'),
    hour: String(get('hour')).padStart(2, '0'),
    minute: String(get('minute')).padStart(2, '0'),
    second: String(get('second')).padStart(2, '0'),
  };
}

export function formatEgyptDateTime(value) {
  const d = parseInstant(value);
  if (!d) return '—';
  const p = egyptParts(d, { withTime: true, withSeconds: true, month: '2-digit' });
  return `${p.day}-${p.month}-${p.year} ${p.hour}:${p.minute}:${p.second}`;
}

export function formatEgyptDate(value) {
  const d = parseInstant(value);
  if (!d) return '—';
  const p = egyptParts(d, { month: '2-digit' });
  return `${p.day}-${p.month}-${p.year}`;
}

export function formatEgyptDateTimeShort(value) {
  const d = parseInstant(value);
  if (!d) return '—';
  const p = egyptParts(d, { withTime: true, month: 'short' });
  return `${p.day} ${p.month} ${p.year}, ${p.hour}:${p.minute}`;
}

const unitLabel = (n, one, many) => (n === 1 ? `1 ${one}` : `${n} ${many}`);

export function durationDaysToMinutes(days) {
  const d = Number(days);
  if (!Number.isFinite(d) || d <= 0) return 0;
  return Math.round(d * 24 * 60);
}

export function formatDurationDays(days, { lifetime = false } = {}) {
  if (lifetime) return 'Lifetime';
  const totalMin = durationDaysToMinutes(days);
  if (totalMin <= 0) return 'Lifetime';
  return formatMinutesRemaining(totalMin);
}

export function formatTimeRemaining(value, now = Date.now()) {
  const d = parseInstant(value);
  if (!d) return '—';
  const ms = d.getTime() - now;
  if (ms <= 0) return 'Expired';
  return formatMinutesRemaining(Math.max(1, Math.ceil(ms / 60000)));
}

function formatMinutesRemaining(totalMin) {
  const n = Math.max(0, Math.floor(Number(totalMin) || 0));
  if (n <= 0) return 'Expired';
  const years = Math.floor(n / (365 * 24 * 60));
  let rest = n % (365 * 24 * 60);
  const months = Math.floor(rest / (30 * 24 * 60));
  rest %= 30 * 24 * 60;
  const days = Math.floor(rest / (24 * 60));
  rest %= 24 * 60;
  const hours = Math.floor(rest / 60);
  const minutes = rest % 60;
  const parts = [];
  if (years) parts.push(unitLabel(years, 'year', 'years'));
  if (months) parts.push(unitLabel(months, 'month', 'months'));
  if (!years && days) parts.push(unitLabel(days, 'day', 'days'));
  if (!years && !months && hours) parts.push(unitLabel(hours, 'hour', 'hours'));
  if (!years && !months && !days && (minutes || !parts.length)) {
    parts.push(unitLabel(Math.max(1, minutes), 'minute', 'minutes'));
  }
  return parts.slice(0, 2).join(' ');
}
