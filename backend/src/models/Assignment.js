const mongoose = require('mongoose');

const assignmentSchema = new mongoose.Schema({
  employee: { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  asset: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset', required: true },
  assignedDate: { type: Date, default: Date.now },
  returnDate: { type: Date },
  quantity: { type: Number, default: 1 },
  notes: { type: String, default: '' },
  active: { type: Boolean, default: true },
  // pairedAssignment (2026-08-04) — liga esta asignación con la de su
  // "pareja" cuando se asignan un celular y una línea telefónica juntos
  // (pedido explícito del usuario, para el caso de un aparato sin línea +
  // una línea separada, entregados a la misma persona). Solo se usa para
  // que la responsiva los muestre juntos en un mismo renglón — NO afecta
  // el flujo de devolución/baja: cada Assignment sigue siendo
  // independiente, se devuelve/libera su propio activo sin importar si la
  // pareja sigue activa o no.
  pairedAssignment: { type: mongoose.Schema.Types.ObjectId, ref: 'Assignment', default: null },
}, { timestamps: true });

module.exports = mongoose.model('Assignment', assignmentSchema);
