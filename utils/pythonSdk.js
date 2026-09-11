const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const JSZip = require('jszip');
const { resolvePublicAppUrl } = require('./publicUrl');

const PY_ROOT = path.join(__dirname, '..', 'sdk', 'python');
const PURE_ROOT = path.join(PY_ROOT, 'bound_pure');

const toPythonModule = (app) => {
  const raw = String(app.slug || app.appId || 'app')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  return raw || 'app';
};

const toDistName = (mod) => `rakhaauth-${mod.replace(/_/g, '-')}`;

const toPepVersion = (version) => {
  const v = String(version || '1.0.0').trim();
  if (/^\d+(\.\d+){0,2}([a-zA-Z0-9.]+)?$/.test(v)) return v;
  return '1.0.0';
};

const sha256Record = (buf) => {
  const digest = crypto.createHash('sha256').update(buf).digest('base64');
  return `sha256=${digest}`;
};

const readPure = (name) => {
  const p = path.join(PURE_ROOT, name);
  if (!fs.existsSync(p)) throw new Error(`Missing Python pure template: ${name}`);
  return fs.readFileSync(p);
};

const pyStr = (value) => JSON.stringify(String(value ?? ''));

const buildPythonWheel = async (app, { baseUrl } = {}) => {
  const mod = toPythonModule(app);
  const distName = toDistName(mod);
  const version = toPepVersion(app.version);
  const origin = resolvePublicAppUrl(baseUrl);

  const initTpl = readPure('__init__.py.tpl').toString('utf8')
    .replace(/\{\{MODULE\}\}/g, mod)
    .replace(/\{\{VERSION\}\}/g, version);

  const configPy = [
    `APP_NAME = ${pyStr(app.name || 'App')}`,
    `APP_ID = ${pyStr(app.appId)}`,
    `APP_SECRET = ${pyStr(app.appSecret)}`,
    `BASE_URL = ${pyStr(origin)}`,
    `DEFAULT_VERSION = ${pyStr(version)}`,
    '',
  ].join('\n');

  const files = {
    'rakhaauth_apps/__init__.py': Buffer.from(
      '"""Namespace for app-specific RakhaAuth SDK wheels."""\n',
      'utf8'
    ),
    [`rakhaauth_apps/${mod}/__init__.py`]: Buffer.from(initTpl, 'utf8'),
    [`rakhaauth_apps/${mod}/_config.py`]: Buffer.from(configPy, 'utf8'),
    [`rakhaauth_apps/${mod}/_client.py`]: readPure('_client.py'),
    [`rakhaauth_apps/${mod}/_http.py`]: readPure('_http.py'),
    [`rakhaauth_apps/${mod}/exceptions.py`]: readPure('exceptions.py'),
  };

  const metadata = [
    'Metadata-Version: 2.1',
    `Name: ${distName}`,
    `Version: ${version}`,
    'Summary: App-specific RakhaAuth Python SDK (pure Python)',
    'Requires-Python: >=3.8',
    'Requires-Dist: requests>=2.28',
    'Requires-Dist: cryptography>=41',
    '',
  ].join('\n');

  const wheel = [
    'Wheel-Version: 1.0',
    'Generator: RakhaAuth',
    'Root-Is-Purelib: true',
    'Tag: py3-none-any',
    '',
  ].join('\n');

  const distInfoDir = `${distName.replace(/-/g, '_')}-${version}.dist-info`;
  files[`${distInfoDir}/METADATA`] = Buffer.from(metadata, 'utf8');
  files[`${distInfoDir}/WHEEL`] = Buffer.from(wheel, 'utf8');

  const recordLines = [];
  for (const name of Object.keys(files).sort()) {
    const buf = files[name];
    recordLines.push(`${name},${sha256Record(buf)},${buf.length}`);
  }
  const recordPath = `${distInfoDir}/RECORD`;
  recordLines.push(`${recordPath},,`);
  files[recordPath] = Buffer.from(`${recordLines.join('\n')}\n`, 'utf8');

  const zip = new JSZip();
  for (const [name, buf] of Object.entries(files)) {
    zip.file(name, buf);
  }

  const buffer = await zip.generateAsync({
    type: 'nodebuffer',
    compression: 'DEFLATE',
    compressionOptions: { level: 9 },
  });

  const filename = `${distName.replace(/-/g, '_')}-${version}-py3-none-any.whl`;

  return {
    buffer,
    filename,
  };
};

module.exports = {
  buildPythonWheel,
};
