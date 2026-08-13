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

// El estatus de la solicitud completa es un AGREGADO de las decisiones por
// activo (ver itemDecisions en el modelo) — nunca se edita suelto.
//
// `status` decide en qué pestaña cae la solicitud (prioridad: si falta
// decidir algo, sigue "pendiente"; si no falta nada por decidir pero algo
// quedó en espera de compras, "en_espera"; si ya no hay nada pendiente ni
// en espera, "aprobada" si se aprobó al menos uno, si no "rechazada").
//
// `statusDetail` es DISTINTO — pedido explícito del usuario (2026-08-06,
// tras probarlo con 1 aprobado + 1 rechazado + 1 en espera en la misma
// solicitud): el resumen se quedaba diciendo solo "en espera" como si nada
// se hubiera decidido, sin mostrar que los otros 2 SÍ tuvieron su propio
// movimiento. Ahora siempre lista el desglose completo por activo, como un
// ticket de compra con estatus por línea, sin importar cuál `status`
// agregado haya quedado.
function computeAggregateStatus(itemDecisions) {
  const pendientes = itemDecisions.filter((d) => d.status === 'pendiente').map((d) => d.label);
  const enEspera = itemDecisions.filter((d) => d.status === 'en_espera').map((d) => d.label);
  const aprobados = itemDecisions.filter((d) => d.status === 'aprobada').map((d) => d.label);
  const rechazados = itemDecisions.filter((d) => d.status === 'rechazada').map((d) => d.label);

  const parts = [];
  if (aprobados.length) parts.push(`✅ Aprobado: ${aprobados.join(', ')}`);
  if (rechazados.length) parts.push(`❌ Rechazado: ${rechazados.join(', ')}`);
  if (enEspera.length) parts.push(`⏳ En espera de compras: ${enEspera.join(', ')}`);
  if (pendientes.length) parts.push(`🕓 Falta decidir: ${pendientes.join(', ')}`);
  const statusDetail = parts.join(' · ');

  if (pendientes.length) return { status: 'pendiente', statusDetail };
  if (enEspera.length) return { status: 'en_espera', statusDetail };
  if (aprobados.length) return { status: 'aprobada', statusDetail };
  return { status: 'rechazada', statusDetail };
}

// Solicitudes de antes de este cambio (2026-08-06) no tienen itemDecisions
// — se reconstruye en memoria a partir del estatus/notas viejos de TODA la
// solicitud, sin necesidad de una migración de datos aparte. Se guarda de
// verdad la primera vez que se toca un item con PUT /:id/items/:idx/decide.
function ensureItemDecisions(request) {
  if (request.itemDecisions?.length === request.resourceItems.length) return;
  const legacyStatus = ['aprobada', 'rechazada'].includes(request.status) ? request.status : 'pendiente';
  const legacyNotes = request.status === 'rechazada' ? request.rejectionReason : request.resolutionNotes;
  request.itemDecisions = request.resourceItems.map((label) => ({
    label,
    status: legacyStatus,
    notes: legacyNotes || '',
    decidedByName: request.reviewedByName || '',
    decidedAt: request.reviewedAt || undefined,
  }));
}

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
    // No usar `Boolean(body.batteryHadBefore)` aquí — eso convertiría un
    // "no contestó" en `false` (que es un valor real: "nunca tuve"),
    // dejando indistinguible de verdad no haber preguntado nada.
    const batteryHadBefore = body.batteryHadBefore === true ? true : body.batteryHadBefore === false ? false : undefined;
    if (resourceItems.includes(BATTERY_OPTION)) {
      if (!['AA', 'AAA'].includes(batteryType)) return res.status(400).json({ message: 'Especifica si la pila es AA o AAA' });
      if (!batteryQuantity || batteryQuantity < 1) return res.status(400).json({ message: 'Especifica cuántas pilas necesitas' });
      if (!batteryUse) return res.status(400).json({ message: 'Especifica el uso designado de la pila' });
      if (batteryHadBefore === undefined) return res.status(400).json({ message: 'Especifica si ya tenías pila para ese uso' });
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
      batteryHadBefore: resourceItems.includes(BATTERY_OPTION) ? batteryHadBefore : undefined,
      itemDecisions: resourceItems.map((label) => ({ label, status: 'pendiente' })),
      statusDetail: `🕓 Falta decidir: ${resourceItems.join(', ')}`,
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
        if (it === BATTERY_OPTION) return `${it} (${batteryType} x${batteryQuantity} — ${batteryUse}${batteryHadBefore ? ' — reemplazo' : ' — primera vez'})`;
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
    // Corrección explícita del usuario (2026-08-11, tercera vuelta): una
    // solicitud redirigida a Ticket se oculta AQUÍ también — el aviso
    // amarillo vive del lado nuevo (Mis Tickets, ver
    // raw.redirectedFromResourceRequest), no aquí. Mis Solicitudes no
    // tiene pestañas por estatus como el panel admin (es una sola lista
    // plana de todo lo que el empleado ha mandado), así que "ocultar de la
    // pestaña activa" aquí es simplemente "ocultar del todo".
    const requests = await ResourceRequest.find({ submitterRef: req.employee.employeeRef, redirectedToTicket: null }).sort({ createdAt: -1 });
    requests.forEach(ensureItemDecisions);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) {
      filter.status = req.query.status;
      // Pedido explícito del usuario (2026-08-11, aclarando lo anterior): el
      // aviso amarillo es EXCLUSIVO de Mesa de Ayuda (ver MisSolicitudes.jsx/
      // MisTickets.jsx) — aquí, en el panel de Sistemas, una solicitud
      // redirigida a Ticket sigue sin contar en sus pestañas de estatus (el
      // trabajo real ya vive en Tickets); solo se ve completa en "Todas".
      filter.redirectedToTicket = null;
    }
    const requests = await ResourceRequest.find(filter).sort({ createdAt: -1 });
    requests.forEach(ensureItemDecisions);
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Decide UN activo de la solicitud (aprobar/rechazar/poner en espera) —
// reemplaza los antiguos PUT /:id/approve y PUT /:id/reject, que resolvían
// TODA la solicitud de un jalón. Pedido explícito del usuario (2026-08-06):
// "si piden 2 cosas, apruebo, rechazo o pongo pendiente por cada uno" — ya
// no hay que rechazar toda la solicitud solo porque uno de los 2 activos no
// está disponible.
router.put('/:id/items/:idx/decide', async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    ensureItemDecisions(request);

    const idx = Number(req.params.idx);
    const item = request.itemDecisions[idx];
    if (!item) return res.status(404).json({ message: 'Ese activo no está en esta solicitud' });

    const { status, notes, confirmChange } = req.body;
    if (!['aprobada', 'rechazada', 'en_espera'].includes(status)) {
      return res.status(400).json({ message: 'Estatus inválido' });
    }
    // Pedido explícito del usuario (2026-08-13): "si yo ya puse aceptado,
    // rechazado o en espera, me sigue dejando poner una opción... que ya
    // quede la decisión definitiva" — una vez decidido, cambiarlo exige
    // confirmación explícita (`confirmChange`, el frontend ya la pide con
    // un diálogo antes de mandarla) — no aplica la primera vez (item.status
    // sigue en 'pendiente').
    if (item.status !== 'pendiente' && !confirmChange) {
      return res.status(400).json({
        message: `"${item.label}" ya se marcó como "${item.status}" — confirma que quieres cambiar la decisión.`,
      });
    }

    item.status = status;
    item.notes = (notes || '').trim();
    item.decidedByName = req.user.name;
    item.decidedAt = new Date();

    // Reemplaza la firma en papel de "ENTREGA DE PILA RECARGABLE" — igual
    // que antes, aprobar y entregar pueden pasar en momentos distintos (ver
    // PUT /:id/confirm-delivery más abajo).
    if (item.label === BATTERY_OPTION && status === 'aprobada') {
      const deliveryReceivedByName = (req.body.deliveryReceivedByName || '').trim();
      if (deliveryReceivedByName && req.body.deliveryConfirmed) {
        request.deliveryReceivedByName = deliveryReceivedByName;
        request.deliveryConfirmed = true;
      }
    }

    // Si pidieron "Otro (especifica)" y se marcó agregarlo al aprobarlo,
    // queda como casilla normal para la próxima solicitud.
    if (item.label === 'Otro (especifica)' && status === 'aprobada' && req.body.addToCatalog && request.otherDetail) {
      try {
        await CustomResourceOption.create({ label: request.otherDetail, addedByName: req.user.name });
      } catch (err) {
        if (err.code !== 11000) throw err; // 11000 = ya existía, se ignora
      }
    }

    // Pedido explícito del usuario (2026-07-27): "instalar un programa
    // nuevo" se pide como Solicitud de Recurso, pero al aprobarse sí
    // requiere un procedimiento técnico — se genera un ticket de
    // seguimiento, SOLO para "Software o Licencia" y SOLO la primera vez
    // que se aprueba ese item específico (evita duplicarlo si se vuelve a
    // tocar el mismo item por error).
    let followUpTicket = null;
    if (item.label === 'Software o Licencia' && status === 'aprobada' && !item.followUpTicketFolio) {
      followUpTicket = await Ticket.create({
        employeeName: request.employeeName,
        employeeRef: request.employeeRef || undefined,
        ticketType: 'software_pc',
        subject: `Instalar: ${request.licenseDetail || 'software/licencia solicitada'}`,
        description: `Ticket generado automáticamente al aprobarse la Solicitud de Recursos de ${request.employeeName}` +
          `${request.position ? ` (${request.position})` : ''}.\n\nJustificación de la solicitud: ${request.justification || '—'}`,
      });
      item.followUpTicketFolio = followUpTicket.folio;
      logAction(req.user, 'crear', 'ticket', followUpTicket._id, followUpTicket.subject,
        `Ticket ${followUpTicket.folio} generado al aprobar la Solicitud de Recursos de ${request.employeeName}`);
      notifyTelegram(
        `🎫 <b>Ticket de instalación generado</b>\n` +
        `Solicitud de Recursos de ${request.employeeName} aprobada — folio ${followUpTicket.folio}\n` +
        `🏷️ ${request.licenseDetail || 'software/licencia'}\n` +
        `<a href="${adminUrl(`/tickets/general?ticket=${followUpTicket._id}`)}">Ver ticket</a>`
      );
    }

    const { status: aggStatus, statusDetail } = computeAggregateStatus(request.itemDecisions);
    request.status = aggStatus;
    request.statusDetail = statusDetail;
    if (aggStatus !== 'pendiente') {
      request.reviewedByName = req.user.name;
      request.reviewedAt = new Date();
    }
    await request.save();

    const STATUS_VERB = { aprobada: 'Aprobó', rechazada: 'Rechazó', en_espera: 'Puso en espera' };
    logAction(req.user, 'editar', 'solicitud_recurso', request._id, request.employeeName,
      `${STATUS_VERB[status]} "${item.label}" en la solicitud de ${request.employeeName}`);

    res.json({ ...request.toObject(), followUpTicketFolio: followUpTicket?.folio });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Editar SOLO la nota de un activo ya decidido (2026-08-13) — pedido
// explícito del usuario: "si se me fue de ponerle nota, que me deje editar
// la nota nada más, pero que ya quede seguro" — a diferencia de PUT
// /:id/items/:idx/decide (arriba), esto nunca toca status/decidedByName/
// decidedAt, así que no necesita `confirmChange`: no es "cambiar la
// decisión", solo anotarla.
router.put('/:id/items/:idx/notes', async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    ensureItemDecisions(request);

    const idx = Number(req.params.idx);
    const item = request.itemDecisions[idx];
    if (!item) return res.status(404).json({ message: 'Ese activo no está en esta solicitud' });

    item.notes = (req.body.notes || '').trim();
    await request.save();
    logAction(req.user, 'editar', 'solicitud_recurso', request._id, request.employeeName,
      `Editó la nota de "${item.label}" en la solicitud de ${request.employeeName}`);
    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Confirma la entrega de la pila recargable cuando no se hizo al momento de
// aprobar (ver arriba) — la "firma" digital que reemplaza la hoja de papel,
// para cuando aprobar y entregar pasan en momentos distintos.
router.put('/:id/confirm-delivery', async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    ensureItemDecisions(request);
    const batteryItem = request.itemDecisions.find((d) => d.label === BATTERY_OPTION);
    if (!batteryItem) return res.status(400).json({ message: 'Esta solicitud no incluye una pila recargable' });
    if (batteryItem.status !== 'aprobada') return res.status(400).json({ message: 'La pila recargable de esta solicitud todavía no está aprobada' });

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

// Redirigir a Ticket (2026-08-07) — misma idea que
// PUT /tickets/:id/redirect-to-resource-request, en dirección contraria:
// algo que llegó como Solicitud de Recursos pero en realidad se trabaja
// como ticket (ej. "instalación de licencia"). Crea el ticket equivalente
// y deja la marca en la solicitud — la solicitud SIGUE funcionando
// normal, es solo un aviso visual.
router.put('/:id/redirect-to-ticket', async (req, res) => {
  try {
    const request = await ResourceRequest.findById(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    if (request.redirectedToTicket) {
      return res.status(400).json({ message: 'Esta solicitud ya está redirigida a un ticket' });
    }

    const reason = (req.body.reason || '').trim();
    const itemsLabel = (request.resourceItems || []).join(', ') || 'Recurso';

    const ticket = await Ticket.create({
      employeeName: request.employeeName,
      employeeRef: request.employeeRef || undefined,
      ticketType: 'otro',
      otherTypeDetail: itemsLabel,
      subject: `Solicitud de Recursos redirigida: ${itemsLabel}`,
      description: request.justification || itemsLabel,
      // Marca de origen (2026-08-11, pedido explícito del usuario: "si lo
      // muevo de solicitudes a tickets debe verse así [amarillo] y
      // viceversa") — mismo patrón que ya usa PUT /:id/redirect-to-ticket
      // en tickets.js (raw.redirectedFromTicket) en la otra dirección, solo
      // que ese nunca se mostraba en ningún lado; ver TicketCard.jsx/
      // TicketDetailModal.jsx.
      raw: { redirectedFromResourceRequest: request._id, redirectedFromReason: reason },
    });

    request.redirectedToTicket = ticket._id;
    request.redirectReason = reason;
    request.redirectedByName = req.user.name;
    request.redirectedAt = new Date();
    await request.save();

    logAction(req.user, 'editar', 'solicitud_recurso', request._id, request.employeeName,
      `Redirigió la solicitud de ${request.employeeName} al ticket ${ticket.folio}${reason ? `: ${reason}` : ''}`);
    logAction(req.user, 'crear', 'ticket', ticket._id, ticket.subject,
      `Creado al redirigir la Solicitud de Recursos de ${request.employeeName}${reason ? `: ${reason}` : ''}`);

    res.json({ request, ticketId: ticket._id, ticketFolio: ticket.folio });
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
