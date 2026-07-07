const router = require('express').Router();
const Asset = require('../models/Asset');
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');
const logAction = require('../utils/audit');

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
    const asset = await Asset.create({ ...req.body, lastModifiedBy: req.user.name });
    const name = `${asset.brand} ${asset.model}`.trim() || asset.type;
    logAction(req.user, 'crear', 'activo', asset._id, name, `Registró ${name}`);
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

    const asset = await Asset.findById(req.params.id);
    if (!asset) return res.status(404).json({ message: 'Activo no encontrado' });

    // Only block on duplicate serial if the serial number actually changed
    if (serialNumber && serialNumber.trim() && SERIAL_CHECK_TYPES.includes(type)
        && serialNumber.trim() !== asset.serialNumber) {
      const existing = await Asset.findOne({ serialNumber: serialNumber.trim(), type: { $in: SERIAL_CHECK_TYPES }, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de serie "${serialNumber.trim()}" (${existing.brand} ${existing.model}).`,
        });
      }
    }
    // Only block on duplicate line number if the line number actually changed
    if (PHONE_TYPES.includes(type) && specs?.lineNumber?.trim()
        && specs.lineNumber.trim() !== asset.specs?.lineNumber) {
      const ln = specs.lineNumber.trim();
      const existing = await Asset.findOne({ type: { $in: PHONE_TYPES }, 'specs.lineNumber': ln, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de línea "${ln}" (${existing.brand} ${existing.model}).`,
        });
      }
    }

    asset.category       = req.body.category     ?? asset.category;
    asset.type           = req.body.type         ?? asset.type;
    asset.brand          = req.body.brand        ?? asset.brand;
    asset.model          = req.body.model        ?? asset.model;
    asset.serialNumber   = req.body.serialNumber ?? asset.serialNumber;
    asset.inventoryTag   = req.body.inventoryTag ?? asset.inventoryTag;
    asset.status         = req.body.status       ?? asset.status;
    asset.notes          = req.body.notes        ?? asset.notes;
    // Si el status se mueve fuera de "disponible" por aquí (ej. editando el
    // activo a mano en vez de usar el flujo de asignación), la etiqueta de
    // "liberado por baja de personal" ya quedó obsoleta — se limpia igual
    // que ya hace POST /assignments al asignarlo por el flujo normal.
    if (asset.status !== 'disponible' && asset.freedFromEmployee) {
      asset.freedFromEmployee = undefined;
    }
    asset.stockTotal     = req.body.stockTotal !== undefined ? (req.body.stockTotal || null) : asset.stockTotal;
    asset.location       = req.body.location     ?? asset.location;
    asset.purchaseDate   = req.body.purchaseDate !== undefined ? (req.body.purchaseDate || null) : asset.purchaseDate;
    asset.lastModifiedBy = req.user.name;

    if (req.body.specs !== undefined) {
      asset.specs = req.body.specs;
      asset.markModified('specs');
    }

    await asset.save({ validateBeforeSave: false });

    const name = `${asset.brand} ${asset.model}`.trim() || asset.type;
    logAction(req.user, 'editar', 'activo', asset._id, name, `Editó ${name}`);

    res.json(asset);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    // Si el activo sigue asignado a un empleado, borrarlo dejaría la asignación
    // apuntando a un activo inexistente y rompería la ficha de ese empleado.
    const activeAssignment = await Assignment.findOne({ asset: req.params.id, active: true })
      .populate('employee', 'name');
    if (activeAssignment) {
      return res.status(400).json({
        message: `Este activo está asignado a ${activeAssignment.employee?.name || 'un empleado'}; desasígnalo primero antes de eliminarlo.`,
      });
    }

    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (asset) {
      const name = `${asset.brand} ${asset.model}`.trim() || asset.type;
      logAction(req.user, 'eliminar', 'activo', req.params.id, name, `Eliminó ${name}`);
    }
    res.json({ message: 'Activo eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
