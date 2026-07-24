const mongoose = require('mongoose');

// Catálogo de impresoras por sucursal — antes vivía hardcodeado en
// `frontend/src/config/printerCatalog.js` (ver CHANGELOG); pedido explícito
// del usuario (2026-07-24): que se pueda editar desde el panel admin en vez
// de tener que entrar a Mongo Atlas directamente cada vez que cambia una
// impresora. Alimenta el selector "¿Cuál impresora es?" en ReportarTicket.jsx
// (categoría Impresoras) vía `GET /printers/public`.
//
// `serie` es opcional a propósito — a diferencia del catálogo original, no
// todas las impresoras que se dan de alta aquí tienen un no. de serie a la
// mano al momento de capturarlas; el identificador único ahora es el propio
// `_id` de Mongo (ver printerOptionValue en el frontend), no `branch+serie`.
const printerSchema = new mongoose.Schema({
  branch: { type: String, required: true }, // sucursal, ej. "Tepotzotlán (Select Shop)"
  nombre: { type: String, required: true }, // ubicación/para qué se usa, ej. "SHARP DEVOLUCIONES"
  modelo: { type: String, required: true },
  serie:  { type: String, default: '' },
  ip:     { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Printer', printerSchema);
