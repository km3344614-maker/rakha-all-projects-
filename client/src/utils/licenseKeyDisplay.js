export function isAllCapsKey(value) {
  const t = String(value || '');
  return t.length > 0 && t === t.toUpperCase() && /[A-Z]/.test(t);
}

/** Cosmetic display only — copy should use the raw stored key for case-sensitive login. */
export function formatLicenseKeyDisplay(value) {
  const key = String(value || '').trim();
  if (!key || !isAllCapsKey(key)) return key;
  return key.split('-').map((part, index) => {
    if (!part || !/^[A-Z0-9]+$/.test(part)) return part;
    if (index < 2 && /[A-Z]/.test(part) && part.length > 1) {
      return part.charAt(0) + part.slice(1).toLowerCase();
    }
    return part;
  }).join('-');
}
