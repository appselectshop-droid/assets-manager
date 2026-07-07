const router = require('express').Router();
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');
const logAction = require('../utils/audit');
const releaseAssetsOnBaja = require('../utils/releaseAssetsOnBaja');

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Límite simple por IP, igual criterio que la ruta pública de Solicitud de
// Cuentas (backend/src/routes/accountRequests.js) — en memoria, se reinicia
// con cada despliegue.
const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX = 20;
const rateLimitHits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

// Búsqueda pública (sin JWT) para el formulario de Solicitud de Cuentas y
// Accesos (frontend/src/pages/SolicitarCuenta.jsx, sin login): al escribir
// un nombre, se buscan coincidencias para rellenar puesto/área/teléfono/
// empresa en automático, sin que la persona tenga que capturarlos ni verlos.
// Solo campos no sensibles de empleados activos (nunca correos/cuentas),
// requiere mínimo 3 caracteres y limita resultados — no expone el
// directorio completo de un jalón.
router.get('/public-lookup', async (req, res) => {
  try {
    if (isRateLimited(req.ip)) return res.status(429).json({ message: 'Demasiadas búsquedas, espera un momento.' });
    const q = (req.query.q || '').trim();
    if (q.length < 3) return res.json([]);
    const terms = q.split(/\s+/).filter(Boolean).map(escapeRegex);
    const matches = await Employee.find({
      active: true,
      $and: terms.map((t) => ({ name: { $regex: t, $options: 'i' } })),
    })
      .select('name employeeId position department area phone businessName office')
      .limit(8);
    res.json(matches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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
    const before = await Employee.findById(req.params.id);
    if (!before) return res.status(404).json({ message: 'Empleado no encontrado' });
    const goingInactive = before.active && fields.active === false;

    const employee = await Employee.findByIdAndUpdate(
      req.params.id,
      { $set: fields },
      { new: true, runValidators: false }
    );

    let freedCount = 0;
    if (goingInactive) freedCount = await releaseAssetsOnBaja(employee, req.user);

    logAction(req.user, 'editar', 'empleado', employee._id, employee.name, `Editó empleado ${employee.name}`);
    res.json({ ...employee.toObject(), freedCount });
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
