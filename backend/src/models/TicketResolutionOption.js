const mongoose = require('mongoose');

// Opciones de "cómo se resolvió" un ticket que se van agregando con el
// tiempo — igual que CustomResourceOption.js pero para el catálogo de
// resoluciones: alguien resuelve con "Otro (especifica)" y, si se marca,
// queda disponible como opción propia para la próxima vez.
const ticketResolutionOptionSchema = new mongoose.Schema({
  label:       { type: String, required: true, unique: true },
  addedByName: { type: String, default: '' },
  // Catálogo aparte para BI (ej. "Ayuda con Excel") — pedido explícito del
  // usuario (2026-07-31): resuelven un tipo de problema muy distinto al
  // resto de Sistemas, así que no comparten el mismo catálogo (ver
  // PUT /:id/status y GET /resolution-options en routes/tickets.js).
  scope: { type: String, enum: ['general', 'bi'], default: 'general' },
}, { timestamps: true });

module.exports = mongoose.model('TicketResolutionOption', ticketResolutionOptionSchema);
