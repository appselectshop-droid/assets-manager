const router = require('express').Router();
const ResourceRequest = require('../models/ResourceRequest');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { notifyTelegram } = require('../utils/telegram');

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
router.post('/public', async (req, res) => {
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
    if (!body.requestType) return res.status(400).json({ message: 'Falta el tipo de solicitud' });
    if (!body.resourceService) return res.status(400).json({ message: 'Falta el recurso o servicio' });

    const request = await ResourceRequest.create({
      employeeName,
      position:      (body.position || '').trim(),
      department:    (body.department || '').trim(),
      directManager: (body.directManager || '').trim(),
      requestType:     body.requestType,
      resourceService: body.resourceService,
      detail:        (body.detail || '').trim(),
      justification: (body.justification || '').trim(),
      requestedByEmail: (body.requestedByEmail || '').trim().toLowerCase(),
      raw: body,
    });

    notifyTelegram(
      `📦 <b>Nueva Solicitud de Recursos y Servicios</b>\n` +
      `👤 ${employeeName}${request.position ? ` — ${request.position}` : ''}\n` +
      `🏷️ ${request.requestType} · ${request.resourceService}\n` +
      `Revisa en Solicitudes de Recursos.`
    );

    res.status(201).json({ id: request._id });
  } catch (err) {
    res.status(400).json({ message: err.message });
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

    request.status = 'aprobada';
    request.resolutionNotes = req.body.resolutionNotes || '';
    request.reviewedByName = req.user.name;
    request.reviewedAt = new Date();
    await request.save();

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

    res.json(request);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const request = await ResourceRequest.findByIdAndDelete(req.params.id);
    if (!request) return res.status(404).json({ message: 'Solicitud no encontrada' });
    res.json({ message: 'Solicitud eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
