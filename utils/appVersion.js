const parseParts = (raw) => {
  const s = String(raw || '').trim().replace(/^[vV]/, '');
  if (!s) return null;
  return s.split(/[.\-_]/).map((part) => {
    const m = /^(\d+)/.exec(part);
    return m ? parseInt(m[1], 10) : 0;
  });
};

const compareVersions = (a, b) => {
  const pa = parseParts(a) || [0];
  const pb = parseParts(b) || [0];
  const n = Math.max(pa.length, pb.length);
  for (let i = 0; i < n; i += 1) {
    const da = pa[i] || 0;
    const db = pb[i] || 0;
    if (da > db) return 1;
    if (da < db) return -1;
  }
  return 0;
};

/** Dashboard / app record version that old clients must meet. */
const requiredVersionOf = (app) =>
  String(app?.minVersion || app?.version || '').trim();

/** True when client version is >= minimum. Missing min or client = reject. */
const meetsMinVersion = (clientVersion, minVersion) => {
  const min = String(minVersion || '').trim();
  const client = String(clientVersion || '').trim();
  if (!min || !client) return false;
  return compareVersions(client, min) >= 0;
};

const isVersionString = (raw) =>
  /^\d+(\.\d+){0,3}$/.test(String(raw || '').trim().replace(/^[vV]/, ''));

const normalizeVersion = (raw) =>
  String(raw || '').trim().replace(/^[vV]/, '').slice(0, 32);

module.exports = {
  meetsMinVersion,
  compareVersions,
  requiredVersionOf,
  isVersionString,
  normalizeVersion,
};
