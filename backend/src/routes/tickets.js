const router = require('express').Router();
const multer = require('multer');
const Ticket = require('../models/Ticket');
const TicketResolutionOption = require('../models/TicketResolutionOption');
const Assignment = require('../models/Assignment');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { notifyTelegram } = require('../utils/telegram');
const logAction = require('../utils/audit');

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

// Límite simple por IP para la ruta pública — mismo criterio que las demás
// solicitudes (Cuentas/Ingreso/Recursos).
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

function assetLabel(asset) {
  if (!asset) return '';
  return [asset.brand, asset.model].filter(Boolean).join(' ') + (asset.serialNumber ? ` (${asset.serialNumber})` : '');
}

// Dado un empleado ya encontrado por nombre (ver /employees/public-lookup),
// regresa los activos que tiene asignados HOY — de ahí elige cuál está
// fallando. No expone el inventario completo, solo lo de ese empleado.
router.get('/public/my-assets', async (req, res) => {
  try {
    const { employeeId } = req.query;
    if (!/^[a-f0-9]{24}$/i.test(employeeId || '')) return res.json([]);
    const assignments = await Assignment.find({ employee: employeeId, active: true })
      .populate('asset', 'type brand model serialNumber inventoryTag');
    const assets = assignments.map((a) => a.asset).filter(Boolean);
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Formulario público (sin JWT) — cualquier empleado reporta un problema sin
// necesitar cuenta en el sistema. Protegido con límite por IP + honeypot,
// igual que las demás solicitudes públicas.
router.post('/public', (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la evidencia' });
    next();
  });
}, async (req, res) => {
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
    if (!employeeName) return res.status(400).json({ message: 'Falta tu nombre completo' });
    if (!Ticket.TICKET_TYPES.includes(body.ticketType)) {
      return res.status(400).json({ message: 'Selecciona el tipo de soporte' });
    }
    const subject = (body.subject || '').trim();
    if (!subject) return res.status(400).json({ message: 'Falta el asunto del ticket' });

    const employeeRef = /^[a-f0-9]{24}$/i.test(body.employeeRef || '') ? body.employeeRef : undefined;
    const assetRef = /^[a-f0-9]{24}$/i.test(body.assetRef || '') ? body.assetRef : undefined;

    const ticket = await Ticket.create({
      employeeName,
      employeeRef,
      assetRef,
      ticketType: body.ticketType,
      subject,
      description: (body.description || '').trim(),
      blocksWork: body.blocksWork === 'true' || body.blocksWork === true,
      attachmentData:     req.file?.buffer,
      attachmentMimeType:  req.file?.mimetype || '',
      attachmentFileName:  req.file?.originalname || '',
      raw: body,
    });

    const asset = assetRef ? await Asset.findById(assetRef).select('type brand model serialNumber') : null;
    notifyTelegram(
      `🎫 <b>Nuevo ticket de soporte</b>\n` +
      `Folio: ${ticket.folio}\n` +
      `👤 ${employeeName}\n` +
      `🏷️ ${Ticket.TICKET_TYPE_LABELS[ticket.ticketType]}${ticket.blocksWork ? ' · ⚠️ le impide trabajar' : ''}\n` +
      (asset ? `💻 ${assetLabel(asset)}\n` : '') +
      `📝 ${subject}\n` +
      `Revisa en Tickets.`
    );

    res.status(201).json({ id: ticket._id, folio: ticket.folio });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = { $in: req.query.status.split(',') };
    if (req.query.assetRef) filter.assetRef = req.query.assetRef;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    const tickets = await Ticket.find(filter)
      .populate('assetRef', 'type brand model serialNumber inventoryTag')
      .populate('assignedTo', 'name')
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cuántos tickets tiene cada activo (para el badge en Activos) — un solo
// query agregado en vez de pedirlo activo por activo.
router.get('/counts-by-asset', async (req, res) => {
  try {
    const counts = await Ticket.aggregate([
      { $match: { assetRef: { $ne: null } } },
      { $group: { _id: '$assetRef', count: { $sum: 1 } } },
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

router.put('/:id/status', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });

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

router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findByIdAndDelete(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    logAction(req.user, 'eliminar', 'ticket', ticket._id, ticket.subject, `Eliminó el ticket ${ticket.folio}`);
    res.json({ message: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
