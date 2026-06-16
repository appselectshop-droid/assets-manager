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
