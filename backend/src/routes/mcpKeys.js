// Administración de llaves del conector MCP — ⚙️ Configuración → Conexión con
// Claude (2026-11-23). Solo administradores. La llave en claro se devuelve
// UNA sola vez, al crearla; después solo se ve su prefijo.
const router = require('express').Router();
const crypto = require('crypto');
const McpKey = require('../models/McpKey');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');
const { hashKey } = require('./mcp');

router.use(auth, adminOnly);

const cleanModules = (m) => [...new Set((Array.isArray(m) ? m : []).filter((x) => McpKey.MODULES.includes(x)))];
const view = (k) => ({
  _id: k._id, name: k.name, prefix: k.prefix, modules: k.modules, expiresAt: k.expiresAt,
  revokedAt: k.revokedAt, revokedByName: k.revokedByName, createdByName: k.createdByName, createdAt: k.createdAt,
  lastUsedAt: k.lastUsedAt, lastUsedIp: k.lastUsedIp, useCount: k.useCount, recentCalls: [...(k.recentCalls || [])].reverse(),
});

router.get('/', async (req, res) => {
  try {
    const keys = await McpKey.find().sort({ revokedAt: 1, createdAt: -1 }).lean();
    res.json(keys.map(view));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const name = (req.body.name || '').trim();
    const modules = cleanModules(req.body.modules);
    if (!name) return res.status(400).json({ message: 'Ponle un nombre a la llave (ej. "Claude de Miguel")' });
    if (!modules.length) return res.status(400).json({ message: 'Marca al menos un módulo' });
    const expiresAt = req.body.expiresAt ? new Date(`${req.body.expiresAt}T23:59:59-06:00`) : null;
    if (expiresAt && (Number.isNaN(+expiresAt) || expiresAt < new Date())) return res.status(400).json({ message: 'La fecha de vencimiento debe ser futura' });

    const plain = `amk_${crypto.randomBytes(32).toString('base64url')}`;
    const key = await McpKey.create({
      name, modules, expiresAt, prefix: plain.slice(0, 10), keyHash: hashKey(plain),
      createdBy: req.user.id, createdByName: req.user.name,
    });
    logAction(req.user, 'crear', 'mcp_key', key._id, name, `Creó llave MCP "${name}" (${modules.join(', ')})`);
    res.status(201).json({ key: view(key.toObject()), plain });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.patch('/:id', async (req, res) => {
  try {
    const key = await McpKey.findById(req.params.id);
    if (!key) return res.status(404).json({ message: 'Llave no encontrada' });
    if (key.revokedAt) return res.status(400).json({ message: 'La llave ya está revocada' });
    if (req.body.name !== undefined) key.name = String(req.body.name).trim() || key.name;
    if (req.body.modules !== undefined) {
      const m = cleanModules(req.body.modules);
      if (!m.length) return res.status(400).json({ message: 'Marca al menos un módulo' });
      key.modules = m;
    }
    if (req.body.expiresAt !== undefined) key.expiresAt = req.body.expiresAt ? new Date(`${req.body.expiresAt}T23:59:59-06:00`) : null;
    await key.save();
    logAction(req.user, 'editar', 'mcp_key', key._id, key.name, `Editó llave MCP "${key.name}" (${key.modules.join(', ')})`);
    res.json(view(key.toObject()));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Revocar (no se borra, para conservar el historial de uso).
router.delete('/:id', async (req, res) => {
  try {
    const key = await McpKey.findById(req.params.id);
    if (!key) return res.status(404).json({ message: 'Llave no encontrada' });
    if (!key.revokedAt) {
      key.revokedAt = new Date();
      key.revokedByName = req.user.name;
      await key.save();
      logAction(req.user, 'eliminar', 'mcp_key', key._id, key.name, `Revocó llave MCP "${key.name}"`);
    }
    res.json(view(key.toObject()));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
