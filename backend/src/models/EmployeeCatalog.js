const mongoose = require('mongoose');

// Catálogos editables de metadatos de Empleados (departamento, área, razón
// social, puesto, oficina) — pedido explícito del usuario (2026-08-07):
// antes cada uno era una lista fija en el código (o texto libre, sin lista)
// repetida en varios archivos (Employees.jsx, assetFields.js, etc.) — ahora
// se gestionan desde una sola pantalla (agregar/editar/eliminar) y todos los
// formularios leen de aquí. Un solo modelo con `type` en vez de 5 modelos
// idénticos — son, en el fondo, la misma estructura (una etiqueta).
const employeeCatalogSchema = new mongoose.Schema({
  type: { type: String, enum: ['departamento', 'area', 'razon_social', 'puesto', 'oficina'], required: true },
  label: { type: String, required: true, trim: true },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

// Único por tipo — "Ventas" puede existir como Departamento sin chocar con
// un futuro Puesto llamado igual, pero no se puede repetir DOS VECES como
// Departamento.
employeeCatalogSchema.index({ type: 1, label: 1 }, { unique: true });

module.exports = mongoose.model('EmployeeCatalog', employeeCatalogSchema);
