const mongoose = require('mongoose');

// Solicitudes de ingreso de personal nuevo, enviadas por RH desde la página
// pública (frontend/src/pages/SolicitarIngreso.jsx, sin login) — reemplaza el
// correo manual que RH mandaba avisando qué necesita cada ingreso nuevo
// (equipo, teléfono, correo, kit de bienvenida) y con qué datos darlo de alta
// en el sistema. Nunca se crea el Employee automático: alguien de Sistemas la
// revisa, confirma/corrige los datos y la aprueba a mano.
const onboardingRequestSchema = new mongoose.Schema({
  // Datos del nuevo ingreso — tal cual los puso RH, se confirman/corrigen al aprobar.
  employeeName:  { type: String, required: true },
  position:      { type: String, default: '' },
  department:    { type: String, default: '' },
  area:          { type: String, default: '' },
  businessName:  { type: String, default: '' },
  office:        { type: String, default: '' },
  directManager: { type: String, default: '' },
  startDate:     { type: Date },

  // Cómo quieren que quede el correo corporativo (ej. "metodosyprocedimientos@selectshop.com.mx")
  // — es una sugerencia de RH/el jefe directo, no se crea nada real solo con esto.
  desiredCorporateEmail: { type: String, default: '' },

  // Los tipos son las mismas etiquetas ya registradas en la app (ver
  // frontend/src/config/assetFields.js: ASSET_TYPE_LABELS/ACCESSORY_TYPE_LABELS)
  // — selección múltiple, no texto libre.
  needsEmail:        { type: Boolean, default: false },
  needsComputer:     { type: Boolean, default: false },
  computerTypes:     { type: [String], default: [] }, // ej. ['Laptop', 'All-in-One']
  needsPhone:        { type: Boolean, default: false },
  phoneTypes:        { type: [String], default: [] }, // ej. ['Celular']
  needsAccessories:  { type: Boolean, default: false },
  accessoryTypes:    { type: [String], default: [] }, // ej. ['Monitor', 'Mouse']
  accessoryOther:    { type: String, default: '' }, // texto libre si no está en la lista

  notes:            { type: String, default: '' }, // observaciones generales
  requestedByName:  { type: String, default: '' }, // quién de RH llenó el formulario
  requestedByEmail: { type: String, default: '' },

  status: { type: String, enum: ['pendiente', 'aprobada', 'rechazada'], default: 'pendiente' },

  // Se llenan al resolver la solicitud
  createdEmployee:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },
  reviewedByName:   { type: String, default: '' },
  reviewedAt:       { type: Date },
  rejectionReason:  { type: String, default: '' },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

module.exports = mongoose.model('OnboardingRequest', onboardingRequestSchema);
