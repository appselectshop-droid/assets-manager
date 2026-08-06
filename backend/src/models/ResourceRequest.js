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
  // el resto de la app (ver ACCESSORY_TYPE_LABELS), más "Línea Telefónica" y
  // "Software o Licencia" aparte porque son servicios, no accesorios físicos.
  resourceItems: { type: [String], default: [] },
  licenseDetail: { type: String, default: '' }, // cuál software/licencia, si se pidió "Software o Licencia"
  otherDetail:   { type: String, default: '' }, // qué es, si se pidió "Otro (especifica)"

  // Solo si se pidió "Pila recargable" — reemplaza la hoja de papel
  // "ENTREGA DE PILA RECARGABLE" que se firmaba a mano.
  batteryType:     { type: String, enum: ['AA', 'AAA'] },
  batteryQuantity: { type: Number },
  batteryUse:      { type: String, default: '' }, // "Uso designado" (mouse, teclado, calculadora...)

  // "Firma" digital al entregar la pila (ver PUT /:id/approve) — reemplaza la
  // columna "Firma" de la hoja de papel con una confirmación explícita de
  // quien aprueba, en vez de un canvas de firma (decisión del usuario,
  // 2026-08-05: más simple y rápido de construir).
  deliveryReceivedByName: { type: String, default: '' },
  deliveryConfirmed:      { type: Boolean, default: false },

  justification: { type: String, default: '' }, // "Justificación de la Solicitud"

  requestedByEmail: { type: String, default: '' }, // opcional, para avisar el resultado

  // Quién la envió estando logueado en el portal de empleado (ver
  // middleware/optionalEmployeeAuth.js) — distinto de `employeeRef` de arriba
  // (que puede apuntar a otra persona si se autocompletó a nombre de
  // alguien más). Solo sirve para "Mis Solicitudes", nunca para el
  // auto-asignado al aprobar.
  submitterRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  // Pedido explícito del usuario (2026-08-06): si piden 2+ activos en la
  // misma solicitud, se aprueba/rechaza/pone en espera CADA UNO por
  // separado (antes era un solo estatus para toda la solicitud, y una
  // solicitud con 2 activos donde solo había 1 disponible se tenía que
  // rechazar completa y pedir que la volvieran a mandar una por una).
  // "en_espera" es un estatus nuevo, distinto de "pendiente": pendiente =
  // todavía no se revisó; en_espera = ya se revisó, ya se pidió a compras,
  // sigue sin llegar — para que el empleado sepa que no se le está
  // ignorando. `status`/`statusDetail` de abajo son un AGREGADO calculado
  // a partir de este arreglo (ver computeAggregateStatus en
  // routes/resourceRequests.js) — nunca se editan sueltos a mano.
  itemDecisions: [{
    label:               { type: String, required: true },
    status:              { type: String, enum: ['pendiente', 'aprobada', 'rechazada', 'en_espera'], default: 'pendiente' },
    notes:               { type: String, default: '' },
    decidedByName:       { type: String, default: '' },
    decidedAt:           { type: Date },
    // Solo para el item "Software o Licencia" — folio del ticket de
    // seguimiento que se genera la primera vez que SE APRUEBA ese item
    // (evita duplicarlo si se vuelve a tocar el mismo item).
    followUpTicketFolio: { type: String, default: '' },
  }],

  status:       { type: String, enum: ['pendiente', 'aprobada', 'rechazada', 'en_espera'], default: 'pendiente' },
  statusDetail: { type: String, default: '' }, // ej. "Falta decidir: Mouse, Teclado"

  // Se llenan al resolver la solicitud
  resolutionNotes: { type: String, default: '' }, // qué se entregó/asignó, o notas de aprobación
  reviewedByName:  { type: String, default: '' },
  reviewedAt:      { type: Date },
  rejectionReason: { type: String, default: '' },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('ResourceRequest', resourceRequestSchema);
