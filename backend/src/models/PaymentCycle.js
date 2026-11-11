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
  // true = montoReal se calculó solo (suma de los XML subidos); si el
  // usuario lo captura a mano pasa a false y ya no se recalcula.
  montoRealAuto: { type: Boolean, default: false },
  notas:     { type: String, default: '' },

  // Facturas del periodo (2026-11-11, pedido explícito del usuario: "que
  // deje importar las facturas en vez de palomear solamente... es pdf y xml
  // siempre, luego vienen varias en un pago"). El archivo vive en GridFS
  // (bucket `paymentInvoices`), aquí solo la referencia + lo leído del XML.
  facturas: [{
    fileId:      { type: mongoose.Schema.Types.ObjectId, required: true },
    filename:    { type: String, required: true },
    contentType: { type: String, default: '' },
    kind:        { type: String, enum: ['pdf', 'xml'], required: true },
    size:        { type: Number, default: 0 },
    uploadedAt:  { type: Date, default: Date.now },
    uploadedBy:  { type: String, default: '' },
    hash: { type: String, default: '' }, // sha256 del archivo — detecta el mismo archivo subido dos veces
    verificacion: {
      status: { type: String, enum: ['ok', 'revisar', 'no_corresponde', 'forzada'] },
      checks: [{ _id: false, key: String, ok: mongoose.Schema.Types.Mixed, msg: String }],
    },
    cfdi: {
      uuid: String, serie: String, folio: String, fecha: String,
      total: Number, moneda: String, tipo: String,
      emisorNombre: String, emisorRfc: String, receptorNombre: String, receptorRfc: String,
    },
  }],

  updatedByName: { type: String, default: '' },
}, { timestamps: true });

paymentCycleSchema.index({ service: 1, periodo: 1 }, { unique: true });
paymentCycleSchema.index({ fechaMeter: 1, estado: 1 });

const PaymentCycle = mongoose.model('PaymentCycle', paymentCycleSchema);
PaymentCycle.STATES = STATES;
PaymentCycle.OPEN_STATES = OPEN_STATES;
module.exports = PaymentCycle;
