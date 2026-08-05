const router = require('express').Router();
const ResourceRequest = require('../models/ResourceRequest');
const CustomResourceOption = require('../models/CustomResourceOption');
const Employee = require('../models/Employee');
const Ticket = require('../models/Ticket');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const employeeAuth = require('../middleware/employeeAuth');
const optionalEmployeeAuth = require('../middleware/optionalEmployeeAuth');
const { notifyTelegram } = require('../utils/telegram');
const { adminUrl } = require('../utils/portalLinks');
const logAction = require('../utils/audit');

const BATTERY_OPTION = 'Pila recargable';

// Límite simple por IP para la ruta pública — mismo criterio que
// accountRequests.js y onboardingRequests.js.
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

// Formulario público (sin JWT) — reemplaza el Excel "FORMATO DE SOLICITUD DE
// RECURSOS Y SERVICIOS" que se llenaba e imprimía a mano. Protegido con
// límite por IP + honeypot, igual que Solicitud de Cuentas / Ingreso.
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

    const resourceItems = Array.isArray(body.resourceItems) ? body.resourceItems.filter(Boolean) : [];
    if (!resourceItems.length) return res.status(400).json({ message: 'Selecciona al menos un recurso' });
    const licenseDetail = (body.licenseDetail || '').trim();
    if (resourceItems.includes('Software o Licencia') && !licenseDetail) {
      return res.status(400).json({ message: 'Especifica qué software o licencia necesitas' });
    }
    const otherDetail = (body.otherDetail || '').trim();
    if (resourceItems.includes('Otro (especifica)') && !otherDetail) {
      return res.status(400).json({ message: 'Especifica qué otro recurso necesitas' });
    }
    const batteryType = body.batteryType;
    const batteryQuantity = Number(body.batteryQuantity);
    const batteryUse = (body.batteryUse || '').trim();
    if (resourceItems.includes(BATTERY_OPTION)) {
      if (!['AA', 'AAA'].includes(batteryType)) return res.status(400).json({ message: 'Especifica si la pila es AA o AAA' });
      if (!batteryQuantity || batteryQuantity < 1) return res.status(400).json({ message: 'Especifica cuántas pilas necesitas' });
      if (!batteryUse) return res.status(400).json({ message: 'Especifica el uso designado de la pila' });
    }
    if (!(body.justification || '').trim()) return res.status(400).json({ message: 'Falta la justificación de la solicitud' });

    // Pedido explícito del usuario (2026-07-27): "si yo entro con X correo,
    // ya las cosas deberían salir a mi nombre, como los tickets" — si hay
    // sesión de portal activa (optionalEmployeeAuth), se resuelve DIRECTO
    // por el propio employeeRef, sin necesitar `body.employeeId`/
    // `employeeName`. Sin sesión, sigue la validación de siempre: antes esto
    // solo validaba el FORMATO del id (regex), nunca que de verdad existiera
    // un Employee así — se revalida aquí (no solo del lado del formulario)
    // para poder rechazar cuentas de uso múltiple (ej. "Auxiliar
    // Devoluciones"), que ya no pueden pedir un recurso personal.
    let matchedEmployee;
    if (req.employee?.employeeRef) {
      matchedEmployee = await Employee.findOne({ _id: req.employee.employeeRef, active: true });
      if (!matchedEmployee) return res.status(400).json({ message: 'Tu sesión ya no es válida — vuelve a iniciar sesión.' });
    } else {
      if (!/^[a-f0-9]{24}$/i.test(body.employeeId || '')) {
        return res.status(400).json({ message: 'Escribe tu nombre y selecciónalo de la lista de sugerencias.' });
      }
      matchedEmployee = await Employee.findOne({ _id: body.employeeId, active: true });
      if (!matchedEmployee) {
        return res.status(400).json({ message: 'No encontramos ese empleado — selecciona tu nombre de la lista de sugerencias.' });
      }
    }
    if (matchedEmployee.isSharedAccount) {
      return res.status(400).json({ message: 'Esta es una cuenta de uso múltiple — no puede solicitar recursos personales.' });
    }
    const employeeId = matchedEmployee._id;
    const employeeName = req.employee?.employeeRef ? matchedEmployee.name : (body.employeeName || '').trim();
    if (!employeeName) return res.status(400).json({ message: 'Falta tu nombre completo' });
    const position = req.employee?.employeeRef
      ? (matchedEmployee.position || '')
      : (body.position || '').trim();
    const department = req.employee?.employeeRef
      ? [matchedEmployee.area, matchedEmployee.department].filter(Boolean).join(' / ')
      : (body.department || '').trim();

    const request = await ResourceRequest.create({
      employeeName,
      position,
      department,
      employeeRef: employeeId,
      resourceItems,
      licenseDetail,
      otherDetail,
      batteryType: resourceItems.includes(BATTERY_OPTION) ? batteryType : undefined,
      batteryQuantity: resourceItems.includes(BATTERY_OPTION) ? batteryQuantity : undefined,
      batteryUse: resourceItems.includes(BATTERY_OPTION) ? batteryUse : '',
      justification: (body.justification || '').trim(),
      requestedByEmail: req.employee?.employeeRef
        ? (matchedEmployee.corporateEmails?.[0] || '').toLowerCase()
        : (body.requestedByEmail || '').trim().toLowerCase(),
      submitterRef: req.employee?.employeeRef,
      raw: body,
    });

    const itemsLabel = resourceItems
      .map((it) => {
        if (it === 'Software o Licencia' && licenseDetail) return `${it} (${licenseDetail})`;
        if (it === 'Otro (especifica)' && otherDetail) return `${it}: ${otherDetail}`;
        if (it === BATTERY_OPTION) return `${it} (${batteryType} x${batteryQuantity} — ${batteryUse})`;
        return it;
      })
      .join(', ');
    notifyTelegram(
      `📦 <b>Nueva Solicitud de Recursos</b>\n` +
      `👤 ${employeeName}${request.position ? ` — ${request.position}` : ''}\n` +
      `🏷️ ${itemsLabel}\n` +
      `<a href="${adminUrl('/resource-requests')}">Ver solicitud</a>`
    );

    res.status(201).json({ id: request._id });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Opciones "de catálogo" que se han ido agregando desde solicitudes previas
// (ver PUT /:id/approve-custom-option abajo) — públicas para que el
// formulario las muestre como casilla normal, sin necesitar login.
router.get('/custom-options/public', async (req, res) => {
  try {
    const options = await CustomResourceOption.find().sort({ label: 1 }).select('label');
    res.json(options.map((o) => o.label));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Solicitudes que YO envié logueado en el portal de empleado (ver "Mis
// Solicitudes") — no requiere permiso de admin, solo sesión de empleado.
router.get('/mine', employeeAuth, async (req, res) => {
  try {
    const requests = await ResourceRequest.find({ submitterRef: req.employee.employeeRef }).sort({ createdAt: -1 });
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
    const requests = await ResourceRequest.find(filter).sort({ createdAt: -1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id/approve', async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente') return res.status(400).json({ message: 'Esta solicitud ya fue resuelta' });

    // Reemplaza la firma en papel de "ENTREGA DE PILA RECARGABLE". Aprobar y
    // entregar pueden pasar en momentos distintos (se aprueba la solicitud
    // primero, la pila se entrega físicamente después) — si en este momento
    // ya se tiene el nombre de quien recibió, se guarda de una vez; si no,
    // queda `deliveryConfirmed: false` y la solicitud se ve marcada como
    // "pendiente de entregar" hasta que se confirme con PUT /:id/confirm-delivery.
    if (request.resourceItems.includes(BATTERY_OPTION)) {
      const deliveryReceivedByName = (req.body.deliveryReceivedByName || '').trim();
      if (deliveryReceivedByName && req.body.deliveryConfirmed) {
        request.deliveryReceivedByName = deliveryReceivedByName;
        request.deliveryConfirmed = true;
      }
    }

    request.status = 'aprobada';
    request.resolutionNotes = req.body.resolutionNotes || '';
    request.reviewedByName = req.user.name;
    request.reviewedAt = new Date();
    await request.save();

    // Si pidieron "Otro (especifica)" y se marcó agregarlo, queda como
    // casilla normal para la próxima solicitud — así el catálogo crece con
    // el tiempo en vez de quedar fijo para siempre.
    if (req.body.addToCatalog && request.otherDetail) {
      try {
        await CustomResourceOption.create({ label: request.otherDetail, addedByName: req.user.name });
      } catch (err) {
        if (err.code !== 11000) throw err; // 11000 = ya existía, se ignora
      }
    }

    // Pedido explícito del usuario (2026-07-27), de la sesión de revisión:
    // "instalar un programa nuevo" se pide como Solicitud de Recurso (no
    // como ticket) porque es una solicitud de algo nuevo, no una falla —
    // pero al aprobarse, en el fondo sí requiere un procedimiento técnico
    // que alguien tiene que ejecutar. Se genera un ticket de seguimiento
    // para que ese trabajo quede documentado y medido como el resto del
    // soporte. SOLO para "Software o Licencia" — el usuario fue explícito
    // en que accesorios/línea telefónica (entrega directa de stock, sin
    // instalación) no necesitan esto.
    let followUpTicket = null;
    if (request.resourceItems.includes('Software o Licencia')) {
      followUpTicket = await Ticket.create({
        employeeName: request.employeeName,
        employeeRef: request.employeeRef || undefined,
        ticketType: 'software_pc',
        subject: `Instalar: ${request.licenseDetail || 'software/licencia solicitada'}`,
        description: `Ticket generado automáticamente al aprobarse la Solicitud de Recursos de ${request.employeeName}` +
          `${request.position ? ` (${request.position})` : ''}.\n\nJustificación de la solicitud: ${request.justification || '—'}`,
      });
      logAction(req.user, 'crear', 'ticket', followUpTicket._id, followUpTicket.subject,
        `Ticket ${followUpTicket.folio} generado al aprobar la Solicitud de Recursos de ${request.employeeName}`);
      notifyTelegram(
        `🎫 <b>Ticket de instalación generado</b>\n` +
        `Solicitud de Recursos de ${request.employeeName} aprobada — folio ${followUpTicket.folio}\n` +
        `🏷️ ${request.licenseDetail || 'software/licencia'}\n` +
        `<a href="${adminUrl(`/tickets/general?ticket=${followUpTicket._id}`)}">Ver ticket</a>`
      );
    }

    logAction(req.user, 'aprobar', 'solicitud_recurso', request._id, request.employeeName, `Aprobó solicitud de recursos de ${request.employeeName}`);

    res.json({ ...request.toObject(), followUpTicketFolio: followUpTicket?.folio });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Confirma la entrega de la pila recargable cuando no se hizo al momento de
// aprobar (ver PUT /:id/approve) — la "firma" digital que reemplaza la hoja
// de papel, para cuando aprobar y entregar pasan en momentos distintos.
router.put('/:id/confirm-delivery', async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'aprobada') return res.status(400).json({ message: 'Esta solicitud aún no está aprobada' });
    if (!request.resourceItems.includes(BATTERY_OPTION)) return res.status(400).json({ message: 'Esta solicitud no incluye una pila recargable' });

    const deliveryReceivedByName = (req.body.deliveryReceivedByName || '').trim();
    if (!deliveryReceivedByName || !req.body.deliveryConfirmed) {
      return res.status(400).json({ message: 'Confirma quién recibió la pila (nombre + checkbox de confirmación)' });
    }
    request.deliveryReceivedByName = deliveryReceivedByName;
    request.deliveryConfirmed = true;
    await request.save();

    logAction(req.user, 'editar', 'solicitud_recurso', request._id, request.employeeName, `Confirmó entrega de pila recargable a ${request.employeeName}`);

    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/reject', async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.status !== 'pendiente') return res.status(400).json({ message: 'Esta solicitud ya fue resuelta' });

    request.status = 'rechazada';
    request.rejectionReason = req.body.reason || '';
    request.reviewedByName = req.user.name;
    request.reviewedAt = new Date();
    await request.save();

    logAction(req.user, 'rechazar', 'solicitud_recurso', request._id, request.employeeName, `Rechazó solicitud de recursos de ${request.employeeName}`);

    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const request = await ResourceRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    logAction(req.user, 'eliminar', 'solicitud_recurso', request._id, request.employeeName, `Eliminó solicitud de recursos de ${request.employeeName}`);
    res.json({ message: 'Solicitud eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
