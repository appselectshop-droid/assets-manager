const mongoose = require('mongoose');

// Tareas/Pendientes de la Bitácora de becarios — reconstruido (2026-09-08)
// siguiendo al pie de la letra el documento de referencia que mandó el
// usuario ("Módulo_Tareas_Gamificación_Becarios.docx", inspirado en
// Habitica/TalentLMS/ClickUp/TickTick): asignación entre personas (no solo
// autopendientes), puntos fijos por prioridad, tareas diarias con racha y
// congelamiento semanal, y retroalimentación (comentarios/reacción) por
// tarea. El intento anterior (checklist plano + XP inventado) se descartó
// por no seguir esa especificación.
const subtaskSchema = new mongoose.Schema({
  text: { type: String, required: true },
  done: { type: Boolean, default: false },
}, { _id: true, timestamps: false });

const commentSchema = new mongoose.Schema({
  authorName: { type: String, required: true },
  authorEmail: { type: String, required: true },
  text: { type: String, required: true },
}, { timestamps: true });

const reactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  authorName: { type: String, required: true },
  authorEmail: { type: String, required: true },
}, { _id: false, timestamps: false });

// Adjuntos (2026-09-10, pedido explícito del usuario: "déjame añadir fotos,
// videos, documentos, etc.") — a diferencia de BecarioEntry.attachments
// (Buffer embebido en Mongo), aquí se guarda en OneDrive desde el inicio
// (ver graphFiles.js/Asset.photoDriveItemId): un video pesa mucho más que
// una foto, y ya hubo un incidente real (pico de memoria tumbó a MongoDB,
// ver CHANGELOG 2026-09-08) por guardar binarios directo en la colección.
const attachmentSchema = new mongoose.Schema({
  driveItemId: { type: String, required: true },
  mimeType: { type: String, required: true },
  fileName: { type: String, default: '' },
}, { _id: true, timestamps: false });

const becarioTodoSchema = new mongoose.Schema({
  // asignado_por (quién la creó) / asignado_a (quién debe cumplirla) — el
  // documento pide explícitamente que cualquier "mentor" pueda crear y
  // asignar tareas a un becario, no solo autopendientes. Por ahora
  // cualquiera con acceso al panel puede asignar a cualquiera (ver
  // GET /becarios/team) — el modelo ya soporta más mentores sin cambios.
  authorName:  { type: String, required: true },
  authorEmail: { type: String, required: true },
  // Sigue siendo UN asignado por documento a propósito — "asignar a ambos"
  // (2026-09-10, pedido explícito del usuario: "déjame poder escoger a
  // ambos o uno solo") crea un documento POR CADA becario elegido en vez de
  // convertir esto en un array (ver POST /todos en routes/becarios.js) —
  // así cada quien lleva su propia racha/puntos/estado de completado sin
  // tener que rediseñar toda la lógica de racha que ya existía para un solo
  // asignado.
  assignedToName:  { type: String, required: true },
  assignedToEmail: { type: String, required: true },

  text: { type: String, required: true },
  // 'unica' = tarea puntual normal; 'diaria'/'semanal'/'mensual' = hábito
  // recurrente con racha (ver currentStreak/lastCompletedDate/
  // freezesAvailable más abajo) — 'semanal'/'mensual' agregados 2026-09-10,
  // pedido explícito del usuario ("actividades diarias, semanales y
  // mensuales"), mismo mecanismo de racha que 'diaria' pero contando
  // semanas/meses en vez de días (ver periodKey() en routes/becarios.js).
  taskType: { type: String, enum: ['unica', 'diaria', 'semanal', 'mensual'], default: 'unica' },
  priority: { type: String, enum: ['alta', 'media', 'baja'], default: 'media' },
  // Puntos fijos por prioridad (propuesta del documento: baja=5, media=10,
  // alta=20) — se calculan al crear/editar la prioridad, no se escriben a
  // mano (ver PRIORITY_POINTS en routes/becarios.js).
  points: { type: Number, default: 10 },

  dueDate: { type: Date }, // solo aplica a 'unica'
  done: { type: Boolean, default: false }, // 'diaria': "hecho HOY", se recalcula al leer
  completedAt: { type: Date },

  // Racha — solo 'diaria'. congelamientos_disponibles empieza en 1 y no se
  // recarga solo cada semana todavía (simplificación de la Fase 2 del
  // documento; recargar semanalmente queda para cuando haga falta de
  // verdad). completionLog guarda cada día completado — de ahí se calculan
  // los puntos totales/semana en /becarios/stats sin tener que adivinar.
  currentStreak: { type: Number, default: 0 },
  maxStreak: { type: Number, default: 0 },
  lastCompletedDate: { type: Date },
  freezesAvailable: { type: Number, default: 1 },
  completionLog: [{ type: Date }],

  subtasks: [subtaskSchema],
  order: { type: Number, default: 0 },
  comments: [commentSchema],
  reactions: [reactionSchema],
  attachments: [attachmentSchema],

  // Campo heredado de un intento anterior (2026-09-07) de meter el reporte
  // semanal aquí como checklist — se descartó (el reporte real vive en
  // Calendario, ver CalendarActivity.reportType==='becario_semanal') pero se
  // deja el campo para poder seguir filtrando esos registros huérfanos
  // fuera de la vista de Pendientes sin tener que borrarlos.
  category: { type: String, default: 'general' },
}, { timestamps: true });

module.exports = mongoose.model('BecarioTodo', becarioTodoSchema);
