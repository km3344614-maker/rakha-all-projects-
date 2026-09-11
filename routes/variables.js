const express = require('express');
const router = express.Router({ mergeParams: true });
const Variable = require('../models/Variable');
const { dashboardProtect } = require('../middleware/auth');
const { verifyAppOwner } = require('../middleware/verifyAppOwner');
const { asSafeString, pickObjectIds, stripMongoOperators } = require('../utils/security');
const { peek } = require('../utils/fieldCrypto');

const MAX_VARS = 100;
const TYPES = new Set(['string', 'number', 'boolean', 'json']);

const normalizeName = (value) => {
  const name = asSafeString(value, 64);
  if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name)) return '';
  return name;
};

const normalizeValue = (raw, valueType) => {
  const text = typeof raw === 'string' || typeof raw === 'number' || typeof raw === 'boolean'
    ? String(raw)
    : '';
  if (text.length > 8192) return { error: 'Value is too long' };

  if (valueType === 'number') {
    const n = Number(String(text).trim());
    if (!String(text).trim() || !Number.isFinite(n)) return { error: 'Value must be a number' };
    return { value: String(n) };
  }
  if (valueType === 'boolean') {
    const v = text.trim().toLowerCase();
    if (v !== 'true' && v !== 'false') return { error: 'Value must be true or false' };
    return { value: v };
  }
  if (valueType === 'json') {
    if (!text.trim()) return { value: '' };
    try {
      return { value: JSON.stringify(JSON.parse(text)) };
    } catch {
      return { error: 'Value must be valid JSON' };
    }
  }
  return { value: text };
};

router.get('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const variables = await Variable.find({ app: req.params.appId }).sort('name');
    res.json({ success: true, variables });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const body = stripMongoOperators(req.body || {});
    const name = normalizeName(body.name);
    if (!name) {
      return res.status(400).json({ success: false, message: 'Name must start with a letter (letters, numbers, underscore)' });
    }
    const valueType = TYPES.has(body.valueType) ? body.valueType : 'string';
    const parsed = normalizeValue(body.value, valueType);
    if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });

    const count = await Variable.countDocuments({ app: req.params.appId });
    if (count >= MAX_VARS) {
      return res.status(400).json({ success: false, message: `Max ${MAX_VARS} variables per app` });
    }

    const variable = await Variable.create({
      app: req.params.appId,
      name,
      value: parsed.value,
      valueType,
      authenticated: !!body.authenticated,
    });
    res.status(201).json({ success: true, variable });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'A variable with that name already exists' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/delete-selected', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const ids = pickObjectIds(req.body?.ids);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No variables selected' });
    }
    const result = await Variable.deleteMany({ app: req.params.appId, _id: { $in: ids } });
    res.json({ success: true, deleted: result.deletedCount || 0 });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:varId', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const variable = await Variable.findOne({ _id: req.params.varId, app: req.params.appId });
    if (!variable) return res.status(404).json({ success: false, message: 'Variable not found' });

    const body = stripMongoOperators(req.body || {});
    if (body.name !== undefined) {
      const name = normalizeName(body.name);
      if (!name) {
        return res.status(400).json({ success: false, message: 'Name must start with a letter (letters, numbers, underscore)' });
      }
      variable.name = name;
    }
    const valueType = TYPES.has(body.valueType) ? body.valueType : variable.valueType;
    if (body.value !== undefined || body.valueType !== undefined) {
      const parsed = normalizeValue(body.value !== undefined ? body.value : peek(variable.value), valueType);
      if (parsed.error) return res.status(400).json({ success: false, message: parsed.error });
      variable.value = parsed.value;
      variable.valueType = valueType;
    }
    if (body.authenticated !== undefined) variable.authenticated = !!body.authenticated;
    variable.updatedAt = new Date();
    await variable.save();
    res.json({ success: true, variable });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'A variable with that name already exists' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:varId', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const deleted = await Variable.findOneAndDelete({ _id: req.params.varId, app: req.params.appId });
    if (!deleted) return res.status(404).json({ success: false, message: 'Variable not found' });
    res.json({ success: true, message: 'Variable deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
