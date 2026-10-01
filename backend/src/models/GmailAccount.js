const mongoose = require('mongoose');

const gmailAccountSchema = new mongoose.Schema({
  // Ya es reciclable (2026-09-14, pedido explícito del usuario: "hasta
  // gmail a veces [se recicla]") — antes `required: true` porque "por
  // ahora Gmail no es reciclable"; ahora nullable igual que
  // PlatformAccount.employee (null = disponible para reciclar), ver
  // PUT /:id en gmailAccounts.js para el alta/baja de dueño.
  employee:           { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', default: null },
  email:              { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordEncrypted:  { type: String, required: true },
  // true tras usar la corrección manual de contraseña al menos una vez —
  // ya no bloquea volver a usarla (2026-10-01, pedido explícito del
  // usuario: cambió la contraseña real en Gmail dos veces y el sistema ya
  // no lo dejaba corregirla aquí la tercera); se deja el campo solo como
  // rastro informativo, sin ningún gate en gmailAccounts.js.
  passwordManuallySet:{ type: Boolean, default: false },
  status:             { type: String, enum: ['activa', 'inactiva'], default: 'activa' },
  notes:              { type: String, default: '' },
  createdByName:      { type: String, default: '' },

  // Historial de dueños — mismo mecanismo y mismo motivo que
  // PlatformAccount.ownerHistory (ver ese modelo para el detalle
  // completo del bug que esto evita).
  ownerHistory: [{
    employee:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
    employeeName: { type: String, default: '' },
    assignedAt:   { type: Date, required: true },
    unassignedAt: { type: Date, default: null },
  }],
}, { timestamps: true });

module.exports = mongoose.model('GmailAccount', gmailAccountSchema);
