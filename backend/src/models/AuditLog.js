const mongoose = require('mongoose');

const auditLogSchema = new mongoose.Schema({
  userId:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userName:   { type: String, required: true },
  // 'impersonar' (2026-08-03): un admin inicia sesión en la Mesa de Ayuda
  // como un empleado real, sin conocer ni tocar su contraseña — ver
  // POST /employee-auth/:id/impersonate. Queda siempre en Auditoría, sin
  // excepción, por lo sensible que es poder entrar como alguien más.
  action:     { type: String, enum: ['crear', 'editar', 'eliminar', 'asignar', 'devolver', 'aprobar', 'rechazar', 'resolver', 'impersonar'], required: true },
  entity:     {
    type: String,
    enum: [
      'activo', 'empleado', 'usuario', 'cuenta_gmail', 'cuenta_plataforma', 'cuenta_plataforma_erp',
      'solicitud_cuenta', 'solicitud_ingreso', 'solicitud_recurso', 'envio', 'ticket', 'plano_red',
      'aplicacion_interna', 'sucursal', 'aviso', 'catalogo_empleado',
    ],
    required: true,
  },
  entityId:   { type: String },
  entityName: { type: String },
  details:    { type: String },
}, { timestamps: true });

module.exports = mongoose.model('AuditLog', auditLogSchema);
