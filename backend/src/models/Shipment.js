const mongoose = require('mongoose');
const crypto = require('crypto');

// Salidas de equipo entre sucursales (o para mantenimiento/reparación/baja),
// digitaliza el "FORMATO DE SALIDA DE EQUIPOS" (Cómputo y Celulares) que
// Sistemas llenaba en Word. A diferencia de las Solicitudes (que llena
// cualquier empleado desde un link público), esta la crea Sistemas — el
// rastreo tipo paquetería (enviado → en tránsito → recibido) es lo nuevo:
// el destinatario confirma la recepción él mismo desde un link único, sin
// necesitar cuenta en el sistema.
const REASON_OPTIONS = [
  'Mantenimiento / Reparación interna',
  'Reparación externa (garantía / proveedor)',
  'Préstamo temporal',
  'Baja definitiva / Desincorporación',
  'Otro',
];

const shipmentItemSchema = new mongoose.Schema({
  // Si se eligió desde Activos/Accesorios ya existentes, queda vinculado
  // aquí — al confirmarse la recepción, se actualiza su ubicación real.
  assetRef:     { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },
  type:         { type: String, default: '' },
  description:  { type: String, default: '' }, // marca/modelo
  serialOrImei: { type: String, default: '' },
  condition:    { type: String, default: '' }, // Buena / Regular / Mala
  itemStatus:   { type: String, default: '' }, // Nueva / Usada
}, { _id: false });

const shipmentSchema = new mongoose.Schema({
  folio: { type: String, required: true, unique: true },

  requesterName:       { type: String, required: true },
  requesterDepartment: { type: String, default: '' },
  requesterPosition:   { type: String, default: '' },
  requesterRef:        { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  originOffice:      { type: String, required: true },
  destinationOffice: { type: String, required: true },
  recipientName:     { type: String, required: true },

  items: { type: [shipmentItemSchema], default: [] },

  reason:      { type: String, enum: REASON_OPTIONS, required: true },
  reasonOther: { type: String, default: '' },
  notes:       { type: String, default: '' },
  returnDate:  { type: Date }, // relevante si es préstamo temporal/mantenimiento

  status: { type: String, enum: ['enviado', 'en_transito', 'recibido'], default: 'enviado' },

  // Secreto del link público — solo quien lo tenga (compartido por
  // WhatsApp/correo) puede ver el detalle y confirmar recepción.
  confirmToken: { type: String, required: true, unique: true, default: () => crypto.randomBytes(16).toString('hex') },

  sentByName: { type: String, default: '' },
  sentBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  transitAt:  { type: Date },

  receivedAt:     { type: Date },
  receivedByName: { type: String, default: '' }, // quien confirmó — puede no ser exactamente recipientName
  receivedNotes:  { type: String, default: '' },
}, { timestamps: true });

const Shipment = mongoose.model('Shipment', shipmentSchema);
Shipment.REASON_OPTIONS = REASON_OPTIONS;

module.exports = Shipment;
