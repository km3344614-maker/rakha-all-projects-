const ENC = 3;

const canonicalPath = (url = '') => {
  let path = String(url || '').split('?')[0] || '/';
  if (path.startsWith('/api/')) path = path.slice(4);
  return path.startsWith('/') ? path : `/${path}`;
};

const aad = (method, url, direction) =>
  new TextEncoder().encode(
    `${String(method || 'GET').toUpperCase()}\n${canonicalPath(url)}\n${direction}`
  );

const b64enc = (buf) => {
  const bytes = buf instanceof Uint8Array ? buf : new Uint8Array(buf);
  let s = '';
  for (let i = 0; i < bytes.length; i += 1) s += String.fromCharCode(bytes[i]);
  return btoa(s);
};

const b64dec = (str) => {
  const bin = atob(String(str || ''));
  const out = new Uint8Array(bin.length);
  const bytes = out;
  for (let i = 0; i < bin.length; i += 1) bytes[i] = bin.charCodeAt(i);
  return out;
};

let rsaKeyCache = { spki: '', key: null };

const loadSpki = () => {
  const fromPage = String(document.querySelector('meta[name="k"]')?.getAttribute('content') || '').trim();
  if (fromPage && fromPage !== '__DASH_K__' && fromPage.length >= 64) return fromPage;
  const fromEnv = String(import.meta.env.VITE_DASHBOARD_SPKI || '').trim();
  if (fromEnv.length >= 64) return fromEnv;
  throw new Error('Login crypto unavailable');
};

const importRsa = async (spkiB64) => {
  if (rsaKeyCache.spki === spkiB64 && rsaKeyCache.key) return rsaKeyCache.key;
  const key = await crypto.subtle.importKey(
    'spki',
    b64dec(spkiB64),
    { name: 'RSA-OAEP', hash: 'SHA-256' },
    false,
    ['encrypt']
  );
  rsaKeyCache = { spki: spkiB64, key };
  return key;
};

const importAes = async (raw, usage) =>
  crypto.subtle.importKey('raw', raw, 'AES-GCM', false, usage);

export const sealDashboardRequest = async (obj, method = 'GET', url = '/') => {
  const rsa = await importRsa(loadSpki());
  const rawKey = crypto.getRandomValues(new Uint8Array(32));
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const aes = await importAes(rawKey, ['encrypt']);
  const bundled = new Uint8Array(
    await crypto.subtle.encrypt(
      { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad(method, url, 'request') },
      aes,
      new TextEncoder().encode(JSON.stringify(obj ?? {}))
    )
  );
  const data = bundled.slice(0, bundled.length - 16);
  const tag = bundled.slice(bundled.length - 16);
  const ek = new Uint8Array(await crypto.subtle.encrypt({ name: 'RSA-OAEP' }, rsa, rawKey));
  return {
    aesKey: rawKey,
    ek: b64enc(ek),
    body: {
      enc: ENC,
      iv: b64enc(iv),
      tag: b64enc(tag),
      data: b64enc(data),
    },
  };
};

export const sealDashboardJson = async (obj, method = 'POST', url = '/') => {
  const sealed = await sealDashboardRequest(obj, method, url);
  return {
    aesKey: sealed.aesKey,
    body: { ek: sealed.ek, ...sealed.body },
  };
};

export const openDashboardJson = async (envelope, rawKey, method = 'GET', url = '/') => {
  if (!envelope || Number(envelope.enc) !== ENC) return envelope;
  const iv = b64dec(envelope.iv);
  const data = b64dec(envelope.data);
  const tag = b64dec(envelope.tag);
  if (iv.length !== 12 || tag.length !== 16 || data.length < 1) {
    throw new Error('Invalid ciphertext');
  }
  const combined = new Uint8Array(data.length + tag.length);
  combined.set(data, 0);
  combined.set(tag, data.length);
  const aes = await importAes(rawKey, ['decrypt']);
  const pt = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv, tagLength: 128, additionalData: aad(method, url, 'response') },
    aes,
    combined
  );
  return JSON.parse(new TextDecoder().decode(pt));
};
