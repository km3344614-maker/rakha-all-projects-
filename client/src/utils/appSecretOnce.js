const PREFIX = 'rakha_secret_once_';

/** Store app secret shown once after create/regenerate (session-only, not localStorage). */
export function stashAppSecretOnce(appId, secret) {
  if (!appId || !secret) return;
  try {
    sessionStorage.setItem(`${PREFIX}${appId}`, secret);
  } catch {

  }
}

/** Read and remove a one-time secret for an app. */
export function takeAppSecretOnce(appId) {
  if (!appId) return '';
  try {
    const key = `${PREFIX}${appId}`;
    const value = sessionStorage.getItem(key) || '';
    if (value) sessionStorage.removeItem(key);
    return value;
  } catch {
    return '';
  }
}
