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

// Búsqueda pública (sin JWT), usada por los formularios de Solicitud de
// Cuentas y Accesos y de Solicitud de Ingreso (ambos sin login): al escribir
// un nombre, se buscan coincidencias para rellenar puesto/área/teléfono/
// empresa/correo corporativo en automático, sin que la persona tenga que
// capturarlos ni verlos. Solo campos ya de por sí no confidenciales de
// empleados activos (nunca contraseñas/cuentas), requiere mínimo 3
// caracteres y limita resultados — no expone el directorio completo de un jalón.
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
      .select('name employeeId position department area phone businessName office corporateEmails')
      .limit(8);
    res.json(matches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/', auth, async (req, res) => {
  try {
    const employees = await Employee.find().select('-password').sort({ name: 1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    // password/passwordSetAt son del portal de empleado, nunca de esta alta
    // general (ver PUT /:id, mismo criterio).
    const { password, passwordSetAt, ...fields } = req.body;
    const employee = await Employee.create(fields);
    logAction(req.user, 'crear', 'empleado', employee._id, employee.name, `Registró empleado ${employee.name}`);
    res.status(201).json(employee);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id).select('-password');
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
    // password/passwordSetAt son del portal de empleado (Mis Tickets) — se
    // manejan solo desde employeeAuth.js (activación) o el reset de abajo,
    // nunca desde esta edición general, para no arriesgar sobrescribir el
    // hash con lo que sea que llegue en un PUT normal.
    const { _id, __v, createdAt, updatedAt, password, passwordSetAt, ...fields } = req.body;
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
    const { password: _pw, ...safeEmployee } = employee.toObject();
    res.json({ ...safeEmployee, freedCount });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Reasignación masiva de razón social — pedido del 16 jul (corrección
// puntual: un grupo de empleados debe quedar con "Kosher" como razón social
// por su forma de pago). Genérico (no hardcoded a "Kosher") para poder
// reusarse en correcciones similares; a diferencia de la división de
// sucursales (ver branches.js), aquí no hay un "resto" que mover a un valor
// por default — todo el que no se marque se queda tal cual está.
router.post('/set-business-name', auth, async (req, res) => {
  try {
    const { employeeIds, businessName } = req.body;
    if (!Array.isArray(employeeIds) || employeeIds.length === 0) {
      return res.status(400).json({ message: 'Selecciona al menos un empleado' });
    }
    if (!businessName?.trim()) {
      return res.status(400).json({ message: 'Falta la razón social destino' });
    }
    const result = await Employee.updateMany(
      { _id: { $in: employeeIds } },
      { $set: { businessName: businessName.trim() } }
    );
    logAction(req.user, 'editar', 'empleado', 'reasignacion-razon-social', businessName.trim(),
      `Reasignó la razón social de ${result.modifiedCount} empleado(s) a "${businessName.trim()}"`);
    res.json({ message: 'Reasignación completada', updated: result.modifiedCount });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// El empleado activa su propia cuenta del portal (Mis Tickets) solo, sin
// necesitar que Sistemas la cree — pero si olvida su contraseña no hay
// forma de recuperarla por correo (el sistema no manda correos, solo avisos
// a Telegram), así que Sistemas puede "desactivarla" para que la persona
// vuelva a activarse desde cero con una contraseña nueva.
router.put('/:id/reset-portal-access', auth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.params.id);
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });
    employee.password = null;
    employee.passwordSetAt = undefined;
    await employee.save();
    logAction(req.user, 'editar', 'empleado', employee._id, employee.name, `Restableció el acceso al portal de Mis Tickets de ${employee.name}`);
    res.json({ message: 'Acceso restablecido — puede activarse de nuevo' });
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
