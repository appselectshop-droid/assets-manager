const router = require('express').Router();
const OnboardingRequest = require('../models/OnboardingRequest');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const employeeAuth = require('../middleware/employeeAuth');
const optionalEmployeeAuth = require('../middleware/optionalEmployeeAuth');
const logAction = require('../utils/audit');
const { notifyTelegram } = require('../utils/telegram');
const { notifyEmail } = require('../utils/graphMail');
const { buildSignatureRequestEmail } = require('../utils/emailTemplates');
const { adminUrl } = require('../utils/portalLinks');

// Firma corporativa (2026-08-11) — pedido explícito del usuario: Diseño
// (Sharo/Miguel Ugalde) es quien la genera, avisado por correo, con copia
// al jefe de F&V (así lo pidió el usuario). No es un permiso ni un
// usuario del sistema — son 2 direcciones fijas, mismo criterio que
// FELIPE_EMAIL/GESTOR_CONSTANCIAS_EMAIL en tickets.js.
const DISENO_EMAIL = 'coo.diseno@selectshop.com.mx';
const FYV_EMAIL = 'coo.fyv@selectshop.com.mx';

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

    // Mayúsculas siempre — es el nombre con el que va a quedar registrado el
    // Employee real al aprobarse (ver PUT /:id/approve), y RH lo captura con
    // mayúsculas/minúsculas mezcladas si se lo deja a mano.
    const employeeName = (body.employeeName || '').trim().toUpperCase();
    if (!employeeName) return res.status(400).json({ message: 'Falta el nombre del nuevo ingreso' });

    // Pedido explícito del usuario (2026-07-27): "si yo entro con X correo,
    // ya las cosas deberían salir a mi nombre, como los tickets" — si hay
    // sesión de portal activa (optionalEmployeeAuth), "quién solicita" se
    // resuelve DIRECTO por el propio employeeRef, sin necesitar
    // `requestedByName`. Sin sesión, el formulario público solo deja avanzar
    // si se elige de la lista de sugerencias (ver GET /employees/
    // public-lookup) — esta es la misma validación del lado del servidor,
    // por si alguien llama esta ruta directo sin pasar por el formulario.
    // Se resuelve nombre y correo desde el propio Employee encontrado (no lo
    // que mande el cliente) para que "quién solicita" quede siempre confiable.
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    let requester;
    if (req.employee?.employeeRef) {
      requester = await Employee.findOne({ _id: req.employee.employeeRef, active: true });
      if (!requester) return res.status(400).json({ message: 'Tu sesión ya no es válida — vuelve a iniciar sesión.' });
    } else {
      const requestedByNameInput = (body.requestedByName || '').trim();
      if (!requestedByNameInput) {
        return res.status(400).json({ message: 'Falta tu nombre (quién solicita) — elígelo de la lista de sugerencias.' });
      }
      requester = await Employee.findOne({
        active: true,
        name: { $regex: `^${escapeRegex(requestedByNameInput)}$`, $options: 'i' },
      });
      if (!requester) {
        return res.status(400).json({ message: 'No encontramos tu nombre en la base de empleados. Escríbelo tal como aparece registrado y selecciónalo de la lista.' });
      }
    }

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
      needsSignature:   !!body.needsSignature,
      notes:            (body.notes || '').trim(),
      requestedByName:  requester.name,
      requestedByEmail: requester.corporateEmails?.[0] || '',
      submitterRef:     req.employee?.employeeRef,
      raw: body,
    });

    const needs = [];
    if (request.needsEmail) needs.push('Correo');
    if (request.needsComputer) needs.push('Computadora');
    if (request.needsPhone) needs.push('Teléfono');
    if (request.needsAccessories) needs.push('Accesorios');
    if (request.needsSignature) needs.push('Firma corporativa');
    notifyTelegram(
      `🔔 <b>Nueva Solicitud de Ingreso</b>\n` +
      `👤 ${employeeName}${request.position ? ` — ${request.position}` : ''}\n` +
      `📦 Necesita: ${needs.length ? needs.join(', ') : '—'}\n` +
      `<a href="${adminUrl('/onboarding-requests')}">Ver solicitud</a>`
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
      // Mayúsculas siempre, sin importar cómo haya llegado el nombre desde
      // la solicitud ni cómo lo haya vuelto a editar quien aprueba — este es
      // el punto real donde se crea el Employee, la garantía tiene que estar
      // aquí, no solo en el guardado de la solicitud (ver POST /public).
      name:         name.trim().toUpperCase(),
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

    // Firma corporativa (2026-08-11) — pedido explícito del usuario: se
    // avisa a Diseño hasta este momento (no al enviar la solicitud),
    // porque es aquí donde ya se sabe si el teléfono quedó aprobado y,
    // si sí, si Sistemas ya tiene el número o todavía no (lo normal: no
    // lo tiene, un ingreso nuevo no trae celular asignado el día 1). Sin
    // await — nunca debe demorar ni romper la respuesta si Azure falla.
    if (request.needsSignature) {
      const { subject, html } = buildSignatureRequestEmail({
        employeeName: employee.name,
        position: employee.position,
        startDate: request.startDate,
        directPhone: employee.phone,
        phonePending: request.needsPhone && !employee.phone,
      });
      notifyEmail({ to: DISENO_EMAIL, cc: FYV_EMAIL, subject, html });
    }

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
