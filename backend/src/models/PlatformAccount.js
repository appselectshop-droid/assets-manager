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

  // Alias de correo (Microsoft 365 permite crear varios sobre un mismo
  // buzón) — solo aplica cuando platform === 'Microsoft 365'. Cada uno se
  // usa como usuario de login en una plataforma de venta distinta (Mercado
  // Libre, Amazon...), y aquí se anota cuál para no perder el rastro.
  aliases: [{
    address:         { type: String, required: true, trim: true, lowercase: true },
    usedForPlatform: { type: String, default: '', trim: true }, // ej. "Mercado Libre", "Amazon"
  }],
}, { timestamps: true });

platformAccountSchema.index({ platform: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('PlatformAccount', platformAccountSchema);
