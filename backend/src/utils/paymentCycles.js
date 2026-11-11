// Generación de ciclos y armado del tablero de Pagos Recurrentes — separado
// de routes/payments.js porque lo reusa también el programador de
// recordatorios por correo (utils/paymentReminders.js).
const PaymentService = require('../models/PaymentService');
const PaymentCycle = require('../models/PaymentCycle');
const {
  addDays, todayMx, currentCutoff, isoWeek, dueDatesBetween, derivedFields, dueDateIn,
} = require('./paymentSchedule');

// Hasta dónde hacia adelante se generan ciclos — ~5 meses, para que una
// anualidad aparezca en "Próximos" con tiempo.
const HORIZON_DAYS = 150;

// Crea (sin duplicar) los ciclos faltantes de los servicios activos. Es
// idempotente: el índice único (service, periodo) + upsert $setOnInsert
// garantizan que correrlo dos veces no cambia nada.
async function ensureCycles({ serviceIds } = {}) {
  const today = todayMx();
  const to = addDays(today, HORIZON_DAYS);
  const filter = { activo: true };
  if (serviceIds) filter._id = { $in: serviceIds };
  const services = await PaymentService.find(filter).lean();

  const ops = [];
  for (const s of services) {
    for (const { periodo, fechaLimite } of dueDatesBetween(s, s.ciclosDesde, to)) {
      ops.push({
        updateOne: {
          filter: { service: s._id, periodo },
          update: { $setOnInsert: { service: s._id, periodo, ...derivedFields(fechaLimite, s.metodo) } },
          upsert: true,
        },
      });
    }
  }
  if (ops.length) await PaymentCycle.bulkWrite(ops, { ordered: false });
  return ops.length;
}

// Cuando cambia el día/frecuencia/mes de un servicio: los ciclos que aún no
// se tocan (pendientes, sin fecha corregida a mano, sin folio, que no han
// vencido) se recalculan; si su periodo ya no aplica con la nueva
// frecuencia, se borran (son derivados, se regeneran solos).
async function recalcServiceCycles(service) {
  const today = todayMx();
  const open = await PaymentCycle.find({
    service: service._id, estado: 'pendiente', fechaLimiteManual: false, folioCxp: '', fechaLimite: { $gte: today },
  });
  const validPeriods = new Set(
    dueDatesBetween(service, today, addDays(today, HORIZON_DAYS + 31)).map((d) => d.periodo),
  );
  for (const c of open) {
    if (!service.activo || !validPeriods.has(c.periodo)) {
      await c.deleteOne();
      continue;
    }
    const [y, m] = c.periodo.split('-').map(Number);
    Object.assign(c, derivedFields(dueDateIn(y, m, service.diaVencimiento), service.metodo));
    await c.save();
  }
  if (service.activo) await ensureCycles({ serviceIds: [service._id] });
}

function cycleView(c) {
  const s = c.service || {};
  return {
    _id: c._id,
    periodo: c.periodo,
    fechaLimite: c.fechaLimite,
    fechaMeter: c.fechaMeter,
    fechaPago: c.fechaPago,
    semana: c.semana,
    anioSemana: c.anioSemana,
    fechaLimiteManual: c.fechaLimiteManual,
    estado: c.estado,
    folioCxp: c.folioCxp,
    montoReal: c.montoReal,
    notas: c.notas,
    montoRealAuto: c.montoRealAuto,
    facturas: (c.facturas || []).map((f) => ({
      fileId: f.fileId, filename: f.filename, kind: f.kind, size: f.size,
      uploadedAt: f.uploadedAt, uploadedBy: f.uploadedBy, cfdi: f.cfdi || null,
      verificacion: f.verificacion?.status ? f.verificacion : null,
    })),
    updatedByName: c.updatedByName,
    updatedAt: c.updatedAt,
    service: {
      _id: s._id,
      proveedor: s.proveedor,
      cuenta: s.cuenta,
      motivo: s.motivo,
      compania: s.compania,
      sucursal: s.sucursal,
      centroCostos: s.centroCostos,
      direccion: s.direccion,
      montoEstimado: s.montoEstimado,
      moneda: s.moneda,
      frecuencia: s.frecuencia,
      metodo: s.metodo || 'cxp',
      tarjeta: s.tarjeta || '',
    },
  };
}

// Tablero: lo atrasado, lo que toca meter en el corte vigente y lo que viene.
async function buildSummary({ weeksAhead = 6 } = {}) {
  await ensureCycles();
  const today = todayMx();
  const corte = currentCutoff(today);
  const until = addDays(corte, weeksAhead * 7);
  const { week, year } = isoWeek(corte);

  const cycles = await PaymentCycle.find({
    $or: [
      { estado: { $in: PaymentCycle.OPEN_STATES }, fechaMeter: { $lte: until } },
      { estado: 'metido' },
    ],
  }).populate('service').sort({ fechaMeter: 1, fechaLimite: 1 }).lean();

  const live = cycles.filter((c) => c.service && c.service.activo !== false).map(cycleView);
  const isOpen = (c) => PaymentCycle.OPEN_STATES.includes(c.estado);
  const cxp = live.filter((c) => c.service.metodo !== 'tarjeta');
  const card = live.filter((c) => c.service.metodo === 'tarjeta' && isOpen(c));

  return {
    hoy: today,
    corte,
    semana: week,
    anioSemana: year,
    fechaPagoCorte: addDays(corte, 7),
    atrasados: cxp.filter((c) => isOpen(c) && c.fechaMeter < corte),
    estaSemana: cxp.filter((c) => isOpen(c) && c.fechaMeter === corte),
    proximos: cxp.filter((c) => isOpen(c) && c.fechaMeter > corte),
    metidos: cxp.filter((c) => c.estado === 'metido'),
    // Cargos a tarjeta: ya cobrados sin invoice adjunto, y los que vienen
    // en los próximos 30 días.
    tarjeta: {
      porAdjuntar: card.filter((c) => c.fechaLimite <= today),
      proximos: card.filter((c) => c.fechaLimite > today && c.fechaLimite <= addDays(today, 30)),
    },
  };
}

module.exports = { ensureCycles, recalcServiceCycles, buildSummary, cycleView, HORIZON_DAYS };
