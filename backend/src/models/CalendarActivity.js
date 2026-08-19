const mongoose = require('mongoose');

// Calendario del equipo de Sistemas — pedido explícito del usuario
// (2026-08-19): "un apartado de calendario para los de sistemas... vamos a
// estar subiendo las actividades pendientes". Nace de un Word real
// ("Planeación Trello.docx") con una mezcla de actividades únicas (fechas
// puntuales, ej. "31 de agosto Iztapalapa") y recurrentes (diarias,
// semanales, "cada 5 semanas", trimestrales) — de ahí el nombre y el
// espíritu del modelo: una tarjeta por actividad, que si es recurrente se
// re-agenda sola al completarse (mismo mecanismo que un checklist de
// Trello que se resetea), en vez de crear un documento nuevo cada vez.
//
// Compartido entre TODO el equipo (no por persona) — pedido explícito:
// Miguel, Lilly, Felipe, Atsiel y Bruno ven el mismo calendario. Permisos
// (2026-08-19, pedido explícito): "todos menos Atsiel, el solo es
// lectura" — se resuelve reutilizando el mismo criterio de acceso que ya
// tiene Tickets (role: 'admin' puede crear/editar/eliminar;
// canManageTickets — el permiso que ya tiene Atsiel/becario.sistemas sin
// ser admin — solo puede ver), sin inventar un permiso nuevo ni una lista
// de correos fija.
const calendarActivitySchema = new mongoose.Schema({
  title:       { type: String, required: true },
  description: { type: String, default: '' },

  // Agrupación libre, tomada de las secciones reales del Word ("Soporte",
  // "Limpieza de equipos", "Aplicaciones", "Infraestructura", "Cursos",
  // etc.) — texto libre a propósito, no un catálogo cerrado: la
  // planeación real trae categorías que van a seguir cambiando.
  category: { type: String, default: '' },

  // Puede ser de una persona o de varias (ej. "medios altos y altos:
  // Miguel, Lilly y Felipe") — array de referencias reales a User, no
  // texto libre, para poder mandar el recordatorio push/correo a cada
  // quien (ver siguiente fase, el cron de recordatorios).
  assignedTo: { type: [mongoose.Schema.Types.ObjectId], ref: 'User', default: [] },

  dueDate: { type: Date, required: true },

  // Hora y sucursal (2026-08-19, pedido explícito del usuario) — libres a
  // propósito, no obligatorios: muchas actividades del Word no traen hora
  // ni ubicación (ej. "Worky/Cycle: Diario"), solo las que sí son
  // presenciales en una sucursal concreta (ej. "Limpieza CEDIS/Polanco",
  // "Inventario de red — Iztapalapa"). `hora` es texto libre tipo
  // "HH:MM", separado de `dueDate` (que solo lleva la fecha) para no
  // meterle huso horario a la lógica de calendario que ya está resuelta
  // en UTC solo para el día.
  hora: { type: String, default: '' },
  sucursal: { type: String, default: '' },

  status: {
    type: String,
    enum: ['pendiente', 'en_proceso', 'completada', 'pausada'],
    default: 'pendiente',
  },

  // Recurrencia — al marcar 'completada' una actividad recurrente
  // (ver PUT /:id/complete en routes/calendarActivities.js), en vez de
  // quedarse en 'completada' para siempre, se calcula la siguiente fecha
  // y vuelve a 'pendiente' sola — mismo documento, no uno nuevo por cada
  // ocurrencia (se pierde el historial de completados pasados a propósito,
  // por simplicidad — esto es un tablero de trabajo vivo, no un reporte).
  // `personalizada` cubre casos como "cada 5 semanas" (intervalDays: 35)
  // que no son ni semanal ni mensual exactos.
  recurrence: {
    type: {
      type: String,
      enum: ['ninguna', 'diaria', 'semanal', 'mensual', 'personalizada'],
      default: 'ninguna',
    },
    intervalDays: { type: Number, default: null }, // solo para 'personalizada'
  },

  // Recordatorio (push + correo) — pedido explícito del usuario:
  // configurable POR ACTIVIDAD, no un solo criterio fijo para todas.
  // `reminderOffsetDays` = cuántos días ANTES de dueDate se manda el
  // aviso (0 = el mismo día). El envío real (push/correo) vive en una
  // fase aparte (requiere un cron de verdad en el servidor, este proyecto
  // no tenía uno para esto) — este campo ya queda listo desde ahora para
  // no tener que migrar datos después.
  reminderOffsetDays: { type: Number, default: 0 },
  // Para no mandar el mismo recordatorio 2 veces cuando el cron corra
  // varias veces al día — se compara contra la ocurrencia vigente de
  // dueDate (se limpia solo cuando dueDate avanza por recurrencia).
  lastReminderSentAt: { type: Date, default: null },

  createdByName:   { type: String, default: '' },
  completedAt:     { type: Date, default: null },
  completedByName: { type: String, default: '' },

  // Reporte semanal del becario (2026-08-19, pedido explícito del
  // usuario) — vive DENTRO de esta actividad recurrente en vez de ser un
  // documento aparte: cada viernes esta misma tarjeta ES el reporte. El
  // becario asignado (ver `assignedTo` arriba) llena resumen/otras
  // actividades/cursos/autoevaluación; Miguel (único validador, mismo
  // criterio "una sola persona" que ya usa `isVentasUser` en tickets.js)
  // llena la evaluación y valida — validar = completar: dispara el mismo
  // re-agendado automático de `PUT /:id/complete` para la semana
  // siguiente (ver routes/calendarActivities.js).
  //
  // Las secciones de "Tickets atendidos" e "Indicadores de la semana" NO
  // se llenan a mano — se calculan solas a partir de los tickets reales
  // asignados al becario esa semana (ver computeReportMetrics() en el
  // router) — pedido explícito del usuario tras preguntar "¿se llena solo
  // o cómo?".
  //
  // `reportHistory` guarda cada semana ya validada ANTES de resetear
  // `report` para la siguiente — a propósito, distinto del resto de
  // actividades recurrentes (que sí pierden el historial al completarse,
  // ver comentario de `recurrence` arriba): aquí el usuario necesita
  // poder ver varias semanas seguidas para juzgar mejora de desempeño
  // real, no solo la semana vigente.
  reportType: { type: String, enum: ['ninguno', 'becario_semanal'], default: 'ninguno' },
  report: {
    estado: { type: String, enum: ['pendiente', 'llenado', 'validado'], default: 'pendiente' },
    resumenSemana: { type: String, default: '' },
    otrasActividades: [{
      actividad: String, fecha: Date, ubicacion: String, tipo: String,
      evidencia: { type: Boolean, default: false }, observaciones: String,
    }],
    cursos: [{ curso: String, avance: Number, horas: Number, comentarios: String }],
    autoevaluacion: {
      logros:       { type: String, default: '' },
      dificultades: { type: String, default: '' },
      plan:         { type: String, default: '' },
    },
    enviadoAt:      { type: Date, default: null },
    enviadoPorName: { type: String, default: '' },
    evaluacionSupervisor: {
      criterios: [{ criterio: String, calificacion: Number, observaciones: String }],
      semaforo: { type: String, enum: ['', 'verde', 'amarillo', 'rojo'], default: '' },
      comentarioGeneral: { type: String, default: '' },
    },
    validadoAt:      { type: Date, default: null },
    validadoPorName: { type: String, default: '' },
  },
  reportHistory: [{
    weekOf: Date,
    resumenSemana: String,
    otrasActividades: [{
      actividad: String, fecha: Date, ubicacion: String, tipo: String,
      evidencia: Boolean, observaciones: String,
    }],
    cursos: [{ curso: String, avance: Number, horas: Number, comentarios: String }],
    autoevaluacion: { logros: String, dificultades: String, plan: String },
    // Snapshot congelado de los indicadores calculados al momento de
    // validar — no se recalcula después, para que el histórico no cambie
    // si un ticket viejo se vuelve a tocar más adelante.
    metrics: mongoose.Schema.Types.Mixed,
    evaluacionSupervisor: {
      criterios: [{ criterio: String, calificacion: Number, observaciones: String }],
      semaforo: String,
      comentarioGeneral: String,
    },
    enviadoAt: Date,
    enviadoPorName: String,
    validadoAt: Date,
    validadoPorName: String,
  }],
}, { timestamps: true });

module.exports = mongoose.model('CalendarActivity', calendarActivitySchema);
