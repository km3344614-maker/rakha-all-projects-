require('dotenv').config();
const fs = require('fs');
const crypto = require('crypto');
const JSZip = require('jszip');
const mongoose = require('mongoose');
const { buildSdkZip } = require('../utils/sdkBind');
const { buildPythonWheel } = require('../utils/pythonSdk');
const { PUBLIC_APP_URL } = require('../utils/publicUrl');

const base = PUBLIC_APP_URL;

const assert = (cond, msg) => {
  if (!cond) throw new Error(msg);
};

const loadApp = async () => {
  let appId = process.env.TEST_APP_ID || '';
  let appSecret = process.env.TEST_APP_SECRET || '';
  let version = process.env.TEST_APP_VERSION || '1.0.0';
  let name = 'Test Application';
  if (appId && appSecret) {
    return { name, appId, appSecret, version, slug: 'test-application' };
  }
  assert(process.env.MONGODB_URI, 'set TEST_APP_ID/TEST_APP_SECRET or MONGODB_URI');
  const Application = require('../models/Application');
  await mongoose.connect(process.env.MONGODB_URI);
  const doc = await Application.findOne({}).select('+appSecret name appId version slug');
  assert(doc && doc.appId && doc.appSecret, 'no app in database');
  const out = {
    name: doc.name || name,
    appId: doc.appId,
    appSecret: doc.appSecret,
    version: doc.version || version,
    slug: doc.slug || 'test-application',
  };
  await mongoose.disconnect();
  return out;
};

(async () => {
  assert(base && /^https?:\/\//.test(base), 'publicUrl');
  const app = await loadApp();

  const { buffer } = await buildSdkZip(app, { baseUrl: base });
  if (process.env.VERIFY_SDK_OUTPUT) {
    fs.writeFileSync(process.env.VERIFY_SDK_OUTPUT, buffer);
  }
  const z = await JSZip.loadAsync(buffer);
  const names = Object.keys(z.files).filter((f) => !f.endsWith('/'));
  assert(!names.some((f) => /\.dll$/i.test(f) || /README/i.test(f)), 'dll/readme');

  const cfg = await z.file('include/app_config.h').async('string');
  const authH = await z.file('include/rakhaauth.h').async('string');
  assert(!cfg.includes(app.appId) && !cfg.includes(app.appSecret) && !cfg.includes(base), 'plaintext_config');
  assert(cfg.includes('with_app_id') && cfg.includes('with_app_secret') && cfg.includes('with_server'), 'hidden_config');
  assert(authH.includes('ensure_ready') && authH.includes('make_bound_client'), 'auth_h');
  assert((authH.match(/{/g) || []).length === (authH.match(/}/g) || []).length, 'braces');
  assert(authH.trim().endsWith('}'), 'ns_close');
  assert(!authH.includes('LoadLibrary'), 'no_dll_loader');

  assert(z.file('include/trusted_time.h'), 'trusted_time');
  assert(z.file('include/doh.h'), 'doh');
  assert(z.file('include/hwid_collect.h'), 'hwid_collect');
  const trusted = await z.file('include/trusted_time.h').async('string');
  assert(trusted.includes('#include "skStr.h"'), 'trusted_time_include');

  const qs = await z.file('examples/quick_start.cpp').async('string');
  assert(qs.includes('rakhaauth::license') && !qs.includes('rakhaauth::init'), 'quick_start');

  const py = await buildPythonWheel(app, { baseUrl: base });
  const pz = await JSZip.loadAsync(py.buffer);
  const confName = Object.keys(pz.files).find((f) => f.endsWith('_config.py'));
  const conf = await pz.file(confName).async('string');
  assert(conf.includes(app.appId) && conf.includes(base), 'python');

  if (process.env.VERIFY_SDK_LIVE === '1') {
    const ts = Math.floor(Date.now() / 1000).toString();
    const nonce = crypto.randomBytes(16).toString('hex');
    const livePath = '/api/sdk/app-info';
    const sig = crypto.createHmac('sha256', app.appSecret)
      .update(`${ts}\n${nonce}\nGET\n${livePath}\n`, 'utf8')
      .digest('hex');
    const res = await fetch(`${base}${livePath}`, {
      headers: {
        appid: app.appId,
        'x-rakha-appid': app.appId,
        'x-rakha-timestamp': ts,
        'x-rakha-nonce': nonce,
        'x-rakha-signature': sig,
        'x-rakha-auth': 'hmac',
        'x-rakha-version': app.version,
      },
    });
    const json = await res.json();
    assert(res.ok && json.success !== false, `live ${res.status}`);
  }

  console.log(JSON.stringify({
    ok: true,
    files: names.length,
    server: base,
    live: process.env.VERIFY_SDK_LIVE === '1',
  }));
})().catch((e) => {
  console.error('FAIL', e.message);
  process.exit(1);
});
