export function sanitizeLoginIdentifier(value) {
  return String(value || '')
    .replace(/[^A-Za-z0-9_@. -]/g, '')
    .slice(0, 60);
}
