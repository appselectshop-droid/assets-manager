const mongoose = require('mongoose');

// Igual que PlatformAccount pero en su propia colección — aislada por completo
// para que un usuario con acceso solo a ERP nunca vea las cuentas de Plataformas
// generales (ni al revés se filtra nada entre ambas).
const platformAccountErpSchema = new mongoose.Schema({
  employee:           { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null }, // null = disponible para reciclar
  platform:           { type: String, required: true, trim: true },
  username:           { type: String, required: true, trim: true },
  passwordEncrypted:  { type: String, default: '' }, // '' + passwordPending = cuenta ya existía, falta capturar su contraseña real
  passwordManuallySet:{ type: Boolean, default: false },
  passwordPending:    { type: Boolean, default: false },
  status:             { type: String, enum: ['activa', 'inactiva'], default: 'activa' },
  notes:              { type: String, default: '' },
  createdByName:      { type: String, default: '' },
}, { timestamps: true });

platformAccountErpSchema.index({ platform: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('PlatformAccountErp', platformAccountErpSchema);
