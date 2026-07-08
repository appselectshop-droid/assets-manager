const mongoose = require('mongoose');

// Solicitudes de recursos (accesorios de stock + línea telefónica), enviadas
// desde la página pública (frontend/src/pages/SolicitarRecurso.jsx, sin
// login) — reemplaza el Excel "FORMATO DE SOLICITUD DE RECURSOS Y
// SERVICIOS" (SS-STD-DA-F01) que se llenaba y firmaba a mano. Simplificado
// a pedido del usuario: siempre es asignación de lo que Sistemas ya tiene
// para dar (no compras ni instalaciones, eso lo maneja otra área), así que
// no se pide "tipo de solicitud" — solo qué necesita y por qué. Solo queda
// "pendiente" para que quien revise (Sistemas/Dirección) la apruebe o
// rechace desde "Solicitudes de Recursos".
const resourceRequestSchema = new mongoose.Schema({
  // Datos de quien solicita. position/department se autocompletan al
  // encontrar al empleado (ver /employees/public-lookup) — no se le vuelven
  // a pedir si ya se conocen.
  employeeName: { type: String, required: true },
  position:     { type: String, default: '' },
  department:   { type: String, default: '' },
  // Se llena solo si el solicitante se encontró por nombre en Empleados
  // (ver /employees/public-lookup) — permite asignarle el recurso directo
  // desde "Solicitudes de Recursos" sin tener que volver a buscarlo.
  employeeRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  // Lo que puede entregar Sistemas de su stock — mismo catálogo que ya usa
  // el resto de la app (ver ACCESSORY_TYPE_LABELS), más "Línea Telefónica"
  // como opción aparte porque es un servicio, no un accesorio físico.
  resourceItems: { type: [String], default: [] },

  justification: { type: String, default: '' }, // "Justificación de la Solicitud"

  requestedByEmail: { type: String, default: '' }, // opcional, para avisar el resultado

  status: { type: String, enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' },

  // Se llenan al resolver la solicitud
  resolutionNotes: { type: String, default: '' }, // qué se entregó/asignó, o notas de aprobación
  reviewedByName:  { type: String, default: '' },
  reviewedAt:      { type: Date },
  rejectionReason: { type: String, default: '' },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('ResourceRequest', resourceRequestSchema);
