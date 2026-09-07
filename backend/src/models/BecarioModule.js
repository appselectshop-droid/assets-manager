const mongoose = require('mongoose');

// Ruta de aprendizaje de la Bitácora de becarios — pedido explícito del
// usuario (2026-09-08): "todo, hazlo muy padre" (combinar ruta de curso +
// gamificación + to-do real). Un módulo = un tema grande (ej. "Soporte a
// usuarios"), cada uno con una lista de temas/tareas concretas que se van
// marcando — el progreso del módulo es simplemente % de topics.done.
// Compartido entre los dos becarios (mismo espíritu que BecarioTodo):
// cualquiera marca su propio avance, cualquiera ve el del otro.
const topicSchema = new mongoose.Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
  doneByName: { type: String, default: '' },
  doneByEmail: { type: String, default: '' },
  doneAt: { type: Date },
}, { timestamps: true });

const becarioModuleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  icon: { type: String, default: '📘' },
  order: { type: Number, default: 0 },
  topics: [topicSchema],
}, { timestamps: true });

module.exports = mongoose.model('BecarioModule', becarioModuleSchema);
