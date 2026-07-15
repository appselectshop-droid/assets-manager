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

  // Tienda/seller al que pertenece esta cuenta — aplica a plataformas de
  // marketplace (por ahora solo se captura en el formulario para Mercado
  // Libre, ver PlatformAccounts.jsx).
  store: { type: String, default: '', trim: true },

  // Si el usuario/correo de esta cuenta es en realidad un ALIAS de un
  // buzón de Microsoft 365 (Microsoft permite crear varios alias sobre un
  // mismo buzón, y se usan como login independiente en cada plataforma) —
  // referencia puramente informativa a esa otra cuenta, para no perder el
  // rastro. Esta cuenta sigue siendo 100% independiente (su propia
  // contraseña, estado, etc.), no hereda nada de la cuenta de 365.
  aliasOf: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAccount', default: null },
}, { timestamps: true });

platformAccountSchema.index({ platform: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('PlatformAccount', platformAccountSchema);
