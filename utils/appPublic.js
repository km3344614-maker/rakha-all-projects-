const { peek } = require('./fieldCrypto');

const toPublicApp = (app, extras = {}) => {
  const obj = app && typeof app.toObject === 'function' ? app.toObject() : { ...(app || {}) };
  delete obj.appSecret;
  delete obj.__v;
  return { ...obj, ...extras };
};

const peekAppSecret = (app) => {
  if (!app?.appSecret) return '';
  const plain = peek(app.appSecret);
  return typeof plain === 'string' ? plain : '';
};

module.exports = { toPublicApp, peekAppSecret };
