const router = require('express').Router();
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');
const Asset = require('../models/Asset');
const PlatformAccountErp = require('../models/PlatformAccountErp');
const auth = require('../middleware/auth');
const employeeAuth = require('../middleware/employeeAuth');
const logAction = require('../utils/audit');
const releaseAssetsOnBaja = require('../utils/releaseAssetsOnBaja');

function escapeRegex(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// Mismo criterio que isErpOnlyUser() en frontend/src/components/Layout.jsx
// y en backend/src/routes/tickets.js — lider.erp/analista.erp, sin ningún
// otro permiso de cuentas. Se le habilitó acceso de SOLO LECTURA a
// Empleados (2026-07-24, pedido explícito): puede ver a quién corresponde
// un correo corporativo y si ya tiene acceso ERP dado de alta, para poder
// correlacionar sus solicitudes — nunca activos/equipo asignado ni otras
// cuentas (Gmail/Plataformas), eso sigue siendo exclusivo de Sistemas.
function isErpOnlyUser(user) {
  return user.role !== 'admin'
    && !user.canManageGmailAccounts
    && !user.canManagePlatformAccounts
    && !!user.canManagePlatformAccountsErp;
}

// Campos que sí puede ver ERP-only — igual criterio que el select ya usado
// en GET /public-lookup, menos teléfono/oficina (no le sirven para su
// tarea real: correlacionar un correo con el empleado y su acceso ERP).
const ERP_VIEW_FIELDS = 'name employeeId position area department businessName corporateEmails active';

async function erpRestrictedEmployeeList() {
  const employees = await Employee.find({ isSharedAccount: { $ne: true } })
    .select(ERP_VIEW_FIELDS)
    .sort({ name: 1 });
  const erpAccounts = await PlatformAccountErp.find({ employee: { $ne: null } }).select('employee');
  const withErpAccess = new Set(erpAccounts.map((a) => String(a.employee)));
  return employees.map((e) => {
    const obj = e.toObject();
    obj.hasErpAccess = withErpAccess.has(String(e._id));
    return obj;
  });
}

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
//
// `isSharedAccount` se excluye a propósito (2026-07-24): una cuenta de uso
// múltiple (ej. "Auxiliar Devoluciones") no tiene sentido como sugerencia en
// ninguno de estos formularios — nadie debería poder pedir un Gmail, un
// recurso, confirmar un envío o dar de baja "a" una cuenta compartida.
// Los propios datos del empleado en sesión — pedido explícito del usuario
// (2026-07-27): "si yo entro con X correo, pues ya las cosas deberían salir
// a mi nombre, como los tickets". Solicitar Cuenta/Recurso/Ingreso son
// páginas públicas (sin login obligatorio, ver comentario de public-lookup
// abajo) que hoy siempre piden escribir/elegir el nombre a mano — con esto,
// si SÍ hay una sesión de portal activa, el formulario se autocompleta solo
// sin preguntar nada, y solo cae al buscador manual cuando de verdad no hay
// sesión (link público abierto sin haber iniciado sesión).
router.get('/me', employeeAuth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.employee.employeeRef)
      .select('name employeeId position area department phone businessName office corporateEmails');
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });
    res.json(employee);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/public-lookup', async (req, res) => {
  try {
    if (isRateLimited(req.ip)) return res.status(429).json({ message: 'Demasiadas búsquedas, espera un momento.' });
    const q = (req.query.q || '').trim();
    if (q.length < 3) return res.json([]);
    const terms = q.split(/\s+/).filter(Boolean).map(escapeRegex);
    const matches = await Employee.find({
      active: true,
      isSharedAccount: { $ne: true },
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
    if (isErpOnlyUser(req.user)) {
      return res.json(await erpRestrictedEmployeeList());
    }
    const employees = await Employee.find().select('-password').sort({ name: 1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    if (isErpOnlyUser(req.user)) return res.status(403).json({ message: 'Acceso de solo lectura' });
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
    if (isErpOnlyUser(req.user)) {
      const employee = await Employee.findById(req.params.id).select(ERP_VIEW_FIELDS);
      if (!employee) return res.status(404).json({ message: 'No encontrado' });
      const hasErpAccess = !!(await PlatformAccountErp.exists({ employee: employee._id }));
      return res.json({ employee: { ...employee.toObject(), hasErpAccess }, assignments: [] });
    }
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
    if (isErpOnlyUser(req.user)) return res.status(403).json({ message: 'Acceso de solo lectura' });
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

// División de "SUC.6 CEDI Naucalpan" → NAUCALPAN (CRISTALERIA) / NAUCALPAN
// (TLB), confirmada por el usuario el 16 jul (última pendiente de la
// corrección de nomenclatura de sucursales). Mismo patrón que se usó para
// GOLDEN/Torre Polanco: los marcados van a TLB, el resto a Cristalería por
// default. Los activos con esa ubicación no distinguen personas, así que se
// van todos a Cristalería (default) de un jalón.
router.post('/split-naucalpan', auth, async (req, res) => {
  try {
    if (isErpOnlyUser(req.user)) return res.status(403).json({ message: 'Acceso de solo lectura' });
    const { tlbIds } = req.body;
    if (!Array.isArray(tlbIds) || tlbIds.length === 0) {
      return res.status(400).json({ message: 'Selecciona al menos un empleado de TLB' });
    }
    const toTlb = await Employee.updateMany(
      { office: 'SUC.6 CEDI Naucalpan', _id: { $in: tlbIds } },
      { $set: { office: 'NAUCALPAN (TLB)' } }
    );
    const toCristaleria = await Employee.updateMany(
      { office: 'SUC.6 CEDI Naucalpan' },
      { $set: { office: 'NAUCALPAN (CRISTALERIA)' } }
    );
    const assetRes = await Asset.updateMany(
      { location: 'SUC.6 CEDI Naucalpan' },
      { $set: { location: 'NAUCALPAN (CRISTALERIA)' } }
    );

    logAction(req.user, 'editar', 'empleado', 'split-naucalpan', 'Sucursal Naucalpan',
      `Dividió Naucalpan: ${toTlb.modifiedCount} a TLB, ${toCristaleria.modifiedCount} a Cristalería`);
    res.json({
      message: 'División completada',
      tlbCount: toTlb.modifiedCount,
      cristaleriaCount: toCristaleria.modifiedCount,
      assetsUpdated: assetRes.modifiedCount,
    });
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
    if (isErpOnlyUser(req.user)) return res.status(403).json({ message: 'Acceso de solo lectura' });
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
    if (isErpOnlyUser(req.user)) return res.status(403).json({ message: 'Acceso de solo lectura' });
    const employee = await Employee.findByIdAndDelete(req.params.id);
    if (employee) logAction(req.user, 'eliminar', 'empleado', req.params.id, employee.name, `Eliminó empleado ${employee.name}`);
    res.json({ message: 'Empleado eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
