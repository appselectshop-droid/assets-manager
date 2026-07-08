const mongoose = require('mongoose');

// Opciones de "Solicitud de Recursos" que se van agregando con el tiempo —
// alguien pide algo con "Otro (especifica)" y, si Sistemas lo aprueba, queda
// disponible como casilla propia para la próxima vez, sin necesitar un
// cambio de código. Ver frontend/src/pages/SolicitarRecurso.jsx.
const customResourceOptionSchema = new mongoose.Schema({
  label:        { type: String, required: true, unique: true },
  addedByName:  { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('CustomResourceOption', customResourceOptionSchema);
