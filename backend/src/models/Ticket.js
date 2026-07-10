const mongoose = require('mongoose');
const crypto = require('crypto');

// Sistema de tickets de soporte — se levanta desde una página pública (sin
// login, ver frontend/src/pages/ReportarTicket.jsx), igual que Solicitud de
// Cuentas/Ingreso/Recursos. La diferencia clave (pedida explícitamente): el
// ticket se liga al ACTIVO específico (por su serie/etiqueta), no a la
// persona — porque a quién esté asignado ese equipo puede cambiar, pero el
// historial de problemas de esa máquina física debe seguir junto a ella.
// Por eso `assetRef` es lo que cuenta para "cuántos tickets tiene este
// activo", y `employeeRef`/`employeeName` son solo quién lo reportó.
const TICKET_TYPES = ['hardware', 'software', 'red', 'cuenta_acceso', 'otro'];
const TICKET_TYPE_LABELS = {
  hardware: 'Hardware', software: 'Software', red: 'Red / Conectividad',
  cuenta_acceso: 'Cuenta / Acceso', otro: 'Otro',
};

const ticketSchema = new mongoose.Schema({
  folio: { type: String, required: true, unique: true, default: () => `TICK-${crypto.randomBytes(3).toString('hex').toUpperCase()}` },

  // Quién reporta — si su nombre coincide con un Empleado real (ver
  // /employees/public-lookup) se guarda employeeRef, pero se acepta el
  // nombre tal cual si no hay match (ej. alguien muy nuevo que RH aún no
  // ha dado de alta) — nunca se bloquea el reporte por esto.
  employeeName: { type: String, required: true },
  employeeRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  // El activo específico sobre el que es el ticket — elegido de lo que el
  // empleado tenía asignado AL MOMENTO de reportar (snapshot implícito: si
  // después se reasigna el activo a otra persona, este ticket sigue
  // apuntando al mismo activo). Puede quedar vacío si el ticket no es sobre
  // un equipo en particular (ej. una cuenta/acceso).
  assetRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' },

  ticketType:  { type: String, enum: TICKET_TYPES, required: true },
  subject:     { type: String, required: true },
  description: { type: String, default: '' },
  blocksWork:  { type: Boolean, default: false }, // "¿te impide trabajar?" — lo marca quien reporta, no una escala de prioridad que nadie llena bien

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

  assignedTo:      { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  assignedByName:  { type: String, default: '' }, // quién quedó a cargo (nombre, para no tener que popular siempre)
  assignedAt:      { type: Date },

  // Al resolver: se elige de un catálogo que crece con el tiempo (ver
  // TicketResolutionOption), + notas libres opcionales.
  resolution:      { type: String, default: '' },
  resolutionNotes: { type: String, default: '' },
  resolvedByName:  { type: String, default: '' },
  resolvedAt:      { type: Date },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', ticketSchema);
Ticket.TICKET_TYPES = TICKET_TYPES;
Ticket.TICKET_TYPE_LABELS = TICKET_TYPE_LABELS;

module.exports = Ticket;
