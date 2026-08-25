const mongoose = require('mongoose');
const crypto = require('crypto');

// Baja de activos (por venta u otro motivo) — digitaliza el flujo que antes
// era un Word suelto (`responsiva_ref/Formato_Salida_Venta_Activo.docx`,
// creado el 2026-08-25 a petición del usuario) para llevarlo dentro del
// sistema: un apartado de "Bajas" donde queda el historial completo y desde
// donde se genera el mismo formato ya auto-llenado en PDF (ver
// utils/assetBajaPdf.js), igual que ya pasa con Envíos (shipmentPdf.js).
const REASON_OPTIONS = [
  'Venta',
  'Robo o extravío',
  'Descompuesto sin reparación posible',
  'Obsolescencia',
  'Otro',
];

const BUYER_TYPE_OPTIONS = ['empleado', 'externo'];
const PAYMENT_METHOD_OPTIONS = ['Efectivo', 'Transferencia', 'Descuento vía nómina', 'Otro'];
const CONDITION_OPTIONS = ['Bueno', 'Regular', 'Dañado'];

function generateFolio() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `BAJ-${year}-${rand}`;
}

const assetBajaSchema = new mongoose.Schema({
  folio: { type: String, required: true, unique: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },

  // Copia de los datos del activo al momento de la baja — el PDF ya
  // generado/archivado debe seguir mostrando siempre lo mismo aunque el
  // Asset original se edite o (más adelante) se borre; mismo criterio que
  // ResponsivaArchive con el PDF completo.
  assetSnapshot: {
    type: { type: String, default: '' },
    brand: { type: String, default: '' },
    model: { type: String, default: '' },
    serialNumber: { type: String, default: '' },
    inventoryTag: { type: String, default: '' },
    location: { type: String, default: '' },
  },

  condition: { type: String, enum: CONDITION_OPTIONS, default: 'Bueno' },
  conditionNotes: { type: String, default: '' },
  dataWiped: { type: Boolean, default: false },

  reason: { type: String, enum: REASON_OPTIONS, required: true },
  reasonOther: { type: String, default: '' },

  // Los campos de comprador/venta solo se llenan si reason === 'Venta' — la
  // ruta (POST /) es la que exige/limpia esto, el esquema los deja opcionales
  // a propósito para no duplicar esa validación en dos lugares.
  buyerType: { type: String, enum: BUYER_TYPE_OPTIONS },
  buyerEmployee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  buyerName: { type: String, default: '' },
  buyerIdNumber: { type: String, default: '' }, // identificación oficial — solo si es externo
  buyerPhone: { type: String, default: '' },
  buyerAddress: { type: String, default: '' }, // solo si es externo

  saleAmount: { type: Number, default: null },
  paymentMethod: { type: String, enum: PAYMENT_METHOD_OPTIONS },
  paymentMethodOther: { type: String, default: '' },
  paymentDate: { type: Date },
  saleReference: { type: String, default: '' },

  // Quien entrega es siempre quien registra la baja (req.user.name) — no se
  // pide a mano. Quien autoriza (Gerente de Sistemas) NUNCA se guarda aquí a
  // propósito: se resuelve en vivo por correo corporativo al generar el PDF
  // (mismo criterio que GERENTE_SISTEMAS_EMAIL en pdfBranding.js), así el PDF
  // siempre firma quien tenga el puesto en ese momento, no quien lo tenía
  // cuando se creó el registro.
  deliveredByName: { type: String, default: '' },

  createdByName: { type: String, default: '' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

const AssetBaja = mongoose.model('AssetBaja', assetBajaSchema);
AssetBaja.REASON_OPTIONS = REASON_OPTIONS;
AssetBaja.BUYER_TYPE_OPTIONS = BUYER_TYPE_OPTIONS;
AssetBaja.PAYMENT_METHOD_OPTIONS = PAYMENT_METHOD_OPTIONS;
AssetBaja.CONDITION_OPTIONS = CONDITION_OPTIONS;
AssetBaja.generateFolio = generateFolio;

module.exports = AssetBaja;
