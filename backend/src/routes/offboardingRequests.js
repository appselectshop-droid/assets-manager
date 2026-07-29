const router = require('express').Router();
const OffboardingRequest = require('../models/OffboardingRequest');
const Employee = require('../models/Employee');
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const employeeAuth = require('../middleware/employeeAuth');
const releaseAssetsOnBaja = require('../utils/releaseAssetsOnBaja');
const logAction = require('../utils/audit');
const { notifyTelegram } = require('../utils/telegram');
const { adminUrl, employeeUrl } = require('../utils/portalLinks');

// Contraparte de onboardingRequests.js, en 2 etapas (jefe → RH → Sistemas)
// en vez de 1. A diferencia de Solicitud de Ingreso/Cuenta/Recurso (públicas,
// sin login, cualquiera con el link las llena), esta SÍ requiere sesión de
// empleado en las 3 rutas — pedido explícito del usuario ("solo los jefes...
// y RH"), y porque a diferencia de un alta (que no le hace nada a nadie
// hasta que Sistemas la aprueba a mano), una baja sí termina soltando los
// activos de una persona real. Igual que el resto del portal, esto es un
// candado de UI/flujo, no un permiso reforzado en el backend (mismo criterio
// que canManageOnboarding) — la acción realmente destructiva (marcar al
// empleado inactivo + liberar sus activos) sigue exclusivamente detrás de
// `auth + adminOnly` de Sistemas, sin cambios.

// Sistemas no debe ver el motivo de la baja — ver nota en GET '/' más abajo.
function stripReason(request) {
  const obj = request.toObject ? request.toObject() : request;
  delete obj.reasons;
  delete obj.reasonOther;
  return obj;
}

// Snapshot de qué tiene asignado la persona AHORITA — se calcula una sola
// vez al crear la solicitud, así RH no depende de entrar a Activos.
async function buildAssetsSnapshot(employeeId) {
  const assignments = await Assignment.find({ employee: employeeId, active: true }).populate('asset');
  return assignments
    .filter((a) => a.asset)
    .map((a) => ({
      assetId: a.asset._id,
      assetType: a.asset.type,
      brand: a.asset.brand,
      model: a.asset.model,
      serialNumber: a.asset.serialNumber,
      inventoryTag: a.asset.inventoryTag,
    }));
}

// El jefe reporta la baja de alguien de su equipo — requiere sesión de
// empleado (para saber quién la reportó), no admin de Sistemas.
router.post('/', employeeAuth, async (req, res) => {
  try {
    const body = req.body || {};
    const employee = await Employee.findById(body.employeeRef);
    if (!employee) return res.status(400).json({ message: 'Selecciona a la persona que causa baja de la lista.' });
    if (!Array.isArray(body.reasons) || body.reasons.length === 0) {
      return res.status(400).json({ message: 'Selecciona al menos un motivo de baja.' });
    }

    const requester = await Employee.findById(req.employee.employeeRef);
    const assetsSnapshot = await buildAssetsSnapshot(employee._id);

    const request = await OffboardingRequest.create({
      employeeRef: employee._id,
      employeeName: employee.name,
      employeePosition: employee.position || '',
      employeeArea: employee.area || '',
      employeeOffice: employee.office || employee.businessName || '',
      reasons: body.reasons,
      reasonOther: (body.reasonOther || '').trim(),
      bajaDate: body.bajaDate ? new Date(body.bajaDate) : undefined,
      notes: (body.notes || '').trim(),
      assetsSnapshot,
      requestedByName: requester?.name || '',
      requestedByEmail: (requester?.corporateEmails || [])[0] || '',
      submitterRef: req.employee.employeeRef,
      raw: body,
    });

    notifyTelegram(
      `📤 <b>Nueva Solicitud de Baja</b>\n` +
      `👤 ${employee.name}${employee.position ? ` — ${employee.position}` : ''}\n` +
      `📝 Motivo: ${body.reasons.join(', ')}\n` +
      `🎒 Activos asignados: ${assetsSnapshot.length}\n` +
      // RH la revisa/aprueba desde el PORTAL de empleado (BajaPersonal.jsx),
      // no desde el panel admin — por eso es employeeUrl(), no adminUrl().
      `<a href="${employeeUrl('/mesa-de-ayuda/baja-personal')}">Ver solicitud</a>`
    );

    res.status(201).json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Lo que YO reporté (jefe) — "Mis Solicitudes" del portal.
router.get('/mine', employeeAuth, async (req, res) => {
  try {
    const requests = await OffboardingRequest.find({ submitterRef: req.employee.employeeRef }).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cola de RH — solo lo que sigue esperando su revisión, más lo que YA
// revisó (para que vea el desenlace), pero nunca lo de otras personas de RH
// a medio revisar por nadie más — no aplica aquí porque no hay "asignado a
// mí" en RH, cualquiera con el permiso ve toda la cola, igual que Sistemas
// ve todos los tickets.
router.get('/pending-rh', employeeAuth, async (req, res) => {
  try {
    const requests = await OffboardingRequest.find({}).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id/rh-approve', employeeAuth, async (req, res) => {
  try {
    const request = await OffboardingRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente_rh') return res.status(400).json({ message: 'Esta solicitud ya no está pendiente de RH' });

    const reviewer = await Employee.findById(req.employee.employeeRef);
    request.rhReviewedByName = reviewer?.name || req.employee.name || '';
    request.rhReviewedAt = new Date();

    // Pedido explícito del usuario (2026-07-29): "Sistemas solo hace lo
    // debido con sus activos" — si la persona no tiene NADA asignado
    // ahorita (chequeo en vivo, no el `assetsSnapshot` guardado al crear la
    // solicitud — pudo cambiar desde entonces), no tiene caso mandarle la
    // baja a Sistemas para que no haga nada. Se cierra aquí mismo, con RH.
    const activeAssignments = await Assignment.countDocuments({ employee: request.employeeRef, active: true });
    if (activeAssignments === 0) {
      const employee = await Employee.findById(request.employeeRef);
      if (employee && employee.active) {
        employee.active = false;
        await employee.save();
      }
      request.status = 'completada';
      request.freedCount = 0;
      await request.save();

      notifyTelegram(
        `📤 <b>Baja aprobada por RH — sin activos asignados, no pasó a Sistemas</b>\n` +
        `👤 ${request.employeeName}\n` +
        `<a href="${employeeUrl('/mesa-de-ayuda/baja-personal')}">Ver solicitud</a>`
      );

      return res.json(request);
    }

    request.status = 'pendiente_sistemas';
    await request.save();

    notifyTelegram(
      `📤 <b>Baja aprobada por RH, pendiente de Sistemas</b>\n` +
      `👤 ${request.employeeName}\n` +
      `🎒 Activos a liberar: ${activeAssignments}\n` +
      `<a href="${adminUrl('/offboarding-requests')}">Ver solicitud</a>`
    );

    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/rh-reject', employeeAuth, async (req, res) => {
  try {
    const request = await OffboardingRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente_rh') return res.status(400).json({ message: 'Esta solicitud ya no está pendiente de RH' });

    const reviewer = await Employee.findById(req.employee.employeeRef);
    request.status = 'rechazada_rh';
    request.rhReviewedByName = reviewer?.name || req.employee.name || '';
    request.rhReviewedAt = new Date();
    request.rhRejectionReason = req.body.reason || '';
    await request.save();

    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// De aquí para abajo, exclusivo de Sistemas (Sistemas es quien de verdad
// marca al empleado inactivo y libera sus activos — sin cambios sobre ese
// mecanismo, ya probado y en uso desde Empleados).
router.use(auth, adminOnly);

// Pedido explícito del usuario (2026-07-29): "Sistemas no tiene por qué
// estar viendo los motivos de bajas" (renuncia/despido/fallecimiento/etc.)
// — eso es asunto de RH. Se excluyen aquí (y en las respuestas de
// complete/sistemas-reject más abajo), no solo se ocultan en el frontend,
// para que ni siquiera viajen a la sesión de Sistemas.
router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const requests = await OffboardingRequest.find(filter).select('-reasons -reasonOther').sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Un solo clic hace las 2 cosas: marca al empleado inactivo Y libera sus
// activos — se reusa exactamente releaseAssetsOnBaja(), la misma función
// que ya usa PUT /employees/:id cuando Sistemas da de baja manualmente desde
// Empleados. No se duplica esa lógica.
router.put('/:id/complete', async (req, res) => {
  try {
    const request = await OffboardingRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente_sistemas') return res.status(400).json({ message: 'Esta solicitud no está pendiente de Sistemas' });

    const employee = await Employee.findById(request.employeeRef);
    if (!employee) return res.status(404).json({ message: 'El empleado ya no existe en el sistema' });

    let freedCount = 0;
    if (employee.active) {
      employee.active = false;
      await employee.save();
      freedCount = await releaseAssetsOnBaja(employee, req.user);
    }

    request.status = 'completada';
    request.sistemasReviewedByName = req.user.name;
    request.sistemasReviewedAt = new Date();
    request.freedCount = freedCount;
    await request.save();

    logAction(req.user, 'editar', 'empleado', employee._id, employee.name, `Procesó baja de ${employee.name} (desde Solicitud de Baja de RH) — ${freedCount} activo(s) liberado(s)`);

    res.json({ request: stripReason(request), freedCount });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/sistemas-reject', async (req, res) => {
  try {
    const request = await OffboardingRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente_sistemas') return res.status(400).json({ message: 'Esta solicitud no está pendiente de Sistemas' });

    request.status = 'rechazada_sistemas';
    request.sistemasReviewedByName = req.user.name;
    request.sistemasReviewedAt = new Date();
    request.sistemasRejectionReason = req.body.reason || '';
    await request.save();

    res.json(stripReason(request));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const request = await OffboardingRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    logAction(req.user, 'eliminar', 'solicitud_baja', request._id, request.employeeName, `Eliminó solicitud de baja de ${request.employeeName}`);
    res.json({ message: 'Solicitud eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
