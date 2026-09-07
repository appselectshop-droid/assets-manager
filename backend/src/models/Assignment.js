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
  // Piezas específicas de un lote (Asset.serials[]) que corresponden a ESTA
  // asignación — pedido explícito del usuario (2026-09-08): "busco el
  // número [de serie] pero no me dice exactamente quien lo tiene, solo me
  // arroja el monitor y todas las asignaciones". Antes de esto, un lote
  // solo llevaba `quantity` (cuántas unidades, sin decir cuáles); ahora,
  // cuando el activo trae `serials[]`, se guarda aquí qué series
  // específicas se entregaron (ver POST /assignments en routes/assignments.js).
  // Vacío para asignaciones de activos individuales o lotes sin series
  // capturadas — se sigue usando `quantity` como siempre en esos casos.
  serialNumbers: { type: [String], default: [] },
}, { timestamps: true });

// El listado de asignaciones activas (`find({active:true}).sort({assignedDate:-1})`)
// hacía COLLSCAN completo sobre toda la colección; encontrado en un pico
// real de carga del EC2 (2026-09-08, ver CHANGELOG) que además tumbó Mongo
// por falta de memoria.
assignmentSchema.index({ active: 1, assignedDate: -1 });

module.exports = mongoose.model('Assignment', assignmentSchema);
