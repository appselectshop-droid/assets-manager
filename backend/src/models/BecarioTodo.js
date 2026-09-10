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

// Un becario asignado — antes vivía como assignedToName/assignedToEmail
// (un solo string cada uno). Convertido a array (2026-09-10, corrección
// explícita de Felipe/el usuario tras probar "asignar a ambos": "quien
// tenga chance de hacerlo, o uno lo inicia y el otro le da seguimiento" —
// una sola tarjeta COMPARTIDA, no una copia independiente por cada
// becario elegido, que era como se había hecho la primera vez).
const assigneeSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true },
}, { _id: false, timestamps: false });

const becarioTodoSchema = new mongoose.Schema({
  // asignado_por (quién la creó) / asignado_a (quién debe cumplirla) — el
  // documento pide explícitamente que cualquier "mentor" pueda crear y
  // asignar tareas a un becario, no solo autopendientes. Por ahora
  // cualquiera con acceso al panel puede asignar a cualquiera (ver
  // GET /becarios/team) — el modelo ya soporta más mentores sin cambios.
  authorName:  { type: String, required: true },
  authorEmail: { type: String, required: true },
  // Uno o varios becarios comparten la MISMA tarea — un solo check, no una
  // copia por persona (ver comentario de assigneeSchema arriba).
  assignedTo: {
    type: [assigneeSchema],
    required: true,
    validate: { validator: (v) => Array.isArray(v) && v.length > 0, message: 'Elige al menos un becario asignado.' },
  },

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
  // Quién de los asignados fue el que en verdad la completó (2026-09-10) —
  // con una tarea compartida entre 2 personas, los puntos van a quien la
  // marcó, no a "el asignado" (ya no hay uno solo fijo). Solo aplica a
  // 'unica' — las recurrentes usan completionLog de abajo (una entrada por
  // persona/período).
  completedByName: { type: String },
  completedByEmail: { type: String },

  // Racha — solo tareas recurrentes. congelamientos_disponibles empieza en
  // 1 y no se recarga solo cada semana todavía (simplificación de la Fase 2
  // del documento; recargar semanalmente queda para cuando haga falta de
  // verdad). La racha es DEL EQUIPO asignado a esta tarea (compartida,
  // igual que el resto), no de una sola persona — completionLog guarda
  // cada período completado CON quién lo completó, de ahí se calculan los
  // puntos por persona en /becarios/stats sin tener que adivinar.
  currentStreak: { type: Number, default: 0 },
  maxStreak: { type: Number, default: 0 },
  lastCompletedDate: { type: Date },
  freezesAvailable: { type: Number, default: 1 },
  completionLog: [{
    date: { type: Date, required: true },
    byName: { type: String, required: true },
    byEmail: { type: String, required: true },
  }],

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
