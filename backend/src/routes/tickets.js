const router = require('express').Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const Ticket = require('../models/Ticket');
const TicketResolutionOption = require('../models/TicketResolutionOption');
const InternalApp = require('../models/InternalApp');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const auth = require('../middleware/auth');
const employeeAuth = require('../middleware/employeeAuth');
const { notifyTelegram } = require('../utils/telegram');
const { notifyEmail } = require('../utils/graphMail');
const { buildTicketNotificationEmail } = require('../utils/emailTemplates');
const { GERENTE_SISTEMAS_EMAIL } = require('../utils/pdfBranding');
const logAction = require('../utils/audit');

// Aviso por correo (Microsoft Graph) de un ticket nuevo — canal adicional a
// Telegram, no lo reemplaza. Ya no se manda a una lista fija de personas
// (el problema del sistema anterior — ver captura del usuario, mandaba a
// una lista vieja sin importar de qué era el ticket): se calcula según
// quién es "área ERP" (lider.erp/analista.erp, mismo criterio que
// isErpOnlyUser) vs "área sistema-IT" (el resto de admins de Sistemas). Los
// de la aplicación "Solicitud de Pagos" además SIEMPRE le llegan también al
// Gerente de Sistemas, junto con el resto de Sistemas.
const SOLICITUD_PAGOS_APP_NAME = 'solicitud de pagos';
async function getTicketEmailRecipients(ticket, appName) {
  // Seguridad: por ahora EXCLUSIVO al Gerente de Sistemas (Bruno) — pedido
  // explícito, "por el momento" (puede cambiar después). No pasa por el
  // enrutamiento de área de abajo, ni se junta con el resto de Sistemas.
  if (ticket.ticketType === 'seguridad') return [GERENTE_SISTEMAS_EMAIL];

  const recipients = new Set();
  if (ticket.ticketType === 'erp') {
    const erpUsers = await User.find({
      role: { $ne: 'admin' },
      canManagePlatformAccountsErp: true,
      canManageGmailAccounts: false,
      canManagePlatformAccounts: false,
    }).select('email');
    erpUsers.forEach((u) => recipients.add(u.email));
  } else {
    const sistemasUsers = await User.find({ role: 'admin' }).select('email');
    sistemasUsers.forEach((u) => recipients.add(u.email));
  }
  if (appName && appName.trim().toLowerCase() === SOLICITUD_PAGOS_APP_NAME) recipients.add(GERENTE_SISTEMAS_EMAIL);
  return [...recipients];
}

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

// Mismo criterio que isErpOnlyUser() en frontend/src/components/Layout.jsx —
// alguien que SOLO tiene el permiso de Plataformas ERP (no admin, no
// Gmail/Plataformas normales). lider.erp/analista.erp entran por aquí.
function isErpOnlyUser(user) {
  return user.role !== 'admin'
    && !user.canManageGmailAccounts
    && !user.canManagePlatformAccounts
    && !!user.canManagePlatformAccountsErp;
}

// Pedido explícito: los tickets de tipo 'erp' SOLO los ve el equipo de ERP
// (lider.erp/analista.erp) — el resto de Sistemas nunca los ve, ni siquiera
// que existen. Es una partición completa, no un permiso adicional: quien es
// ERP-only ve ÚNICAMENTE tickets erp; todos los demás ven todo MENOS los erp.
function canViewTicket(req, ticket) {
  return isErpOnlyUser(req.user) ? ticket.ticketType === 'erp' : ticket.ticketType !== 'erp';
}

// Aplica sobre un ticket ya existente los campos que derivan de una
// Categoría de Falla (SLA): nivel, prioridad y fechas límite (el reloj corre
// desde `createdAt`, no desde que se clasificó). Compartido entre la
// clasificación manual de un admin (PUT /:id/sla-category) y la automática al
// reportar (POST /mine, según el problema específico que eligió quien
// reporta — ver `sla` en config/ticketCategories.js del frontend). Regresa
// `false` si `slaCategory` no es null/undefined pero tampoco es una
// categoría real del catálogo, para que quien llama decida qué hacer
// (la ruta de admin lo rechaza con 400; la de creación simplemente lo
// ignora, sin tronar el ticket por un valor raro).
function applySlaCategory(ticket, slaCategory) {
  if (slaCategory === null || slaCategory === undefined) {
    ticket.slaCategory = null;
    ticket.slaLevel = null;
    ticket.responseDueAt = null;
    ticket.resolutionDueAt = null;
    return true;
  }
  const row = Ticket.SLA_CATALOG.find((r) => r.category === slaCategory);
  if (!row) return false;
  ticket.slaCategory = row.category;
  ticket.slaLevel = row.level;
  ticket.priority = row.priority;
  const base = ticket.createdAt.getTime();
  ticket.responseDueAt = new Date(base + row.tRespuestaMin * 60000);
  ticket.resolutionDueAt = new Date(base + row.tResolucionMin * 60000);
  return true;
}

// internalNotes es la bitácora técnica del equipo — nunca debe llegar al
// empleado. Ticket.find()/findById() regresan TODOS los campos por default,
// así que hay que quitarlo a mano en cada respuesta del lado empleado.
function stripInternal(ticket) {
  const obj = ticket.toObject ? ticket.toObject() : ticket;
  delete obj.internalNotes;
  return obj;
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

// Equipo(s) asignado(s) a quien reporta — el formulario lo usa para
// preguntar "¿sobre cuál equipo es esto?" SOLO cuando hay más de uno (ej.
// celular Y laptop), para no seguir ligando ambos al ticket cuando el
// problema es de uno solo. Con 0 o 1 equipo no hace falta preguntar.
router.get('/mine/assets', employeeAuth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ employee: req.employee.employeeRef, active: true })
      .populate('asset', 'type brand model serialNumber');
    const assets = assignments.map((a) => a.asset).filter(Boolean)
      .map((a) => ({ _id: a._id, type: a.type, brand: a.brand, model: a.model, serialNumber: a.serialNumber }));
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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
    const allAssets = assignments.map((a) => a.asset).filter(Boolean);
    // Si solo tiene un equipo asignado (o ninguno) no hay nada que preguntar
    // — se sigue ligando automático, como antes. Con dos o más (ej. celular
    // Y laptop), el frontend ya obligó a elegir uno específico (o "no aplica
    // a un equipo en particular") vía GET /mine/assets, así que aquí solo se
    // valida que lo elegido de verdad sea un equipo asignado a esta persona.
    const assets = allAssets.length > 1
      ? allAssets.filter((a) => String(a._id) === body.assetId)
      : allAssets;
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

    // Si el problema específico que eligió quien reporta ya tiene una
    // Categoría de Falla (SLA) conocida (ver `sla` en
    // config/ticketCategories.js del frontend), se clasifica desde que nace
    // — ya no depende de que un admin lo clasifique a mano después, ni de
    // "¿esto te impide trabajar?" (que cualquiera puede marcar siempre,
    // impida o no). `applySlaCategory` regresa `false` si el valor no es una
    // categoría real del catálogo — se ignora en silencio en vez de tronar
    // el ticket por un dato manipulado o desconocido.
    const slaHint = (body.slaHint || '').trim();
    if (slaHint && applySlaCategory(ticket, slaHint)) {
      await ticket.save();
    }

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

    // Igual que Telegram, sin await — nunca debe demorar ni romper la
    // respuesta al empleado si el cálculo de destinatarios o el envío falla.
    getTicketEmailRecipients(ticket, appName).then((recipients) => {
      if (recipients.length === 0) return;
      const { subject: emailSubject, html } = buildTicketNotificationEmail(ticket, {
        employeeName: req.employee.name,
        otherTypeDetail,
        typeLabel: Ticket.TICKET_TYPE_LABELS[ticket.ticketType],
        assetsLabel: assets.length ? assets.map(assetLabel).join(', ') : '',
        appName,
        ticketsUrl: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/tickets` : '',
      });
      notifyEmail({ to: recipients, subject: emailSubject, html });
    }).catch(() => {});

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
    res.json(tickets.map(stripInternal));
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

    res.status(201).json(stripInternal(ticket));
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
    res.json(stripInternal(ticket));
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
    res.json(stripInternal(ticket));
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

// Ya no es adminOnly a secas: lider.erp/analista.erp (viewer + solo permiso
// ERP) también entran a Tickets, pero acotados a los de tipo 'erp' — ver
// canViewTicket() para el filtrado real por ticket.
router.use(auth, (req, res, next) => {
  if (req.user.role === 'admin' || isErpOnlyUser(req.user)) return next();
  return res.status(403).json({ message: 'No tienes acceso a Tickets' });
});

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
    filter.ticketType = isErpOnlyUser(req.user) ? 'erp' : { $ne: 'erp' };
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
// un ticket con 2 equipos cuente para cada uno de los dos. Se excluyen los
// de tipo 'erp' del conteo que ve Sistemas (y viceversa para ERP), mismo
// criterio de partición que el resto de esta ruta.
router.get('/counts-by-asset', async (req, res) => {
  try {
    const typeFilter = isErpOnlyUser(req.user) ? 'erp' : { $ne: 'erp' };
    const counts = await Ticket.aggregate([
      { $match: { assetRefs: { $ne: [] }, ticketType: typeFilter } },
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
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/attachment', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Sin evidencia adjunta' });
    if (!ticket.attachmentData) return res.status(404).json({ message: 'Sin evidencia adjunta' });
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
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
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
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
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
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    const { slaCategory } = req.body;
    if (!applySlaCategory(ticket, slaCategory)) {
      return res.status(400).json({ message: 'Categoría de falla inválida' });
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
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
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
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
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

// Bitácora técnica interna — pedido explícito, tomado de un trabajo anterior
// del usuario: "notas privadas" que solo ve el equipo de Sistemas (cómo se
// resolvió de verdad, a dónde se entró, etc.), separadas de la conversación
// pública con quien reportó, para que quede buscable en tickets futuros con
// un problema parecido. Nunca se manda al empleado (ver stripInternal y las
// rutas employeeAuth de arriba).
router.post('/:id/internal-notes', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede agregar notas internas' });
    }
    if (ticket.status === 'cerrado') {
      return res.status(400).json({ message: 'Este ticket ya está cerrado — las notas internas quedan como solo lectura.' });
    }
    const text = (req.body.text || '').trim();
    if (!text) return res.status(400).json({ message: 'Escribe una nota' });

    ticket.internalNotes.push({ authorName: req.user.name, text });
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Agregó una nota interna al ticket ${ticket.folio}`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
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
