const mongoose = require('mongoose');

// Solicitudes de recursos y servicios (equipo, software, licencias, líneas,
// servicios externos, etc.), enviadas desde la página pública
// (frontend/src/pages/SolicitarRecurso.jsx, sin login) — reemplaza el Excel
// "FORMATO DE SOLICITUD DE RECURSOS Y SERVICIOS" (SS-STD-DA-F01) que se
// llenaba y firmaba a mano. Solo queda "pendiente" para que quien revise
// (Sistemas/Dirección) la apruebe o rechace desde "Solicitudes de Recursos".
const resourceRequestSchema = new mongoose.Schema({
  // Datos de quien solicita — "SOLICITA" en el Excel.
  employeeName:  { type: String, required: true },
  position:      { type: String, default: '' },
  department:    { type: String, default: '' },
  directManager: { type: String, default: '' },

  // Mismas listas de opciones ya validadas en el Excel (D12/D13).
  requestType: {
    type: String,
    enum: ['ASIGNACIÓN', 'COMPRA', 'INSTALACIÓN'],
    required: true,
  },
  resourceService: {
    type: String,
    enum: [
      'LÍNEA TELEFÓNICA', 'EQUIPO FOTOGRÁFICO', 'EQUIPO DE CÓMPUTO', 'EQUIPO TELEFÓNICO',
      'SOFTWARE O LICENCIA', 'APP', 'SERVICIO EXTERNO', 'EQUIPO DE CÓMPUTO Y TELEFONÍA', 'OTRO',
    ],
    required: true,
  },

  detail:        { type: String, default: '' }, // "Detalle de la Solicitud"
  justification: { type: String, default: '' }, // "Justificación de la Solicitud"

  requestedByEmail: { type: String, default: '' }, // opcional, para avisar el resultado

  status: { type: String, enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' },

  // Se llenan al resolver la solicitud
  resolutionNotes: { type: String, default: '' }, // qué se hizo/compró/instaló, o notas de aprobación
  reviewedByName:  { type: String, default: '' },
  reviewedAt:      { type: Date },
  rejectionReason: { type: String, default: '' },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('ResourceRequest', resourceRequestSchema);
