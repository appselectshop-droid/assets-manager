const mongoose = require('mongoose');

// Opciones de "cómo se resolvió" un ticket que se van agregando con el
// tiempo — igual que CustomResourceOption.js pero para el catálogo de
// resoluciones: alguien resuelve con "Otro (especifica)" y, si se marca,
// queda disponible como opción propia para la próxima vez.
const ticketResolutionOptionSchema = new mongoose.Schema({
  label:       { type: String, required: true, unique: true },
  addedByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('TicketResolutionOption', ticketResolutionOptionSchema);
