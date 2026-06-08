const router = require('express').Router();
const Assignment = require('../models/Assignment');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ active: true })
      .populate('employee', 'employeeId name department')
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
    await Asset.findByIdAndUpdate(asset, { status: 'asignado' });
    const populated = await assignment.populate(['employee', 'asset']);
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
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) return res.status(404).json({ message: 'No encontrada' });
    assignment.active = false;
    assignment.returnDate = new Date();
    await assignment.save();
    await Asset.findByIdAndUpdate(assignment.asset, { status: 'disponible' });
    res.json({ message: 'Activo desasignado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
