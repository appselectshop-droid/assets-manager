const mongoose = require('mongoose');

// Un vencimiento concreto de un PaymentService (ej. "Telmex 5556871130,
// periodo 2026-12"). Ver utils/paymentSchedule.js para cómo se derivan
// fechaMeter/fechaPago/semana a partir de la fecha límite.
//
// Estados (flujo real del usuario):
//   pendiente        → aún no llega la factura
//   factura_recibida → ya está en la carpeta "Semana N" de OneDrive
//   metido           → solicitud creada en Cuentas por Pagar (folioCxp)
//   pagado           → CxP ya la marcó pagada
//   omitido          → este periodo no se paga (cancelado, se juntó con otro…)
const STATES = ['pendiente', 'factura_recibida', 'metido', 'pagado', 'omitido'];
const OPEN_STATES = ['pendiente', 'factura_recibida'];

const paymentCycleSchema = new mongoose.Schema({
  service: { type: mongoose.Schema.Types.ObjectId, ref: 'PaymentService', required: true },
  periodo: { type: String, required: true }, // 'YYYY-MM'

  fechaLimite: { type: String, required: true }, // 'YYYY-MM-DD'
  fechaMeter:  { type: String, required: true },
  fechaPago:   { type: String, required: true },
  semana:      { type: Number, required: true },
  anioSemana:  { type: Number, required: true },
  // true cuando el usuario corrigió la fecha límite a mano (la factura traía
  // otra) — así un cambio posterior en el catálogo no se la pisa.
  fechaLimiteManual: { type: Boolean, default: false },

  estado:    { type: String, enum: STATES, default: 'pendiente' },
  folioCxp:  { type: String, default: '', trim: true },
  montoReal: { type: Number, default: null },
  notas:     { type: String, default: '' },

  updatedByName: { type: String, default: '' },
}, { timestamps: true });

paymentCycleSchema.index({ service: 1, periodo: 1 }, { unique: true });
paymentCycleSchema.index({ fechaMeter: 1, estado: 1 });

const PaymentCycle = mongoose.model('PaymentCycle', paymentCycleSchema);
PaymentCycle.STATES = STATES;
PaymentCycle.OPEN_STATES = OPEN_STATES;
module.exports = PaymentCycle;
