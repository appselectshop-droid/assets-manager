const mongoose = require('mongoose');

// Catálogo real de sucursales — pedido de la junta de Finanzas del 10 jul:
// hoy "office"/"location" era texto libre duplicado en 3 archivos del
// frontend (assetFields.js, Employees.jsx, SolicitarIngreso.jsx). Este
// catálogo además permite trackear el estatus del levantamiento físico de
// inventario por sucursal (dato que la dirección ya dio para varias, pero
// que no había dónde capturar).
const INVENTORY_STATUS = ['levantado', 'pendiente'];
// "¿Qué tipo de equipo tiene esta sucursal?" — dato mencionado en la sesión
// pero no desglosado por tienda; queda null hasta que se precise.
const EQUIPMENT_SCOPE = ['solo_telefonico', 'computo_completo'];

const branchSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  inventoryStatus: { type: String, enum: INVENTORY_STATUS, default: 'pendiente' },
  equipmentScope: { type: String, enum: EQUIPMENT_SCOPE, default: null },
  notes: { type: String, default: '' },
}, { timestamps: true });

const Branch = mongoose.model('Branch', branchSchema);
Branch.INVENTORY_STATUS = INVENTORY_STATUS;
Branch.EQUIPMENT_SCOPE = EQUIPMENT_SCOPE;

module.exports = Branch;
