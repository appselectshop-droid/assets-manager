const router = require('express').Router();
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');

router.get('/', auth, async (req, res) => {
  try {
    const employees = await Employee.find().sort({ name: 1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const employee = await Employee.create(req.body);
    res.status(201).json(employee);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'No encontrado' });
    const assignments = await Assignment.find({ employee: req.params.id, active: true })
      .populate('asset');
    res.json({ employee, assignments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const employee = await Employee.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json(employee);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    await Employee.findByIdAndDelete(req.params.id);
    res.json({ message: 'Empleado eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
