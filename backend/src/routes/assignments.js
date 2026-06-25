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
    const { employee, asset, assignedDate, notes } = req.body;
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
    await Asset.findByIdAndUpdate(assignment.asset, { status: 'disponible', lastModifiedBy: req.user.name });
    const assetName = `${assignment.asset?.brand} ${assignment.asset?.model}`.trim() || 'activo';
    const empName   = assignment.employee?.name || 'empleado';
    logAction(req.user, 'devolver', 'activo', assignment.asset?._id, assetName, `Devolvió ${assetName} de ${empName}`);
    res.json({ message: 'Activo desasignado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
