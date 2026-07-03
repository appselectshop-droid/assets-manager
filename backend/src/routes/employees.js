const router = require('express').Router();
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');
const logAction = require('../utils/audit');

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
    logAction(req.user, 'crear', 'empleado', employee._id, employee.name, `Registró empleado ${employee.name}`);
    res.status(201).json(employee);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'No encontrado' });
    const rawAssignments = await Assignment.find({ employee: req.params.id, active: true })
      .populate('asset');
    // Si el activo fue borrado sin desasignarlo primero, la asignación queda
    // huérfana (asset: null tras el populate) — se omite para no romper la ficha.
    const assignments = rawAssignments.filter((a) => a.asset);
    res.json({ employee, assignments });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { _id, __v, createdAt, updatedAt, ...fields } = req.body;
    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true, runValidators: false }
    );
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });
    logAction(req.user, 'editar', 'empleado', employee._id, employee.name, `Editó empleado ${employee.name}`);
    res.json(employee);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, async (req, res) => {
  try {
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (employee) logAction(req.user, 'eliminar', 'empleado', req.params.id, employee.name, `Eliminó empleado ${employee.name}`);
    res.json({ message: 'Empleado eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
