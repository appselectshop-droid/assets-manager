const router = require('express').Router();
const OnboardingRequest = require('../models/OnboardingRequest');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const employeeAuth = require('../middleware/employeeAuth');
const optionalEmployeeAuth = require('../middleware/optionalEmployeeAuth');
const logAction = require('../utils/audit');
const { notifyTelegram } = require('../utils/telegram');

// Límite simple por IP para la ruta pública — mismo criterio que
// accountRequests.js y employees.js (público-lookup).
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 8;
const rateLimitHits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

// Formulario público (sin JWT) — lo llena RH para avisar un ingreso nuevo,
// reemplazando el correo manual que mandaban a Sistemas y demás áreas.
// Protegido con límite por IP + honeypot, igual que Solicitud de Cuentas.
// Nunca crea el empleado directo — solo queda "pendiente" para que Sistemas
// la revise, confirme/corrija los datos y la apruebe a mano.
router.post('/public', optionalEmployeeAuth, async (req, res) => {
  try {
    if (isRateLimited(req.ip)) {
      return res.status(429).json({ message: 'Demasiadas solicitudes, intenta de nuevo más tarde.' });
    }
    const body = req.body || {};
    if (body.website) {
      // Honeypot: un humano nunca llena este campo.
      return res.status(201).json({ id: null });
    }

    const employeeName = (body.employeeName || '').trim();
    if (!employeeName) return res.status(400).json({ message: 'Falta el nombre del nuevo ingreso' });

    const request = await OnboardingRequest.create({
      employeeName,
      position:      (body.position || '').trim(),
      department:    (body.department || '').trim(),
      area:          (body.area || '').trim(),
      businessName:  (body.businessName || '').trim(),
      office:        (body.office || '').trim(),
      directManager: (body.directManager || '').trim(),
      startDate:     body.startDate ? new Date(body.startDate) : undefined,
      desiredCorporateEmail: (body.desiredCorporateEmail || '').trim().toLowerCase(),
      needsEmail:       !!body.needsEmail,
      needsComputer:    !!body.needsComputer,
      computerTypes:    Array.isArray(body.computerTypes) ? body.computerTypes : [],
      needsPhone:       !!body.needsPhone,
      phoneTypes:       Array.isArray(body.phoneTypes) ? body.phoneTypes : [],
      needsAccessories: !!body.needsAccessories,
      accessoryTypes:   Array.isArray(body.accessoryTypes) ? body.accessoryTypes : [],
      accessoryOther:   (body.accessoryOther || '').trim(),
      notes:            (body.notes || '').trim(),
      requestedByName:  (body.requestedByName || '').trim(),
      requestedByEmail: (body.requestedByEmail || '').trim(),
      submitterRef:     req.employee?.employeeRef,
      raw: body,
    });

    const needs = [];
    if (request.needsEmail) needs.push('Correo');
    if (request.needsComputer) needs.push('Computadora');
    if (request.needsPhone) needs.push('Teléfono');
    if (request.needsAccessories) needs.push('Accesorios');
    notifyTelegram(
      `🔔 <b>Nueva Solicitud de Ingreso</b>\n` +
      `👤 ${employeeName}${request.position ? ` — ${request.position}` : ''}\n` +
      `📦 Necesita: ${needs.length ? needs.join(', ') : '—'}\n` +
      `Revisa en Ingresos RH.`
    );

    res.status(201).json({ id: request._id });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Solicitudes que YO envié logueado en el portal de empleado (ver "Mis
// Solicitudes") — no requiere permiso de admin, solo sesión de empleado.
router.get('/mine', employeeAuth, async (req, res) => {
  try {
    const requests = await OnboardingRequest.find({ submitterRef: req.employee.employeeRef }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const requests = await OnboardingRequest.find(filter)
      .populate('createdEmployee', 'employeeId name businessName office department')
      .sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Aprobar = crear el Employee real con los datos ya confirmados/corregidos
// por quien revisa (incluyendo el no. de empleado, que RH no siempre trae).
router.put('/:id/approve', async (req, res) => {
  try {
    const request = await OnboardingRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente') return res.status(400).json({ message: 'Esta solicitud ya fue resuelta' });

    const {
      employeeId, name, position, department, area, businessName, office, phone, corporateEmail,
    } = req.body;
    if (!employeeId?.trim()) return res.status(400).json({ message: 'Captura el número de empleado' });
    if (!name?.trim()) return res.status(400).json({ message: 'Falta el nombre' });

    const dup = await Employee.findOne({ employeeId: employeeId.trim() });
    if (dup) return res.status(400).json({ message: 'Ya existe un empleado con ese número' });

    const employee = await Employee.create({
      employeeId:   employeeId.trim(),
      name:         name.trim(),
      position:     position || '',
      department:   department || '',
      area:         area || '',
      businessName: businessName || '',
      office:       office || '',
      phone:        phone || '',
      corporateEmails: corporateEmail?.trim() ? [corporateEmail.trim().toLowerCase()] : [],
    });

    request.status = 'aprobada';
    request.createdEmployee = employee._id;
    request.reviewedByName = req.user.name;
    request.reviewedAt = new Date();
    await request.save();

    logAction(req.user, 'crear', 'empleado', employee._id, employee.name, `Registró empleado ${employee.name} (desde Solicitud de Ingreso de RH)`);

    res.json({ request, employee });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const request = await OnboardingRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente') return res.status(400).json({ message: 'Esta solicitud ya fue resuelta' });

    request.status = 'rechazada';
    request.rejectionReason = req.body.reason || '';
    request.reviewedByName = req.user.name;
    request.reviewedAt = new Date();
    await request.save();

    logAction(req.user, 'rechazar', 'solicitud_ingreso', request._id, request.employeeName, `Rechazó solicitud de ingreso de ${request.employeeName}`);

    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const request = await OnboardingRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    logAction(req.user, 'eliminar', 'solicitud_ingreso', request._id, request.employeeName, `Eliminó solicitud de ingreso de ${request.employeeName}`);
    res.json({ message: 'Solicitud eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
