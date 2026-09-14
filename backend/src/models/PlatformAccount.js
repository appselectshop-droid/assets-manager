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

  // Tienda/seller al que pertenece esta cuenta — pedido explícito del
  // usuario (2026-07-29): "en todas [las plataformas] déjame poner a qué
  // tienda tendrá acceso". Obligatorio solo para Mercado Libre (una cuenta
  // de ese marketplace no tiene sentido sin saber de qué tienda/seller es);
  // opcional en el resto, ver PlatformAccounts.jsx.
  store: { type: String, default: '', trim: true },

  // Si el usuario/correo de esta cuenta es en realidad un ALIAS de un
  // buzón de Microsoft 365 (Microsoft permite crear varios alias sobre un
  // mismo buzón, y se usan como login independiente en cada plataforma) —
  // referencia puramente informativa a esa otra cuenta, para no perder el
  // rastro. Esta cuenta sigue siendo 100% independiente (su propia
  // contraseña, estado, etc.), no hereda nada de la cuenta de 365.
  aliasOf: { type: mongoose.Schema.Types.ObjectId, ref: 'PlatformAccount', default: null },

  // Historial de dueños (2026-09-14, pedido explícito del usuario: "cuando
  // damos de baja a un usuario también reciclamos los correos... porque
  // los nombres de los correos son del puesto, no de la persona") — antes
  // reasignar `employee` lo sobreescribía sin dejar rastro estructurado
  // (solo una línea de texto libre en AuditLog). Esto causó un bug real
  // (2026-09-10, cuenta reciclada Atsiel → Mariano: el reporte semanal de
  // Mariano calculaba tickets de la semana en que Atsiel todavía tenía la
  // cuenta, porque nada sabía "desde cuándo" era de Mariano). Cada entrada
  // cierra su propio período (`unassignedAt`) al reasignarse o liberarse —
  // ver PUT /:id en platformAccounts.js.
  ownerHistory: [{
    employee:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    employeeName: { type: String, default: '' }, // snapshot — sigue legible si el empleado se borra después
    assignedAt:   { type: Date, required: true },
    unassignedAt: { type: Date, default: null }, // null = todavía es el dueño actual
  }],
}, { timestamps: true });

platformAccountSchema.index({ platform: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('PlatformAccount', platformAccountSchema);
