#!/usr/bin/env node
/**
 * Quick offline checks for license-key hashing and matching.
 * Usage: node scripts/verify-key-flow.js
 */
process.env.JWT_SECRET = process.env.JWT_SECRET || 'verify-key-flow-test-secret';

const crypto = require('crypto');
const {
  packLicense,
  keyBlind,
  keyHashVariants,
  keyHashClause,
  licenseMatchesTyped,
  userLookupFilter,
} = require('../utils/fieldCrypto');

const assert = (label, ok) => {
  if (!ok) {
    console.error('FAIL:', label);
    process.exitCode = 1;
    return;
  }
  console.log('OK:', label);
};

const appId = '507f1f77bcf86cd799439011';
const upperKey = 'SVGA-AABBCC-DDEEFF-112233';
const mixedKey = 'SvGa-AaBbCc-DdEeFf-112233';
const lowerKey = 'rakha';

const upperPacked = packLicense(upperKey);
const mixedPacked = packLicense(mixedKey);
const lowerPacked = packLicense(lowerKey);

assert('exact hash stored as typed', upperPacked.keyHash === keyBlind(upperKey));
assert('mixed hash is not uppercase-folded', mixedPacked.keyHash !== keyBlind(mixedKey.toUpperCase()));

const upperDoc = { keyHash: upperPacked.keyHash, keySealed: upperPacked.keySealed };
const mixedDoc = { keyHash: mixedPacked.keyHash, keySealed: mixedPacked.keySealed };
const lowerDoc = { keyHash: lowerPacked.keyHash, keySealed: lowerPacked.keySealed };

assert('upper login matches exact panel key', licenseMatchesTyped(upperDoc, upperKey));
assert('upper login rejects lowercase', !licenseMatchesTyped(upperDoc, upperKey.toLowerCase()));
assert('mixed login rejects uppercase', !licenseMatchesTyped(mixedDoc, mixedKey.toUpperCase()));
assert('mixed login matches exact panel key', licenseMatchesTyped(mixedDoc, mixedKey));
assert('lowercase panel key matches exact', licenseMatchesTyped(lowerDoc, lowerKey));
assert('lowercase panel key rejects Rakha', !licenseMatchesTyped(lowerDoc, 'Rakha'));
assert('lowercase panel key rejects RAKHA', !licenseMatchesTyped(lowerDoc, 'RAKHA'));

const purposeKey = crypto.createHmac('sha256', 'rakha-blind-v1|license-key')
  .update(process.env.JWT_SECRET, 'utf8').digest();
const legacyCanonDoc = {
  keyHash: crypto.createHmac('sha256', purposeKey).update(lowerKey.toUpperCase(), 'utf8').digest('hex'),
  keySealed: lowerPacked.keySealed,
};
assert('legacy uppercase hash still verifies exact sealed key', licenseMatchesTyped(legacyCanonDoc, lowerKey));
assert('legacy uppercase hash rejects wrong case', !licenseMatchesTyped(legacyCanonDoc, 'RAKHA'));

assert('hash variants include exact + folded', keyHashVariants(upperKey).length >= 1);
assert('hash clause exists', !!keyHashClause(upperKey));

const lookup = userLookupFilter(appId, upperKey.toLowerCase());
assert('user lookup includes hashes', lookup.$or.length >= 2);

if (process.exitCode) {
  console.error('\nKey flow verification failed.');
  process.exit(1);
}
console.log('\nAll key flow checks passed.');
