const mongoose = require('mongoose');

// Contraparte de OnboardingRequest.js, pero en 2 etapas de aprobación en vez
// de 1 (pedido explícito del usuario, sesión 2026-07-20): un jefe reporta
// que alguien de su equipo causa baja → RH lo revisa (ve de un jalón qué
// activos tiene esa persona asignados AHORITA, sin tener que volver a
// capturarlos) → si RH aprueba, Sistemas recibe el aviso y, al procesarlo,
// se reusa exactamente el mismo mecanismo que ya existe para "Dar de baja"
// en Empleados (marcar al empleado inactivo + liberar sus activos vía
// utils/releaseAssetsOnBaja.js) — no se duplica esa lógica.
const offboardingRequestSchema = new mongoose.Schema({
  // A quién se le da de baja — se guarda tanto la referencia como una copia
  // de sus datos (por si el empleado se edita/elimina después, el historial
  // de la solicitud no debe depender de que ese documento siga intacto).
  employeeRef:      { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeName:     { type: String, required: true },
  employeePosition: { type: String, default: '' },
  employeeArea:     { type: String, default: '' },
  employeeOffice:   { type: String, default: '' },

  // Catálogo estándar de RH (ver frontend/src/config/offboardingReasons.js)
  // + "Otro" con texto libre — selección múltiple, mismo patrón que
  // accessoryTypes/computerTypes en OnboardingRequest.js.
  reasons:     { type: [String], default: [] },
  reasonOther: { type: String, default: '' },
  bajaDate:    { type: Date },
  notes:       { type: String, default: '' },

  // Foto de qué activos tenía asignados la persona AL MOMENTO en que el jefe
  // reportó la baja — se calcula una sola vez al crear la solicitud (ver
  // routes/offboardingRequests.js), así RH no depende de entrar a Activos
  // para saber qué hay que recoger. Es solo informativo: lo que Sistemas
  // realmente libera al procesar la baja son las Asignaciones activas EN ESE
  // MOMENTO (pueden haber cambiado desde que se creó la solicitud).
  assetsSnapshot: [{
    assetId: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
    type:    String,
    brand:   String,
    model:   String,
    serialNumber: String,
    inventoryTag: String,
  }],

  // El jefe que reporta la baja.
  requestedByName:  { type: String, default: '' },
  requestedByEmail: { type: String, default: '' },
  submitterRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  // 2 aprobaciones encadenadas, no 1: RH primero, Sistemas después. Un
  // rechazo en cualquiera de las 2 etapas cierra la solicitud sin tocar
  // nada del empleado.
  status: {
    type: String,
    enum: ['pendiente_rh', 'rechazada_rh', 'pendiente_sistemas', 'rechazada_sistemas', 'completada'],
    default: 'pendiente_rh',
  },

  rhReviewedByName:  { type: String, default: '' },
  rhReviewedAt:      { type: Date },
  rhRejectionReason: { type: String, default: '' },

  // Se llenan al procesar (ver PUT /:id/complete) — freedCount es cuántos
  // activos se liberaron en ese momento (puede diferir de assetsSnapshot.length
  // si algo cambió mientras la solicitud esperaba).
  sistemasReviewedByName: { type: String, default: '' },
  sistemasReviewedAt:     { type: Date },
  sistemasRejectionReason: { type: String, default: '' },
  freedCount: { type: Number, default: 0 },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('OffboardingRequest', offboardingRequestSchema);
