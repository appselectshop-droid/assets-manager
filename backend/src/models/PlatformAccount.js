const mongoose = require('mongoose');

const platformAccountSchema = new mongoose.Schema({
  employee:           { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null }, // null = disponible para reciclar
  platform:           { type: String, required: true, trim: true }, // Microsoft, Amazon, Netflix, Otra...
  username:           { type: String, required: true, trim: true }, // correo o usuario de la cuenta en esa plataforma
  passwordEncrypted:  { type: String, required: true },
  passwordManuallySet:{ type: Boolean, default: false }, // true tras usar la corrección manual de contraseña (solo una vez)
  status:             { type: String, enum: ['activa', 'inactiva'], default: 'activa' },
  notes:              { type: String, default: '' },
  createdByName:      { type: String, default: '' },
  // Campos manuales de la Responsiva de solicitud de acceso (no se pueden llenar solos)
  store:              { type: String, default: '' }, // Tienda / Cuenta / Seller
  directManager:      { type: String, default: '' }, // Jefe directo
  accessRole:         { type: String, default: '' }, // Rol o tipo de acceso
  accessValidity:     { type: String, default: '' }, // Vigencia del acceso
}, { timestamps: true });

platformAccountSchema.index({ platform: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('PlatformAccount', platformAccountSchema);
