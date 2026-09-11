const express = require('express');
const router = express.Router({ mergeParams: true });
const AppFile = require('../models/AppFile');
const { dashboardProtect } = require('../middleware/auth');
const { verifyAppOwner } = require('../middleware/verifyAppOwner');
const { removeSealed, sealString, openString } = require('../utils/fileVault');
const { asSafeString, pickObjectIds, isStrongPassword, PASSWORD_HINT } = require('../utils/security');
const { isEnvPackEnabled, getEnvPackConfig, normalizePackName, parseHttpsUrl } = require('../utils/envPack');

const MAX_UPLOAD_BYTES = Number(process.env.FILE_MAX_BYTES || 64 * 1024 * 1024);
const MAX_FILES_PER_APP = Number(process.env.FILE_MAX_PER_APP || 50);
const PRODUCTION = process.env.NODE_ENV === 'production';

const PUBLIC_FIELDS =
  'name filename size sha256 status downloads sourceType remoteHost createdAt updatedAt';

const normalizeName = normalizePackName;

const parseRemoteUrl = parseHttpsUrl;

const envPackOnly = () => PRODUCTION || isEnvPackEnabled();

router.get('/', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const files = await AppFile.find({ app: req.params.appId })
      .select(PUBLIC_FIELDS)
      .sort('name');
    const envPack = getEnvPackConfig();
    res.json({
      success: true,
      files,
      maxBytes: MAX_UPLOAD_BYTES,
      maxFiles: MAX_FILES_PER_APP,
      envPackManaged: !!envPack,
      envPackHost: envPack?.host || '',
    });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/link', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    if (envPackOnly()) {
      return res.status(400).json({
        success: false,
        message: 'Package link and password are configured in Render environment (REMOTE_PACKAGE_*). Dashboard cannot store them.',
      });
    }

    const name = normalizeName(req.body?.name);
    if (!name) {
      return res.status(400).json({ success: false, message: 'A file name is required' });
    }

    const parsed = parseRemoteUrl(req.body?.url);
    if (parsed.error) {
      return res.status(400).json({ success: false, message: parsed.error });
    }

    const password = asSafeString(req.body?.password, 256);
    if (!password) {
      return res.status(400).json({
        success: false,
        message: 'An archive password is required — the link alone must never be enough',
      });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({ success: false, message: PASSWORD_HINT });
    }
    const sha256 = asSafeString(req.body?.sha256, 64).toLowerCase();
    if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) {
      return res.status(400).json({ success: false, message: 'SHA-256 must be 64 hex characters' });
    }

    const existing = await AppFile.findOne({ app: req.params.appId, name }).select('+storageKey');
    if (!existing) {
      const count = await AppFile.countDocuments({ app: req.params.appId });
      if (count >= MAX_FILES_PER_APP) {
        return res.status(400).json({
          success: false,
          message: `Max ${MAX_FILES_PER_APP} files per app`,
        });
      }
    }

    const fields = {
      sourceType: 'remote',
      remoteSecret: sealString(JSON.stringify({ url: parsed.url, password })),
      remoteHost: parsed.host,
      filename: normalizeName(req.body?.filename) || name,
      sha256,
      size: Number(req.body?.size) > 0 ? Math.floor(Number(req.body.size)) : 0,
      updatedAt: new Date(),
    };

    if (existing) {
      const oldKey = existing.sourceType === 'local' ? existing.storageKey : '';
      Object.assign(existing, fields);
      // Switching a local entry to remote leaves the old blob behind otherwise.
      existing.storageKey = undefined;
      existing.iv = undefined;
      existing.tag = undefined;
      existing.wrappedKey = undefined;
      existing.wrapIv = undefined;
      existing.wrapTag = undefined;
      await existing.save();
      if (oldKey) await removeSealed(oldKey).catch(() => {});
      const safe = await AppFile.findById(existing._id).select(PUBLIC_FIELDS);
      return res.json({ success: true, file: safe, replaced: true });
    }

    const created = await AppFile.create({ app: req.params.appId, name, ...fields });
    const safe = await AppFile.findById(created._id).select(PUBLIC_FIELDS);
    res.status(201).json({ success: true, file: safe });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'A file with that name already exists' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.put('/:fileId', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const file = await AppFile.findOne({ _id: req.params.fileId, app: req.params.appId });
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });

    if (req.body.name !== undefined) {
      const name = normalizeName(req.body.name);
      if (!name) return res.status(400).json({ success: false, message: 'Invalid name' });
      file.name = name;
    }
    if (req.body.url !== undefined || req.body.password !== undefined) {
      if (envPackOnly()) {
        return res.status(400).json({
          success: false,
          message: 'Package link and password are configured in Render environment (REMOTE_PACKAGE_*).',
        });
      }
      if (file.sourceType !== 'remote') {
        return res.status(400).json({
          success: false,
          message: 'This entry stores its bytes here; re-upload it instead',
        });
      }
      const current = await AppFile.findById(file._id).select('+remoteSecret');
      let existingSecret = { url: '', password: '' };
      try {
        existingSecret = JSON.parse(openString(current.remoteSecret));
      } catch {
        existingSecret = { url: '', password: '' };
      }

      let url = existingSecret.url;
      if (req.body.url !== undefined) {
        const parsed = parseRemoteUrl(req.body.url);
        if (parsed.error) {
          return res.status(400).json({ success: false, message: parsed.error });
        }
        url = parsed.url;
        file.remoteHost = parsed.host;
      }
      const password = req.body.password !== undefined
        ? asSafeString(req.body.password, 256)
        : existingSecret.password;
      if (!password) {
        return res.status(400).json({
          success: false,
          message: 'An archive password is required — the link alone must never be enough',
        });
      }
      if (!isStrongPassword(password)) {
        return res.status(400).json({ success: false, message: PASSWORD_HINT });
      }

      file.remoteSecret = sealString(JSON.stringify({ url, password }));
    }
    if (req.body.sha256 !== undefined) {
      const sha256 = asSafeString(req.body.sha256, 64).toLowerCase();
      if (sha256 && !/^[0-9a-f]{64}$/.test(sha256)) {
        return res.status(400).json({ success: false, message: 'SHA-256 must be 64 hex characters' });
      }
      if (sha256) file.sha256 = sha256;
    }
    if (req.body.status !== undefined) {
      if (!['active', 'disabled'].includes(req.body.status)) {
        return res.status(400).json({ success: false, message: 'Invalid status' });
      }
      file.status = req.body.status;
    }
    file.updatedAt = new Date();
    await file.save();

    const safe = await AppFile.findById(file._id).select(PUBLIC_FIELDS);
    res.json({ success: true, file: safe });
  } catch (error) {
    if (error?.code === 11000) {
      return res.status(400).json({ success: false, message: 'A file with that name already exists' });
    }
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/delete-selected', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const ids = pickObjectIds(req.body?.ids);
    if (!ids.length) {
      return res.status(400).json({ success: false, message: 'No files selected' });
    }
    const files = await AppFile.find({ app: req.params.appId, _id: { $in: ids } })
      .select('+storageKey');
    await AppFile.deleteMany({ app: req.params.appId, _id: { $in: files.map(f => f._id) } });
    await Promise.all(files.map(f => removeSealed(f.storageKey)));
    res.json({ success: true, deleted: files.length });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.delete('/:fileId', dashboardProtect, verifyAppOwner, async (req, res) => {
  try {
    const file = await AppFile.findOneAndDelete({
      _id: req.params.fileId,
      app: req.params.appId,
    }).select('+storageKey');
    if (!file) return res.status(404).json({ success: false, message: 'File not found' });
    await removeSealed(file.storageKey);
    res.json({ success: true, message: 'File deleted' });
  } catch (error) {
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

module.exports = router;
