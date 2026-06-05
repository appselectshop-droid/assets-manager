const router = require('express').Router();
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');

const SERIAL_CHECK_TYPES = ['laptop', 'escritorio', 'all_in_one', 'celular', 'tablet'];
const PHONE_TYPES = ['celular', 'tablet'];

router.get('/', auth, async (req, res) => {
  try {
    const { status, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    const assets = await Asset.find(filter).sort({ createdAt: -1 });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { serialNumber, type, specs } = req.body;
    if (serialNumber && serialNumber.trim() && SERIAL_CHECK_TYPES.includes(type)) {
      const existing = await Asset.findOne({ serialNumber: serialNumber.trim(), type: { $in: SERIAL_CHECK_TYPES } });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de serie "${serialNumber.trim()}" (${existing.brand} ${existing.model}).`,
        });
      }
    }
    if (PHONE_TYPES.includes(type) && specs?.lineNumber?.trim()) {
      const ln = specs.lineNumber.trim();
      const existing = await Asset.findOne({ type: { $in: PHONE_TYPES }, 'specs.lineNumber': ln });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de línea "${ln}" (${existing.brand} ${existing.model}).`,
        });
      }
    }
    const asset = await Asset.create(req.body);
    res.status(201).json(asset);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ message: 'No encontrado' });
    res.json(asset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { serialNumber, type, specs } = req.body;
    if (serialNumber && serialNumber.trim() && SERIAL_CHECK_TYPES.includes(type)) {
      const existing = await Asset.findOne({ serialNumber: serialNumber.trim(), type: { $in: SERIAL_CHECK_TYPES }, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de serie "${serialNumber.trim()}" (${existing.brand} ${existing.model}).`,
        });
      }
    }
    if (PHONE_TYPES.includes(type) && specs?.lineNumber?.trim()) {
      const ln = specs.lineNumber.trim();
      const existing = await Asset.findOne({ type: { $in: PHONE_TYPES }, 'specs.lineNumber': ln, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de línea "${ln}" (${existing.brand} ${existing.model}).`,
        });
      }
    }
    const asset = await Asset.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(asset);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Asset.findByIdAndDelete(req.params.id);
    res.json({ message: 'Activo eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
