const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:   { type: String, required: true },
  action:     { type: String, enum: ['crear', 'editar', 'eliminar', 'asignar', 'devolver'], required: true },
  entity:     { type: String, enum: ['activo', 'empleado', 'usuario', 'cuenta_gmail', 'cuenta_plataforma'], required: true },
  entityId:   { type: String },
  entityName: { type: String },
  details:    { type: String },
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
