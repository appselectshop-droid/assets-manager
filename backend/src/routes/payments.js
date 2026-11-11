// Pagos Recurrentes (2026-11-11) — ver utils/paymentSchedule.js para la
// regla de "meter una semana antes" y utils/paymentReminders.js para el
// correo de lunes a miércoles.
const router = require('express').Router();
const auth = require('../middleware/auth');
const paymentsManagerOnly = require('../middleware/paymentsManagerOnly');
const PaymentService = require('../models/PaymentService');
const PaymentCycle = require('../models/PaymentCycle');
const logAction = require('../utils/audit');
const { FREQUENCIES, todayMx, addDays, currentCutoff, derivedFields } = require('../utils/paymentSchedule');
const { ensureCycles, recalcServiceCycles, buildSummary, cycleView } = require('../utils/paymentCycles');
const { buildReminderEmail, recipients } = require('../utils/paymentReminders');
const { notifyEmail } = require('../utils/graphMail');

router.use(auth, paymentsManagerOnly);

const SERVICE_FIELDS = [
  'proveedor', 'cuenta', 'motivo', 'centroCostos', 'compania', 'sucursal', 'direccion',
  'montoEstimado', 'moneda', 'frecuencia', 'diaVencimiento', 'mesVencimiento', 'activo', 'notas', 'origen',
];
const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function pickService(body) {
  const out = {};
  for (const k of SERVICE_FIELDS) if (body[k] !== undefined) out[k] = body[k];
  if (out.montoEstimado === '' ) out.montoEstimado = null;
  if (out.montoEstimado !== undefined && out.montoEstimado !== null) out.montoEstimado = Number(out.montoEstimado);
  if (out.diaVencimiento !== undefined) out.diaVencimiento = Number(out.diaVencimiento);
  if (out.mesVencimiento === '' || out.frecuencia === 'mensual') out.mesVencimiento = null;
  if (out.mesVencimiento) out.mesVencimiento = Number(out.mesVencimiento);
  return out;
}

function validateService(s) {
  if (!s.proveedor || !String(s.proveedor).trim()) return 'Falta el proveedor';
  if (!(s.diaVencimiento >= 1 && s.diaVencimiento <= 31)) return 'El día de vencimiento debe ser de 1 a 31';
  if (s.frecuencia && !FREQUENCIES[s.frecuencia]) return 'Frecuencia inválida';
  if (s.frecuencia && s.frecuencia !== 'mensual' && !(s.mesVencimiento >= 1 && s.mesVencimiento <= 12)) {
    return 'Para pagos no mensuales indica el mes de vencimiento';
  }
  if (s.montoEstimado !== null && s.montoEstimado !== undefined && Number.isNaN(s.montoEstimado)) return 'Monto inválido';
  return null;
}

// ── Tablero ─────────────────────────────────────────────────────────────
router.get('/summary', async (_req, res) => {
  try {
    res.json(await buildSummary());
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Catálogo ────────────────────────────────────────────────────────────
router.get('/services', async (_req, res) => {
  try {
    await ensureCycles();
    const today = todayMx();
    const services = await PaymentService.find().sort({ proveedor: 1, compania: 1, cuenta: 1 }).lean();
    // Próximo vencimiento abierto de cada servicio, para la tabla.
    const next = await PaymentCycle.aggregate([
      { $match: { estado: { $in: PaymentCycle.OPEN_STATES }, fechaLimite: { $gte: addDays(today, -60) } } },
      { $sort: { fechaLimite: 1 } },
      { $group: { _id: '$service', fechaLimite: { $first: '$fechaLimite' }, fechaMeter: { $first: '$fechaMeter' }, semana: { $first: '$semana' } } },
    ]);
    const byId = new Map(next.map((n) => [String(n._id), n]));
    res.json(services.map((s) => ({ ...s, proximo: byId.get(String(s._id)) || null })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/services', async (req, res) => {
  try {
    const data = pickService(req.body);
    const error = validateService({ frecuencia: 'mensual', ...data });
    if (error) return res.status(400).json({ message: error });
    const ciclosDesde = DATE_RE.test(req.body.ciclosDesde || '') ? req.body.ciclosDesde : todayMx();
    const service = await PaymentService.create({ ...data, ciclosDesde, createdBy: req.user.name });
    await ensureCycles({ serviceIds: [service._id] });
    await logAction(req.user, 'CREATE', 'PaymentService', service._id, `${service.proveedor} ${service.cuenta}`.trim());
    res.status(201).json(service);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Importación del Excel (hojas Mensual/Anual) — el frontend parsea el
// archivo y manda los renglones ya interpretados; aquí solo se valida y se
// evita duplicar (mismo proveedor + cuenta + compañía + sucursal + frecuencia
// + día — la sucursal cuenta: hay contratos con el mismo número en dos
// sucursales, ej. Digital Copy 5331 en Polanco y en Tepotzotlán II).
router.post('/services/import', async (req, res) => {
  try {
    const rows = Array.isArray(req.body.rows) ? req.body.rows : [];
    if (!rows.length) return res.status(400).json({ message: 'No hay renglones para importar' });
    // Por default: lo que vence a partir del próximo corte en adelante — lo
    // de cortes ya pasados se asume metido (ya está en carpetas anteriores).
    const ciclosDesde = DATE_RE.test(req.body.ciclosDesde || '')
      ? req.body.ciclosDesde
      : addDays(currentCutoff(todayMx()), 7);

    const existing = await PaymentService.find().lean();
    const key = (s) => [s.proveedor, s.cuenta, s.compania, s.sucursal, s.frecuencia, s.diaVencimiento, s.mesVencimiento || '']
      .map((v) => String(v ?? '').trim().toUpperCase().replace(/\s+/g, ' ')).join('|');
    const seen = new Set(existing.map(key));

    const created = [];
    const skipped = [];
    for (const [i, raw] of rows.entries()) {
      const data = { frecuencia: 'mensual', ...pickService(raw) };
      const error = validateService(data);
      if (error) { skipped.push({ index: i, reason: error }); continue; }
      const k = key(data);
      if (seen.has(k)) { skipped.push({ index: i, reason: 'Ya existe en el catálogo' }); continue; }
      seen.add(k);
      created.push({ ...data, ciclosDesde, createdBy: req.user.name });
    }
    const docs = created.length ? await PaymentService.insertMany(created) : [];
    await ensureCycles({ serviceIds: docs.map((d) => d._id) });
    await logAction(req.user, 'IMPORT', 'PaymentService', '-', `Importación Excel: ${docs.length} servicios`, { skipped: skipped.length });
    res.json({ created: docs.length, skipped });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/services/:id', async (req, res) => {
  try {
    const service = await PaymentService.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Servicio no encontrado' });
    const data = pickService(req.body);
    const merged = { ...service.toObject(), ...data };
    const error = validateService(merged);
    if (error) return res.status(400).json({ message: error });
    const scheduleChanged = ['frecuencia', 'diaVencimiento', 'mesVencimiento', 'activo']
      .some((k) => data[k] !== undefined && String(data[k]) !== String(service[k]));
    Object.assign(service, data);
    await service.save();
    if (scheduleChanged) await recalcServiceCycles(service);
    await logAction(req.user, 'UPDATE', 'PaymentService', service._id, `${service.proveedor} ${service.cuenta}`.trim(), data);
    res.json(service);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Si el servicio ya tiene historial (algo metido/pagado), solo se desactiva
// para no perderlo; si no, se borra junto con sus ciclos pendientes.
router.delete('/services/:id', async (req, res) => {
  try {
    const service = await PaymentService.findById(req.params.id);
    if (!service) return res.status(404).json({ message: 'Servicio no encontrado' });
    const hasHistory = await PaymentCycle.exists({ service: service._id, estado: { $in: ['metido', 'pagado'] } });
    if (hasHistory) {
      service.activo = false;
      await service.save();
      await recalcServiceCycles(service);
      await logAction(req.user, 'DEACTIVATE', 'PaymentService', service._id, `${service.proveedor} ${service.cuenta}`.trim());
      return res.json({ deactivated: true });
    }
    await PaymentCycle.deleteMany({ service: service._id });
    await service.deleteOne();
    await logAction(req.user, 'DELETE', 'PaymentService', service._id, `${service.proveedor} ${service.cuenta}`.trim());
    res.json({ deleted: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Ciclos ──────────────────────────────────────────────────────────────
router.get('/cycles', async (req, res) => {
  try {
    const filter = {};
    if (req.query.estado) filter.estado = { $in: String(req.query.estado).split(',') };
    if (req.query.service) filter.service = req.query.service;
    if (DATE_RE.test(req.query.desde || '')) filter.fechaLimite = { ...filter.fechaLimite, $gte: req.query.desde };
    if (DATE_RE.test(req.query.hasta || '')) filter.fechaLimite = { ...filter.fechaLimite, $lte: req.query.hasta };
    const cycles = await PaymentCycle.find(filter).populate('service').sort({ fechaLimite: -1 }).limit(1000).lean();
    res.json(cycles.filter((c) => c.service).map(cycleView));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/cycles/:id', async (req, res) => {
  try {
    const cycle = await PaymentCycle.findById(req.params.id).populate('service');
    if (!cycle) return res.status(404).json({ message: 'Pago no encontrado' });
    const { estado, folioCxp, montoReal, notas, fechaLimite } = req.body;
    if (estado !== undefined) {
      if (!PaymentCycle.STATES.includes(estado)) return res.status(400).json({ message: 'Estado inválido' });
      cycle.estado = estado;
    }
    if (folioCxp !== undefined) cycle.folioCxp = String(folioCxp).trim().toUpperCase();
    if (montoReal !== undefined) cycle.montoReal = montoReal === '' || montoReal === null ? null : Number(montoReal);
    if (notas !== undefined) cycle.notas = notas;
    if (fechaLimite !== undefined && fechaLimite !== cycle.fechaLimite) {
      if (!DATE_RE.test(fechaLimite)) return res.status(400).json({ message: 'Fecha límite inválida' });
      Object.assign(cycle, derivedFields(fechaLimite));
      cycle.fechaLimiteManual = true;
    }
    cycle.updatedByName = req.user.name;
    await cycle.save();
    await logAction(req.user, 'UPDATE', 'PaymentCycle', cycle._id,
      `${cycle.service?.proveedor || ''} ${cycle.service?.cuenta || ''} ${cycle.periodo}`.trim(), req.body);
    res.json(cycleView(cycle.toObject()));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Recordatorio por correo ─────────────────────────────────────────────
router.get('/reminder/preview', async (_req, res) => {
  try {
    const email = buildReminderEmail(await buildSummary());
    res.json({
      ...email,
      recipients: await recipients(),
      enabled: process.env.PAYMENT_REMINDERS_ENABLED === 'true',
      emailConfigured: !!(process.env.AZURE_CLIENT_ID && process.env.NOTIFICATIONS_FROM_EMAIL),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Manda el recordatorio de hoy solo a quien lo pide — para probar cómo se ve.
router.post('/reminder/test', async (req, res) => {
  try {
    if (!process.env.AZURE_CLIENT_ID || !process.env.NOTIFICATIONS_FROM_EMAIL) {
      return res.status(400).json({ message: 'El envío de correo (Azure/Graph) no está configurado en este servidor' });
    }
    const email = buildReminderEmail(await buildSummary());
    await notifyEmail({ to: req.user.email, subject: `[Prueba] ${email.subject}`, html: email.html });
    res.json({ sentTo: req.user.email });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
