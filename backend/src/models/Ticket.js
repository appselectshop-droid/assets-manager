const mongoose = require('mongoose');
const crypto = require('crypto');

// Sistema de tickets de soporte — se levanta desde una página pública (sin
// login, ver frontend/src/pages/ReportarTicket.jsx), igual que Solicitud de
// Cuentas/Ingreso/Recursos. La diferencia clave (pedida explícitamente): el
// ticket se liga al/los ACTIVO(S) específico(s) (por su serie/etiqueta), no a
// la persona — porque a quién esté asignado ese equipo puede cambiar, pero el
// historial de problemas de esa máquina física debe seguir junto a ella.
// A pedido explícito del usuario, quien reporta NUNCA elige ni ve de qué
// equipo se trata — `assetRefs` se llena solo, en el backend, con TODO lo que
// el empleado (si se pudo emparejar por nombre) tenía asignado activo al
// momento de reportar (ver POST /public en routes/tickets.js). Si tiene un
// solo equipo, el ticket queda ligado a ese; si tiene varios, a todos —
// nunca se le pregunta cuál falla.
const TICKET_TYPES = ['hardware', 'software', 'red', 'cuenta_acceso', 'otro'];
const TICKET_TYPE_LABELS = {
  hardware: 'Hardware', software: 'Software', red: 'Red / Conectividad',
  cuenta_acceso: 'Cuenta / Acceso', otro: 'Otro',
};

// Conversación de ida y vuelta sobre el ticket (además del reporte inicial y
// de la resolución formal, que siguen siendo campos aparte — esto es el
// intercambio libre mientras se trabaja: el empleado puede dar seguimiento y
// Sistemas puede responder sin que eso signifique "resolver" todavía).
const ticketMessageSchema = new mongoose.Schema({
  from:       { type: String, enum: ['employee', 'admin'], required: true },
  authorName: { type: String, required: true },
  text:       { type: String, required: true },
}, { timestamps: { createdAt: true, updatedAt: false } });

const ticketSchema = new mongoose.Schema({
  folio: { type: String, required: true, unique: true, default: () => `TICK-${crypto.randomBytes(3).toString('hex').toUpperCase()}` },

  // Quién reporta — si su nombre coincide con un Empleado real (ver
  // /employees/public-lookup) se guarda employeeRef, pero se acepta el
  // nombre tal cual si no hay match (ej. alguien muy nuevo que RH aún no
  // ha dado de alta) — nunca se bloquea el reporte por esto.
  employeeName: { type: String, required: true },
  employeeRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  // Activo(s) sobre los que es el ticket — TODO lo que el empleado tenía
  // asignado activo al momento de reportar (snapshot implícito: si después
  // se reasigna a otra persona, este ticket sigue apuntando al mismo
  // activo). Vacío si no se pudo emparejar el nombre con ningún Empleado.
  assetRefs: { type: [mongoose.Schema.Types.ObjectId], ref: 'Asset', default: [] },

  ticketType:      { type: String, enum: TICKET_TYPES, required: true },
  otherTypeDetail: { type: String, default: '' }, // qué es, si ticketType === 'otro'

  // Si el ticket es sobre un aplicativo interno del catálogo (ver
  // InternalApp) — quien reporta lo elige de un selector opcional cuando
  // ticketType es 'software', para que Sistemas sepa a dónde enrutarlo
  // (ej. "Cuentas por Pagar" es de Héctor, no de Sistemas).
  appRef: { type: mongoose.Schema.Types.ObjectId, ref: 'InternalApp' },
  subject:     { type: String, required: true },
  description: { type: String, default: '' },
  blocksWork:  { type: Boolean, default: false }, // "¿te impide trabajar?" — lo marca quien reporta, no una escala de prioridad que nadie llena bien

  messages: { type: [ticketMessageSchema], default: [] },

  // Evidencia (foto/captura) — igual que ResponsivaArchive: se guarda el
  // binario en Mongo, no en disco (Render no persiste el filesystem entre
  // despliegues).
  attachmentData:     { type: Buffer },
  attachmentMimeType:  { type: String, default: '' },
  attachmentFileName:  { type: String, default: '' },

  status: { type: String, enum: ['abierto', 'en_proceso', 'resuelto', 'cerrado'], default: 'abierto' },

  // Prioridad la fija Sistemas al triage, no quien reporta (todos creen que
  // el suyo es urgente) — por default "media" hasta que alguien la ajuste.
  priority: { type: String, enum: ['baja', 'media', 'alta'], default: 'media' },

  // Severidad — clasificación aparte de `priority` (5 niveles, distinto uso:
  // "qué tan grave es" vs. "qué tan urgente de atender"), la fija Sistemas.
  // null hasta que alguien la clasifique ("Sin clasificar" en la UI).
  severity: { type: String, enum: ['Consulta', 'Baja', 'Media', 'Alta', 'Urgente'], default: null },

  assignedTo:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedByName:  { type: String, default: '' }, // quién quedó a cargo (nombre, para no tener que popular siempre)
  assignedAt:      { type: Date },

  // Al resolver: se elige de un catálogo que crece con el tiempo (ver
  // TicketResolutionOption), + notas libres opcionales.
  resolution:      { type: String, default: '' },
  resolutionNotes: { type: String, default: '' },
  resolvedByName:  { type: String, default: '' },
  resolvedAt:      { type: Date },

  // Encuesta de satisfacción (CSAT) — la responde quien reportó, solo cuando
  // el ticket ya está resuelto/cerrado (ver POST /:id/satisfaction). Se puede
  // volver a mandar para cambiar la respuesta, no queda historial de cambios.
  satisfactionRating: {
    type: String,
    enum: [
      'Extremadamente satisfecho', 'Mayormente satisfecho', 'Ni satisfecho ni insatisfecho',
      'Mayormente insatisfecho', 'Extremadamente insatisfecho',
    ],
    default: null,
  },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', ticketSchema);
Ticket.TICKET_TYPES = TICKET_TYPES;
Ticket.TICKET_TYPE_LABELS = TICKET_TYPE_LABELS;

module.exports = Ticket;
