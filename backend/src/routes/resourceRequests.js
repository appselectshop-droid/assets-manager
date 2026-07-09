const router = require('express').Router();
const ResourceRequest = require('../models/ResourceRequest');
const CustomResourceOption = require('../models/CustomResourceOption');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { notifyTelegram } = require('../utils/telegram');
const logAction = require('../utils/audit');

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
    if (!(body.justification || '').trim()) return res.status(400).json({ message: 'Falta la justificación de la solicitud' });

    const employeeId = /^[a-f0-9]{24}$/i.test(body.employeeId || '') ? body.employeeId : undefined;

    const request = await ResourceRequest.create({
      employeeName,
      position:   (body.position || '').trim(),
      department: (body.department || '').trim(),
      employeeRef: employeeId,
      resourceItems,
      licenseDetail,
      otherDetail,
      justification: (body.justification || '').trim(),
      requestedByEmail: (body.requestedByEmail || '').trim().toLowerCase(),
      raw: body,
    });

    const itemsLabel = resourceItems
      .map((it) => {
        if (it === 'Software o Licencia' && licenseDetail) return `${it} (${licenseDetail})`;
        if (it === 'Otro (especifica)' && otherDetail) return `${it}: ${otherDetail}`;
        return it;
      })
      .join(', ');
    notifyTelegram(
      `📦 <b>Nueva Solicitud de Recursos</b>\n` +
      `👤 ${employeeName}${request.position ? ` — ${request.position}` : ''}\n` +
      `🏷️ ${itemsLabel}\n` +
      `Revisa en Solicitudes de Recursos.`
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

    logAction(req.user, 'aprobar', 'solicitud_recurso', request._id, request.employeeName, `Aprobó solicitud de recursos de ${request.employeeName}`);

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
