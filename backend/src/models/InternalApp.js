const mongoose = require('mongoose');

// Catálogo de aplicaciones internas (ej. "Cuentas por Pagar", "Aplicativo de
// Ventas") para que un ticket de aplicativo se pueda ligar a algo concreto y
// Sistemas sepa hacia dónde enrutarlo — pedido del director de Finanzas
// (ver CHANGELOG). El documento (manual/guía) se guarda en Mongo, no en
// disco, mismo criterio que Responsivas/Planos de Red (Render no persiste
// el filesystem entre despliegues).
const internalAppSchema = new mongoose.Schema({
  name:            { type: String, required: true },
  description:     { type: String, default: '' },
  responsibleName: { type: String, default: '' }, // ej. "Héctor Ramírez"
  responsibleArea: { type: String, default: '' }, // ej. "Costos y SKU"
  notes:           { type: String, default: '' },
  active:          { type: Boolean, default: true },

  documentData:       { type: Buffer },
  documentFileName:   { type: String, default: '' },
  documentMimeType:   { type: String, default: '' },
  documentUploadedAt: { type: Date },

  createdByName: { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('InternalApp', internalAppSchema);
