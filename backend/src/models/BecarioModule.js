const mongoose = require('mongoose');

// Ruta de aprendizaje de la Bitácora de becarios. Un módulo = un tema
// grande (ej. "Soporte a usuarios"), cada uno con una lista de temas
// concretos que se van marcando.
//
// `completedBy` (2026-09-08, corrección real reportada por el usuario tras
// probarlo: "es un solo checklist global: si Mariano marca un tema, se
// marca igual para Italo. Falta separar el progreso por becario") —
// reemplaza el `done/doneByName/doneByEmail/doneAt` original (un solo
// booleano compartido) por un arreglo de quién de los becarios ya completó
// ESE tema. El avance de cada quien (% del módulo, "marcado o no") se
// calcula por persona en GET /modules (ver `doneByMe` en routes/becarios.js),
// no globalmente.
const completionSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
  completedAt: { type: Date, default: Date.now },
}, { _id: false });

const topicSchema = new mongoose.Schema({
  text: { type: String, required: true },
  completedBy: [completionSchema],
}, { timestamps: true });

const becarioModuleSchema = new mongoose.Schema({
  title: { type: String, required: true },
  icon: { type: String, default: '📘' },
  order: { type: Number, default: 0 },
  topics: [topicSchema],
}, { timestamps: true });

module.exports = mongoose.model('BecarioModule', becarioModuleSchema);
