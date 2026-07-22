const mongoose = require('mongoose');

// Catálogo de sistemas ERP (SAP, Odoo, Aspel...) que se va agregando con el
// tiempo — mismo patrón que CustomResourceOption.js pero para el campo
// "Sistema / ERP" de Solicitar Cuenta: alguien escribe uno nuevo con "Otro /
// no está en la lista" y, si Sistemas lo aprueba, queda disponible como
// opción del <select> para la próxima vez, sin necesitar un cambio de
// código. Ver frontend/src/pages/SolicitarCuenta.jsx.
const customErpSystemOptionSchema = new mongoose.Schema({
  label:        { type: String, required: true, unique: true },
  addedByName:  { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('CustomErpSystemOption', customErpSystemOptionSchema);
