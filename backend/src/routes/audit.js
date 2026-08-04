const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const { action, entity, userId, from, to, limit = 200 } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (entity) filter.entity = entity;
    if (userId) filter.userId = userId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Conteo por tipo de acción para las tarjetas de resumen — FIX (2026-08-04):
// el frontend calculaba estos conteos a partir de los `logs` YA filtrados
// por acción (ver GET / de arriba), así que al hacer clic en una tarjeta
// (ej. "Creación") el resto se veía en 0 (ya no había logs de otro tipo en
// la respuesta) y la propia tarjeta activa mostraba el `limit` de la
// consulta (500) en vez del conteo real, si había más de 500 coincidencias.
// Esta ruta cuenta TODO lo que aplique según entity/userId/from/to, pero
// NUNCA filtra por `action` — es precisamente el desglose por acción que
// las tarjetas necesitan mostrar, sin importar cuál esté seleccionada.
router.get('/counts-by-action', auth, async (req, res) => {
  try {
    const { entity, userId, from, to } = req.query;
    const filter = {};
    if (entity) filter.entity = entity;
    if (userId) filter.userId = userId;
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    const counts = await AuditLog.aggregate([
      { $match: filter },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]);
    const result = {};
    counts.forEach((c) => { result[c._id] = c.count; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Usuarios únicos que han hecho acciones (para el filtro)
router.get('/users', auth, async (req, res) => {
  try {
    const users = await AuditLog.aggregate([
      { $group: { _id: '$userId', name: { $first: '$userName' } } },
      { $sort: { name: 1 } },
    ]);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
