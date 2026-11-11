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
const { planImport, applyImport } = require('../utils/cxpImport');
const multer = require('multer');
const mongoose = require('mongoose');
const { uploadBuffer, downloadStream, deleteFile } = require('../utils/gridfs');
const { parseCfdi } = require('../utils/cfdi');

const INVOICE_BUCKET = 'paymentInvoices';
const uploadInvoices = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 20 },
  fileFilter: (req, file, cb) => {
    if (!/\.(pdf|xml)$/i.test(file.originalname)) return cb(new Error('Solo se aceptan archivos PDF o XML'));
    cb(null, true);
  },
});
// multer entrega el nombre en latin1; los nombres con acentos/ñ se arreglan aquí.
const fixName = (n) => { try { return Buffer.from(n, 'latin1').toString('utf8'); } catch { return n; } };

// Suma de los XML de tipo Ingreso en la moneda del servicio — es el monto
// real del periodo cuando no se capturó a mano.
function recalcMontoFromInvoices(cycle, moneda) {
  if (!(cycle.montoReal === null || cycle.montoReal === undefined || cycle.montoRealAuto)) return;
  const xmls = cycle.facturas.filter((f) => f.kind === 'xml' && f.cfdi && typeof f.cfdi.total === 'number'
    && (!f.cfdi.tipo || f.cfdi.tipo === 'I') && (!f.cfdi.moneda || f.cfdi.moneda === (moneda || 'MXN')));
  if (!xmls.length) {
    if (cycle.montoRealAuto) { cycle.montoReal = null; cycle.montoRealAuto = false; }
    return;
  }
  cycle.montoReal = Math.round(xmls.reduce((a, f) => a + f.cfdi.total, 0) * 100) / 100;
  cycle.montoRealAuto = true;
}

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
    await logAction(req.user, 'crear', 'pago_recurrente', service._id, `${service.proveedor} ${service.cuenta}`.trim(), 'Alta en el catálogo de Pagos Recurrentes');
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
    await logAction(req.user, 'crear', 'pago_recurrente', '-', `Importación Excel: ${docs.length} pagos`, `Se saltaron ${skipped.length} renglones (duplicados o inválidos)`);
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
    await logAction(req.user, 'editar', 'pago_recurrente', service._id, `${service.proveedor} ${service.cuenta}`.trim(), JSON.stringify(data));
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
      await logAction(req.user, 'editar', 'pago_recurrente', service._id, `${service.proveedor} ${service.cuenta}`.trim(), 'Desactivado (tenía historial, no se borró)');
      return res.json({ deactivated: true });
    }
    await PaymentCycle.deleteMany({ service: service._id });
    await service.deleteOne();
    await logAction(req.user, 'eliminar', 'pago_recurrente', service._id, `${service.proveedor} ${service.cuenta}`.trim(), 'Eliminado del catálogo junto con sus ciclos pendientes');
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
    if (montoReal !== undefined) {
      const nuevo = montoReal === '' || montoReal === null ? null : Number(montoReal);
      if (nuevo !== cycle.montoReal) { cycle.montoReal = nuevo; cycle.montoRealAuto = false; }
    }
    if (notas !== undefined) cycle.notas = notas;
    if (fechaLimite !== undefined && fechaLimite !== cycle.fechaLimite) {
      if (!DATE_RE.test(fechaLimite)) return res.status(400).json({ message: 'Fecha límite inválida' });
      Object.assign(cycle, derivedFields(fechaLimite));
      cycle.fechaLimiteManual = true;
    }
    cycle.updatedByName = req.user.name;
    await cycle.save();
    await logAction(req.user, 'editar', 'ciclo_pago', cycle._id,
      `${cycle.service?.proveedor || ''} ${cycle.service?.cuenta || ''} ${cycle.periodo}`.trim(), JSON.stringify(req.body));
    res.json(cycleView(cycle.toObject()));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Facturas (PDF + XML) por periodo ───────────────────────────────────
router.post('/cycles/:id/facturas', (req, res, next) => {
  uploadInvoices.array('files', 20)(req, res, (err) => (err ? res.status(400).json({ message: err.message }) : next()));
}, async (req, res) => {
  try {
    const cycle = await PaymentCycle.findById(req.params.id).populate('service');
    if (!cycle) return res.status(404).json({ message: 'Pago no encontrado' });
    if (!req.files?.length) return res.status(400).json({ message: 'No llegó ningún archivo' });
    const added = [];
    for (const f of req.files) {
      const filename = fixName(f.originalname);
      const kind = /\.xml$/i.test(filename) ? 'xml' : 'pdf';
      const contentType = kind === 'xml' ? 'application/xml' : 'application/pdf';
      const fileId = await uploadBuffer(f.buffer, filename, contentType, INVOICE_BUCKET);
      const entry = { fileId, filename, contentType, kind, size: f.size, uploadedBy: req.user.name };
      if (kind === 'xml') entry.cfdi = parseCfdi(f.buffer) || undefined;
      cycle.facturas.push(entry);
      added.push(filename);
    }
    if (cycle.estado === 'pendiente') cycle.estado = 'factura_recibida';
    recalcMontoFromInvoices(cycle, cycle.service?.moneda);
    cycle.updatedByName = req.user.name;
    await cycle.save();
    await logAction(req.user, 'editar', 'ciclo_pago', cycle._id,
      `${cycle.service?.proveedor || ''} ${cycle.service?.cuenta || ''} ${cycle.periodo}`.trim(), `Subió factura(s): ${added.join(', ')}`);
    res.json(cycleView(cycle.toObject()));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/facturas/:fileId', async (req, res) => {
  try {
    if (!mongoose.isValidObjectId(req.params.fileId)) return res.status(400).json({ message: 'Archivo inválido' });
    const fileId = new mongoose.Types.ObjectId(req.params.fileId);
    const cycle = await PaymentCycle.findOne({ 'facturas.fileId': fileId }, { 'facturas.$': 1 }).lean();
    if (!cycle) return res.status(404).json({ message: 'Factura no encontrada' });
    const f = cycle.facturas[0];
    res.set('Content-Type', f.contentType || (f.kind === 'xml' ? 'application/xml' : 'application/pdf'));
    res.set('Content-Disposition', `${req.query.download ? 'attachment' : 'inline'}; filename*=UTF-8''${encodeURIComponent(f.filename)}`);
    downloadStream(fileId, INVOICE_BUCKET)
      .on('error', () => { if (!res.headersSent) res.status(404).json({ message: 'Archivo no encontrado' }); else res.end(); })
      .pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/cycles/:id/facturas/:fileId', async (req, res) => {
  try {
    const cycle = await PaymentCycle.findById(req.params.id).populate('service');
    if (!cycle) return res.status(404).json({ message: 'Pago no encontrado' });
    const f = cycle.facturas.find((x) => String(x.fileId) === req.params.fileId);
    if (!f) return res.status(404).json({ message: 'Factura no encontrada' });
    cycle.facturas.pull(f._id);
    await deleteFile(f.fileId, INVOICE_BUCKET);
    if (!cycle.facturas.length && cycle.estado === 'factura_recibida') cycle.estado = 'pendiente';
    recalcMontoFromInvoices(cycle, cycle.service?.moneda);
    cycle.updatedByName = req.user.name;
    await cycle.save();
    await logAction(req.user, 'editar', 'ciclo_pago', cycle._id,
      `${cycle.service?.proveedor || ''} ${cycle.service?.cuenta || ''} ${cycle.periodo}`.trim(), `Quitó factura: ${f.filename}`);
    res.json(cycleView(cycle.toObject()));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Histórico de Cuentas por Pagar ─────────────────────────────────────
// Recibe los registros de /api/historial-general de cuentasporpagar
// (bajados con la sesión del usuario) y los cruza con el catálogo — ver
// utils/cxpImport.js. Con dryRun:true solo devuelve el plan, sin escribir.
// Re-ejecutable: sirve también para sincronizar estados (metido → pagado).
router.post('/import-cxp', async (req, res) => {
  try {
    const records = Array.isArray(req.body.records) ? req.body.records : [];
    if (!records.length) return res.status(400).json({ message: 'No hay registros de Cuentas por Pagar' });
    const services = await PaymentService.find().lean();
    const { plan, skipped } = planImport(services, records);
    const summarize = (r) => ({ folio: r.folio, proveedor: r.proveedor, empresa: r.empresa, sucursal: r.sucursal, monto: r.monto, moneda: r.moneda, fechaSolicitud: r.fechaSolicitud });
    const out = {
      total: records.length,
      cruzados: plan.length,
      sinCruzar: skipped.map((s) => ({ ...summarize(s.rec), motivo: s.reason })),
      plan: plan.map((p) => ({ folio: p.rec.folio, servicio: `${p.service.proveedor} ${p.service.cuenta}`.trim(), periodo: p.periodo, estado: p.estado, como: p.how })),
    };
    if (req.body.dryRun) return res.json({ dryRun: true, ...out });
    const result = await applyImport(PaymentCycle, plan, req.user.name);
    await logAction(req.user, 'crear', 'ciclo_pago', '-', `Histórico CxP: ${result.created} creados, ${result.updated} actualizados`, `Conflictos: ${result.conflicts} · sin cruzar: ${skipped.length}`);
    res.json({ ...out, ...result });
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
