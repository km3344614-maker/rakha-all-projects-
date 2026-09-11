#!/usr/bin/env node
/** Live SDK login probe — prints step + HTTP status only. */
const crypto = require('crypto');
const {
  verifySdkSignature,
  clientVerifyHmac,
  handshakeServerProof,
  issueHs2,
} = require('../utils/sdkSign');
const { encryptJson, encryptJsonV3, decryptJson, decryptJsonV3 } = require('../utils/sdkCrypto');

const BASE = process.env.APP_URL || 'https://auth.rakha.app';
const KID = process.env.TEST_APP_KID || '';
const SECRET = process.env.TEST_APP_SECRET || '';
const VERSION = process.env.TEST_APP_VERSION || '1.0.0';
const KEY = process.argv[2] || 'YOUR-LICENSE-KEY';

const sign = (ts, nonce, method, path, body) => {
  const sig = crypto.createHmac('sha256', SECRET)
    .update(`${ts}\n${nonce}\n${method}\n${path}\n${body || ''}`, 'utf8')
    .digest('hex');
  return sig;
};

const withOp = (op, obj) => JSON.stringify({ op, ...obj });

async function postQ(path, wire, headers) {
  const res = await fetch(`${BASE}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...headers },
    body: wire,
  });
  const text = await res.text();
  return { status: res.status, text };
}

const openBody = (text, transportKey) => {
  const parsed = JSON.parse(text);
  if (Number(parsed.enc) === 3 && transportKey) return decryptJsonV3(transportKey, parsed);
  return decryptJson(SECRET, parsed);
};

(async () => {
  const path = '/api/q';
  const ts = String(Math.floor(Date.now() / 1000));
  const nonce = crypto.randomBytes(16).toString('hex');

  // HELLO
  const helloPlain = withOp(1, { hello: true, ts, nonce });
  const helloWire = JSON.stringify(encryptJson(SECRET, JSON.parse(helloPlain), 2));
  const helloRes = await postQ(path, helloWire, {
    'x-rakha-k': KID,
    'x-rakha-timestamp': ts,
    'x-rakha-nonce': nonce,
    'x-rakha-version': VERSION,
    'x-rakha-enc': '1',
  });
  console.log('HELLO', helloRes.status);
  if (helloRes.status !== 200) {
    console.log(helloRes.text.slice(0, 200));
    return;
  }
  const hello = openBody(helloRes.text);
  const sid = String(hello.session).split('.')[0];
  const expect = handshakeServerProof(SECRET, sid, hello.salt, hello.challenge, String(hello.serverTime));
  if (expect !== hello.serverProof) {
    console.log('HELLO proof mismatch — wrong secret on server');
    return;
  }

  // VERIFY
  const ts2 = String(Math.floor(Date.now() / 1000));
  const nonce2 = crypto.randomBytes(16).toString('hex');
  const hmac = clientVerifyHmac(SECRET, sid, hello.salt, hello.challenge);
  const verifyPlain = withOp(2, { session: hello.session, hmac });
  const verifyWire = JSON.stringify(encryptJson(SECRET, JSON.parse(verifyPlain), 2));
  const sig2 = sign(ts2, nonce2, 'POST', path, verifyWire);
  const verifyRes = await postQ(path, verifyWire, {
    'x-rakha-k': KID,
    'x-rakha-timestamp': ts2,
    'x-rakha-nonce': nonce2,
    'x-rakha-version': VERSION,
    'x-rakha-signature': sig2,
    'x-rakha-auth': 'hmac',
    'x-rakha-enc': '2',
  });
  console.log('VERIFY', verifyRes.status);
  if (verifyRes.status !== 200) {
    console.log(verifyRes.text.slice(0, 200));
    return;
  }
  const verify = openBody(verifyRes.text);
  const hs2 = verify.handshake;
  const transportEnvelope = typeof verify.transport === 'string'
    ? JSON.parse(verify.transport)
    : verify.transport;
  const transportPayload = decryptJson(SECRET, transportEnvelope);
  const transportKey = Buffer.from(transportPayload.k, 'base64');
  if (transportKey.length !== 32) throw new Error('invalid transport key');

  // LOGIN
  const ts3 = String(Math.floor(Date.now() / 1000));
  const nonce3 = crypto.randomBytes(16).toString('hex');
  const loginPlain = withOp(3, {
    username: KEY,
    password: KEY,
    deferHwidBind: true,
    hwid: crypto.randomBytes(32).toString('hex'),
    handshake: hs2,
  });
  const loginWire = JSON.stringify(encryptJsonV3(transportKey, JSON.parse(loginPlain)));
  const sig3 = sign(ts3, nonce3, 'POST', path, loginWire);
  const loginRes = await postQ(path, loginWire, {
    'x-rakha-k': KID,
    'x-rakha-timestamp': ts3,
    'x-rakha-nonce': nonce3,
    'x-rakha-version': VERSION,
    'x-rakha-signature': sig3,
    'x-rakha-auth': 'hmac',
    'x-rakha-session': hs2,
    'x-rakha-enc': '3',
  });
  console.log('LOGIN', loginRes.status);
  let loginBody;
  try {
    loginBody = openBody(loginRes.text, transportKey);
  } catch {
    loginBody = JSON.parse(loginRes.text);
  }
  console.log('LOGIN message:', loginBody.message || loginBody.success);
  if (loginBody.success) console.log('OK — server accepts key');
})().catch((e) => {
  console.error('ERR', e.message);
  process.exit(1);
});
