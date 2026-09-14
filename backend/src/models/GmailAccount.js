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
  passwordManuallySet:{ type: Boolean, default: false }, // true tras usar la corrección manual de contraseña (solo una vez)
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
