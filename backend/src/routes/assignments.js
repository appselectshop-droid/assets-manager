const router = require('express').Router();
const Assignment = require('../models/Assignment');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const logAction = require('../utils/audit');

router.get('/', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ active: true })
      .populate('employee', 'employeeId name businessName office position area department')
      .populate('asset')
      .sort({ assignedDate: -1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { employee, asset, assignedDate, notes, quantity = 1 } = req.body;
    const assetDoc = await Asset.findById(asset);
    if (!assetDoc) return res.status(404).json({ message: 'Activo no encontrado' });

    if (assetDoc.stockTotal != null) {
      // Bulk product: allow multiple assignments, validate available quantity
      const activeAssigns = await Assignment.find({ asset, active: true });
      const assignedTotal = activeAssigns.reduce((sum, a) => sum + (a.quantity || 1), 0);
      const available = assetDoc.stockTotal - assignedTotal;
      if (quantity > available) {
        return res.status(400).json({ message: `Solo hay ${available} unidades disponibles` });
      }
      const assignment = await Assignment.create({ employee, asset, assignedDate, notes, quantity });
      const newAssigned = assignedTotal + Number(quantity);
      const newStatus = newAssigned >= assetDoc.stockTotal ? 'asignado' : 'disponible';
      await Asset.findByIdAndUpdate(asset, { status: newStatus, lastModifiedBy: req.user.name });
      const populated = await assignment.populate(['employee', 'asset']);
      const assetName = `${populated.asset?.brand} ${populated.asset?.model}`.trim() || 'accesorio';
      const empName   = populated.employee?.name || 'empleado';
      logAction(req.user, 'asignar', 'accesorio', asset, assetName, `Asignó ${quantity} uds. de ${assetName} a ${empName}`);
      return res.status(201).json(populated);
    }

    // Individual asset: original one-assignment-at-a-time behavior
    const existing = await Assignment.findOne({ asset, active: true });
    if (existing) return res.status(400).json({ message: 'Este activo ya está asignado' });
    const assignment = await Assignment.create({ employee, asset, assignedDate, notes });
    await Asset.findByIdAndUpdate(asset, { status: 'asignado', lastModifiedBy: req.user.name });
    const populated = await assignment.populate(['employee', 'asset']);
    const assetName = `${populated.asset?.brand} ${populated.asset?.model}`.trim() || 'activo';
    const empName   = populated.employee?.name || 'empleado';
    logAction(req.user, 'asignar', 'activo', asset, assetName, `Asignó ${assetName} a ${empName}`);
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { notes } = req.body;
    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      { notes },
      { new: true }
    ).populate(['employee', 'asset']);
    if (!assignment) return res.status(404).json({ message: 'No encontrada' });
    res.json(assignment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate(['employee', 'asset']);
    if (!assignment) return res.status(404).json({ message: 'No encontrada' });
    assignment.active     = false;
    assignment.returnDate = new Date();
    await assignment.save();

    const assetDoc = assignment.asset;
    if (assetDoc?.stockTotal != null) {
      // Bulk product: recompute status from remaining active assignments
      const remaining = await Assignment.find({ asset: assetDoc._id, active: true });
      const remainingTotal = remaining.reduce((sum, a) => sum + (a.quantity || 1), 0);
      const newStatus = remainingTotal >= assetDoc.stockTotal ? 'asignado' : 'disponible';
      await Asset.findByIdAndUpdate(assetDoc._id, { status: newStatus, lastModifiedBy: req.user.name });
    } else {
      await Asset.findByIdAndUpdate(assetDoc?._id || assignment.asset, { status: 'disponible', lastModifiedBy: req.user.name });
    }

    const assetName = `${assetDoc?.brand} ${assetDoc?.model}`.trim() || 'activo';
    const empName   = assignment.employee?.name || 'empleado';
    logAction(req.user, 'devolver', 'activo', assetDoc?._id, assetName, `Devolvió ${assetName} de ${empName}`);
    res.json({ message: 'Activo desasignado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
