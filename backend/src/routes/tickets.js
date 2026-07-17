const router = require('express').Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const Ticket = require('../models/Ticket');
const TicketResolutionOption = require('../models/TicketResolutionOption');
const InternalApp = require('../models/InternalApp');
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const employeeAuth = require('../middleware/employeeAuth');
const { notifyTelegram } = require('../utils/telegram');
const { GERENTE_SISTEMAS_EMAIL } = require('../utils/pdfBranding');
const logAction = require('../utils/audit');

// Todos son admin, pero un ticket ya asignado sigue siendo "de quien lo está
// atendiendo" — pedido explícito: aunque cualquier admin puede VER la lista
// completa, solo quien lo tiene asignado (o el Gerente de Sistemas, con
// visibilidad total) puede modificarlo/reasignarlo/eliminarlo. Un ticket SIN
// asignar sigue abierto a cualquiera (alguien tiene que poder tomarlo).
function canManageTicket(req, ticket) {
  if (req.user.email === GERENTE_SISTEMAS_EMAIL) return true;
  if (!ticket.assignedTo) return true;
  return String(ticket.assignedTo) === String(req.user.id);
}

const ALLOWED_ATTACHMENT_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — de sobra para una foto de celular
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan JPG, PNG, HEIC o PDF como evidencia'));
    }
    cb(null, true);
  },
});

function assetLabel(asset) {
  if (!asset) return '';
  return [asset.brand, asset.model].filter(Boolean).join(' ') + (asset.serialNumber ? ` (${asset.serialNumber})` : '');
}

// Cierre automático — un ticket "resuelto" sin que el empleado responda en
// AUTO_CLOSE_DAYS pasa solo a "cerrado" (se entiende que sí quedó bien). No
// hay cron real en este proyecto (Render free tier se duerme y no lo
// correría de todos modos), así que se revisa "perezosamente": cada vez que
// se pide la lista de tickets (admin o empleado), primero se cierran los que
// ya cumplieron el plazo. Un mensaje nuevo del empleado ya reabre el ticket
// (ver POST /:id/messages) antes de que esto aplique, así que nunca cierra
// uno que sigue en curso.
const AUTO_CLOSE_DAYS = 5;
async function autoCloseStaleResolved() {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000);
  await Ticket.updateMany(
    { status: 'resuelto', resolvedAt: { $lte: cutoff } },
    { $set: { status: 'cerrado' } },
  );
}

// Requiere sesión de EMPLEADO (portal Mis Tickets, ver employeeAuth.js) —
// ya no es anónimo. La identidad (nombre/employeeRef) viene del propio JWT,
// nunca de lo que mande el formulario, así que a diferencia de la versión
// anterior no hay nada que "emparejar por nombre": el activo(s) asignado(s)
// se busca directo por el _id real del empleado autenticado.
router.post('/mine', employeeAuth, (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la evidencia' });
    next();
  });
}, async (req, res) => {
  try {
    const body = req.body || {};
    if (!Ticket.TICKET_TYPES.includes(body.ticketType)) {
      return res.status(400).json({ message: 'Selecciona el tipo de soporte' });
    }
    const otherTypeDetail = (body.otherTypeDetail || '').trim();
    if (body.ticketType === 'otro' && !otherTypeDetail) {
      return res.status(400).json({ message: 'Especifica de qué se trata el ticket' });
    }
    const subject = (body.subject || '').trim();
    if (!subject) return res.status(400).json({ message: 'Falta el asunto del ticket' });

    // Igual que antes: se acepta solo si de verdad existe y está activa —
    // es un selector controlado (viene de GET /internal-apps/public), pero
    // se revalida por si llega manipulado.
    let appRef;
    let appName = '';
    if (/^[a-f0-9]{24}$/i.test(body.appRef || '')) {
      const app = await InternalApp.findOne({ _id: body.appRef, active: true }).select('name');
      if (app) { appRef = app._id; appName = app.name; }
    }

    const assignments = await Assignment.find({ employee: req.employee.employeeRef, active: true })
      .populate('asset', 'type brand model serialNumber');
    const assets = assignments.map((a) => a.asset).filter(Boolean);
    const assetRefs = assets.map((a) => a._id);

    const ticket = await Ticket.create({
      employeeName: req.employee.name,
      employeeRef: req.employee.employeeRef,
      assetRefs,
      appRef,
      ticketType: body.ticketType,
      otherTypeDetail,
      subject,
      description: (body.description || '').trim(),
      blocksWork: body.blocksWork === 'true' || body.blocksWork === true,
      attachmentData:     req.file?.buffer,
      attachmentMimeType:  req.file?.mimetype || '',
      attachmentFileName:  req.file?.originalname || '',
      raw: body,
    });

    notifyTelegram(
      `🎫 <b>Nuevo ticket de soporte</b>\n` +
      `Folio: ${ticket.folio}\n` +
      `👤 ${req.employee.name}\n` +
      `🏷️ ${Ticket.TICKET_TYPE_LABELS[ticket.ticketType]}${otherTypeDetail ? `: ${otherTypeDetail}` : ''}${ticket.blocksWork ? ' · ⚠️ le impide trabajar' : ''}\n` +
      (assets.length ? `💻 ${assets.map(assetLabel).join(' · ')}\n` : '') +
      (appName ? `🗂️ Aplicación: ${appName}\n` : '') +
      `📝 ${subject}\n` +
      `Revisa en Tickets.`
    );

    res.status(201).json({ id: ticket._id, folio: ticket.folio });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Historial del propio empleado — la Mesa de Ayuda ("Mis Tickets") lo pinta
// como una conversación (reporte inicial + resolución de Sistemas si ya la
// hay), reutilizando los mismos campos que ya existen en el ticket.
router.get('/mine', employeeAuth, async (req, res) => {
  try {
    await autoCloseStaleResolved();
    const tickets = await Ticket.find({ employeeRef: req.employee.employeeRef })
      .populate('appRef', 'name')
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// El empleado da seguimiento a su propio ticket — conversación de ida y
// vuelta real, no solo el reporte inicial + resolución formal. Un mensaje
// nuevo sobre un ticket ya "resuelto" implica que el problema sigue, así
// que se reabre solo (mismo criterio que ya usa el "Reabrir" manual de
// Sistemas: limpia la resolución anterior, para que no quede colgada como
// si todavía aplicara).
router.post('/:id/messages', employeeAuth, (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la imagen' });
    next();
  });
}, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (String(ticket.employeeRef) !== String(req.employee.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }
    if (ticket.status === 'cerrado') {
      return res.status(400).json({ message: 'Este ticket ya está cerrado — reporta uno nuevo si el problema sigue.' });
    }
    const text = (req.body.text || '').trim();
    if (!text && !req.file) return res.status(400).json({ message: 'Escribe un mensaje o adjunta una imagen' });

    ticket.messages.push({
      from: 'employee',
      authorName: req.employee.name,
      text,
      attachmentData:     req.file?.buffer,
      attachmentMimeType:  req.file?.mimetype || '',
      attachmentFileName:  req.file?.originalname || '',
    });
    if (ticket.status === 'resuelto') {
      ticket.status = 'abierto';
      ticket.resolution = '';
      ticket.resolutionNotes = '';
      ticket.resolvedByName = '';
      ticket.resolvedAt = undefined;
      // Se reabrió — la calificación anterior ya no aplica a esta nueva
      // vuelta; puede volver a calificar cuando se resuelva otra vez.
      ticket.satisfactionRating = null;
    }
    await ticket.save();

    notifyTelegram(
      `💬 <b>Nuevo mensaje en ${ticket.folio}</b>\n` +
      `👤 ${req.employee.name}\n` +
      `📝 ${text || '[imagen adjunta]'}\n` +
      `Revisa en Tickets.`
    );

    res.status(201).json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// El empleado confirma que ya quedó resuelto y lo cierra él mismo — no hace
// falta esperar los 5 días del cierre automático (autoCloseStaleResolved) si
// ya sabe que no lo va a necesitar reabrir.
router.post('/:id/close', employeeAuth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (String(ticket.employeeRef) !== String(req.employee.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }
    if (ticket.status !== 'resuelto') {
      return res.status(400).json({ message: 'Solo se puede cerrar un ticket ya resuelto' });
    }
    ticket.status = 'cerrado';
    await ticket.save();
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Encuesta de satisfacción (CSAT) — solo el empleado dueño del ticket, y solo
// una vez resuelto/cerrado. Se puede volver a llamar para cambiar la
// respuesta (no se guarda historial, solo el valor actual).
router.post('/:id/satisfaction', employeeAuth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (String(ticket.employeeRef) !== String(req.employee.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }
    if (!['resuelto', 'cerrado'].includes(ticket.status)) {
      return res.status(400).json({ message: 'Este ticket todavía no está resuelto' });
    }
    if (ticket.satisfactionRating) {
      return res.status(400).json({ message: 'Ya calificaste este ticket.' });
    }
    const { rating } = req.body;
    if (!Ticket.schema.path('satisfactionRating').enumValues.includes(rating)) {
      return res.status(400).json({ message: 'Calificación inválida' });
    }
    ticket.satisfactionRating = rating;
    await ticket.save();
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Imagen adjunta a un mensaje de la conversación — la puede pedir cualquiera
// de los dos lados (el empleado que la mandó/recibió, o Sistemas), así que
// a diferencia del resto de rutas de este archivo no puede colgarse ni de
// employeeAuth ni de adminOnly a secas (cualquiera de los dos bloquearía al
// otro). Se valida el JWT a mano (mismo secreto/librería que auth.js y
// employeeAuth.js) y solo se restringe la propiedad del ticket si el token
// es de empleado.
router.get('/:id/messages/:messageId/attachment', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Sin sesión' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Sesión inválida' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (payload.type === 'employee' && String(ticket.employeeRef) !== String(payload.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }

    const message = ticket.messages.id(req.params.messageId);
    if (!message || !message.attachmentData) return res.status(404).json({ message: 'Sin imagen adjunta' });
    res.setHeader('Content-Type', message.attachmentMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${message.attachmentFileName || 'imagen'}"`);
    res.end(message.attachmentData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  try {
    await autoCloseStaleResolved();
    const filter = {};
    if (req.query.status) filter.status = { $in: req.query.status.split(',') };
    // assetRefs es un arreglo — una igualdad simple contra un campo arreglo
    // en Mongo ya busca "¿está este valor DENTRO del arreglo?", así que
    // filtrar por un solo activo sigue funcionando igual que antes.
    if (req.query.assetRef) filter.assetRefs = req.query.assetRef;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    const tickets = await Ticket.find(filter)
      .populate('assetRefs', 'type brand model serialNumber inventoryTag')
      .populate('assignedTo', 'name')
      .populate('appRef', 'name responsibleName responsibleArea')
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cuántos tickets tiene cada activo (para el badge en Activos) — un solo
// query agregado en vez de pedirlo activo por activo. $unwind separa cada
// elemento de assetRefs en su propio documento antes de agrupar, para que
// un ticket con 2 equipos cuente para cada uno de los dos.
router.get('/counts-by-asset', async (req, res) => {
  try {
    const counts = await Ticket.aggregate([
      { $match: { assetRefs: { $ne: [] } } },
      { $unwind: '$assetRefs' },
      { $group: { _id: '$assetRefs', count: { $sum: 1 } } },
    ]);
    res.json(counts.map((c) => ({ assetRef: c._id, count: c.count })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/resolution-options', async (req, res) => {
  try {
    const options = await TicketResolutionOption.find().sort({ label: 1 }).select('label');
    res.json(options.map((o) => o.label));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Ticket individual — usado para refrescar la conversación en vivo (polling)
// sin tener que volver a pedir el tablero completo cada vez.
router.get('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('assetRefs', 'type brand model serialNumber inventoryTag')
      .populate('assignedTo', 'name')
      .populate('appRef', 'name responsibleName responsibleArea');
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/attachment', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !ticket.attachmentData) return res.status(404).json({ message: 'Sin evidencia adjunta' });
    res.setHeader('Content-Type', ticket.attachmentMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${ticket.attachmentFileName || 'evidencia'}"`);
    res.end(ticket.attachmentData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id/assign', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Este ticket ya está asignado a alguien más' });
    }

    const { userId, userName } = req.body;
    ticket.assignedTo = userId || null;
    ticket.assignedByName = userName || '';
    ticket.assignedAt = new Date();
    // Asignar implica que ya alguien lo está viendo — si seguía "abierto" pasa a "en proceso".
    if (ticket.status === 'abierto') ticket.status = 'en_proceso';
    await ticket.save();

    logAction(req.user, 'asignar', 'ticket', ticket._id, ticket.subject, `Asignó el ticket ${ticket.folio} a ${userName || 'nadie'}`);

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// La prioridad la fija Sistemas al triage (ver Ticket.js) — independiente
// del estatus, para poder medir/ordenar por urgencia sin que eso implique
// asignar ni resolver nada todavía.
router.put('/:id/priority', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    const { priority } = req.body;
    if (!['baja', 'media', 'alta', 'critica'].includes(priority)) {
      return res.status(400).json({ message: 'Prioridad inválida' });
    }
    ticket.priority = priority;
    await ticket.save();
    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Cambió la prioridad del ticket ${ticket.folio} a "${priority}"`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Categoría de Falla (SLA) — elegirla rellena Nivel de Servicio + Prioridad +
// fechas límite de un jalón, según la matriz oficial (ver Ticket.SLA_CATALOG).
// El reloj del SLA corre desde que se reportó el ticket (createdAt), no
// desde que se clasificó. Sistemas puede seguir ajustando la prioridad a
// mano después con PUT /:id/priority si el caso lo amerita.
router.put('/:id/sla-category', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    const { slaCategory } = req.body;

    if (slaCategory === null) {
      ticket.slaCategory = null;
      ticket.slaLevel = null;
      ticket.responseDueAt = null;
      ticket.resolutionDueAt = null;
    } else {
      const row = Ticket.SLA_CATALOG.find((r) => r.category === slaCategory);
      if (!row) return res.status(400).json({ message: 'Categoría de falla inválida' });
      ticket.slaCategory = row.category;
      ticket.slaLevel = row.level;
      ticket.priority = row.priority;
      const base = ticket.createdAt.getTime();
      ticket.responseDueAt = new Date(base + row.tRespuestaMin * 60000);
      ticket.resolutionDueAt = new Date(base + row.tResolucionMin * 60000);
    }

    await ticket.save();
    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Clasificó el ticket ${ticket.folio} como "${slaCategory || 'sin clasificar'}"`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }

    const { status, resolution, resolutionNotes, addToCatalog } = req.body;
    if (!['abierto', 'en_proceso', 'resuelto', 'cerrado'].includes(status)) {
      return res.status(400).json({ message: 'Estatus inválido' });
    }
    if (status === 'resuelto' && !ticket.resolvedAt) {
      if (!(resolution || '').trim()) return res.status(400).json({ message: 'Selecciona cómo se resolvió' });
      ticket.resolution = resolution.trim();
      ticket.resolutionNotes = (resolutionNotes || '').trim();
      ticket.resolvedByName = req.user.name;
      ticket.resolvedAt = new Date();

      if (addToCatalog && resolution.trim()) {
        try {
          await TicketResolutionOption.create({ label: resolution.trim(), addedByName: req.user.name });
        } catch (err) {
          if (err.code !== 11000) throw err; // 11000 = ya existía, se ignora
        }
      }
    }
    // Reabrir (de resuelto/cerrado a abierto/en_proceso) limpia la resolución
    // anterior — si vuelve a fallar, no debe quedar la nota vieja como si
    // aplicara todavía.
    if (['abierto', 'en_proceso'].includes(status) && ['resuelto', 'cerrado'].includes(ticket.status)) {
      ticket.resolution = '';
      ticket.resolutionNotes = '';
      ticket.resolvedByName = '';
      ticket.resolvedAt = undefined;
    }
    ticket.status = status;
    await ticket.save();

    const actionByStatus = { resuelto: 'resolver', cerrado: 'editar', abierto: 'editar', en_proceso: 'editar' };
    logAction(req.user, actionByStatus[status], 'ticket', ticket._id, ticket.subject, `Cambió el ticket ${ticket.folio} a estatus "${status}"`);

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Sistemas responde sin necesidad de marcar el ticket como resuelto —
// permite ida y vuelta real ("¿me pasas una captura?", "ya lo intenté, sigue
// igual") antes de llegar a una resolución formal.
router.post('/:id/reply', (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la imagen' });
    next();
  });
}, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede responderlo' });
    }
    const text = (req.body.text || '').trim();
    if (!text && !req.file) return res.status(400).json({ message: 'Escribe un mensaje o adjunta una imagen' });

    ticket.messages.push({
      from: 'admin',
      authorName: req.user.name,
      text,
      attachmentData:     req.file?.buffer,
      attachmentMimeType:  req.file?.mimetype || '',
      attachmentFileName:  req.file?.originalname || '',
    });
    if (ticket.status === 'abierto') ticket.status = 'en_proceso';
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Respondió el ticket ${ticket.folio}`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede eliminarlo' });
    }
    await ticket.deleteOne();
    logAction(req.user, 'eliminar', 'ticket', ticket._id, ticket.subject, `Eliminó el ticket ${ticket.folio}`);
    res.json({ message: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
