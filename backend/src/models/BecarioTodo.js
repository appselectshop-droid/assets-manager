const mongoose = require('mongoose');

// Pendientes (to-do) de la Bitácora de becarios — pedido explícito del
// usuario (2026-09-07): "ayúdame a que sea interactivo... tal vez algo
// como to-do", después de ver el feed y encontrarlo "muy equis". Lista
// compartida (ambos becarios ven y pueden marcar los pendientes del otro,
// mismo espíritu de retroalimentación que el feed) — solo borra quien lo
// creó o un administrador (ver routes/becarios.js).
const subtaskSchema = new mongoose.Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
}, { _id: true, timestamps: false });

const becarioTodoSchema = new mongoose.Schema({
  authorName:  { type: String, required: true },
  authorEmail: { type: String, required: true },
  text:        { type: String, required: true },
  done:        { type: Boolean, default: false },
  completedAt: { type: Date },
  // Campo heredado de un intento anterior (2026-09-07) de meter el reporte
  // semanal aquí como checklist — se descartó (el reporte real vive en
  // Calendario, ver CalendarActivity.reportType==='becario_semanal') pero se
  // deja el campo para poder seguir filtrando esos 4 registros huérfanos
  // fuera de la vista de Pendientes (ver GET /becarios/todos en
  // routes/becarios.js) sin tener que borrarlos.
  category: { type: String, default: 'general' },

  // Ampliado a "to-do app real" (2026-09-08, pedido explícito del usuario:
  // "todo, hazlo muy padre") — fecha límite, prioridad y subtareas, más un
  // orden manual para poder subir/bajar pendientes en la lista.
  dueDate:  { type: Date },
  priority: { type: String, enum: ['alta', 'media', 'baja'], default: 'media' },
  subtasks: [subtaskSchema],
  order:    { type: Number, default: 0 },
}, { timestamps: true });

module.exports = mongoose.model('BecarioTodo', becarioTodoSchema);
