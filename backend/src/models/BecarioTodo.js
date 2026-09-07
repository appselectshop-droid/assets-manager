const mongoose = require('mongoose');

// Pendientes (to-do) de la Bitácora de becarios — pedido explícito del
// usuario (2026-09-07): "ayúdame a que sea interactivo... tal vez algo
// como to-do", después de ver el feed y encontrarlo "muy equis". Lista
// compartida (ambos becarios ven y pueden marcar los pendientes del otro,
// mismo espíritu de retroalimentación que el feed) — solo borra quien lo
// creó o un administrador (ver routes/becarios.js).
const becarioTodoSchema = new mongoose.Schema({
  authorName:  { type: String, required: true },
  authorEmail: { type: String, required: true },
  text:        { type: String, required: true },
  done:        { type: Boolean, default: false },
  completedAt: { type: Date },
  // 'reporte_semanal' — pedido explícito del usuario (2026-09-07): el
  // reporte que tienen que entregar cada viernes (soporte a proveedores
  // NOI/COI/SAE, infraestructura/mantenimiento) vive agrupado aparte de los
  // pendientes sueltos de 'general' — mismo modelo, se distingue solo por
  // esta categoría (ver TodoList en Becarios.jsx, que los agrupa en 2
  // secciones visuales).
  category: { type: String, enum: ['general', 'reporte_semanal'], default: 'general' },
}, { timestamps: true });

module.exports = mongoose.model('BecarioTodo', becarioTodoSchema);
