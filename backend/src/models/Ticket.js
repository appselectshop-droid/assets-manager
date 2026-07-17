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
// 'erp' es su propio tipo (no un appRef más) a propósito: pedido explícito de
// que los tickets de ERP se enruten SOLO a lider.erp/analista.erp desde que
// nacen, sin que el resto de Sistemas los vea nunca — ver isErpOnlyUser() y
// canViewTicket() en routes/tickets.js.
const TICKET_TYPES = ['hardware', 'software', 'aplicacion', 'red', 'cuenta_acceso', 'seguridad', 'erp', 'otro'];
const TICKET_TYPE_LABELS = {
  hardware: 'Hardware', software: 'Software', aplicacion: 'Aplicaciones', red: 'Red / Conectividad',
  cuenta_acceso: 'Cuenta / Acceso', seguridad: 'Seguridad', erp: 'ERP', otro: 'Otro',
};

// Matriz oficial de Niveles de Servicio (SLA) de Grupo Select Shop — la
// clasifica Sistemas al triage (no quien reporta, que solo elige el
// `ticketType` genérico de arriba). Cada categoría tiene EXACTAMENTE un
// nivel/prioridad/tiempos, así que elegirla rellena todo lo demás sola (ver
// PUT /:id/sla-category en routes/tickets.js). tRespuestaMin/tResolucionMin
// están en minutos, para calcular responseDueAt/resolutionDueAt desde
// `createdAt` (el reloj del SLA corre desde que se reportó, no desde que se
// clasificó).
const SLA_CATALOG = [
  { category: 'Cuentas y Accesos',              level: 1, priority: 'baja',    tRespuestaMin: 15,  tResolucionMin: 30 },
  { category: 'Ofimática y Archivos',            level: 1, priority: 'baja',    tRespuestaMin: 15,  tResolucionMin: 60 },
  { category: 'Periféricos',                     level: 1, priority: 'media',   tRespuestaMin: 30,  tResolucionMin: 120 },
  { category: 'Software y Sistema Operativo',    level: 2, priority: 'media',   tRespuestaMin: 60,  tResolucionMin: 480 },
  { category: 'Red Local (Usuario)',             level: 2, priority: 'media',   tRespuestaMin: 60,  tResolucionMin: 240 },
  { category: 'Cuentas Críticas / ERP-SAE',      level: 2, priority: 'alta',    tRespuestaMin: 30,  tResolucionMin: 120 },
  { category: 'Hardware Local',                  level: 2, priority: 'alta',    tRespuestaMin: 60,  tResolucionMin: 1440 },
  { category: 'Infraestructura Local',           level: 3, priority: 'alta',    tRespuestaMin: 30,  tResolucionMin: 240 },
  { category: 'Sistemas de CCTV',                level: 3, priority: 'alta',    tRespuestaMin: 30,  tResolucionMin: 240 },
  // Agregada junto con el tipo de ticket "Seguridad" (phishing, cuenta
  // comprometida) — ninguna de las categorías de arriba le quedaba bien, y
  // un incidente de este tipo no puede esperar como un ticket normal.
  { category: 'Incidentes de Seguridad',         level: 3, priority: 'critica', tRespuestaMin: 15,  tResolucionMin: 120 },
  { category: 'Servidores y Core',               level: 3, priority: 'critica', tRespuestaMin: 15,  tResolucionMin: 120 },
];

// Conversación de ida y vuelta sobre el ticket (además del reporte inicial y
// de la resolución formal, que siguen siendo campos aparte — esto es el
// intercambio libre mientras se trabaja: el empleado puede dar seguimiento y
// Sistemas puede responder sin que eso signifique "resolver" todavía).
const ticketMessageSchema = new mongoose.Schema({
  from:       { type: String, enum: ['employee', 'admin'], required: true },
  authorName: { type: String, required: true },
  text:       { type: String, default: '' }, // puede venir vacío si el mensaje es solo una imagen

  // Imagen adjunta al mensaje (ej. captura de un error) — mismo patrón que
  // el adjunto del reporte inicial (attachmentData de más abajo): el
  // binario se guarda en Mongo, no en disco.
  attachmentData:     { type: Buffer },
  attachmentMimeType:  { type: String, default: '' },
  attachmentFileName:  { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Bitácora técnica interna — pedido explícito del usuario, tomado de un
// trabajo anterior: separado de `messages` (que sí ve quien reportó) para
// poder anotar cómo se resolvió de verdad (qué se tocó, a dónde se entró,
// etc.) sin exponerlo al empleado, y para que ese conocimiento quede buscable
// en tickets futuros con un problema parecido. NUNCA se manda a las rutas
// del lado empleado (ver GET /mine, POST /:id/messages, /close,
// /satisfaction en routes/tickets.js) — solo lo ve el equipo de Sistemas.
const internalNoteSchema = new mongoose.Schema({
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
  internalNotes: { type: [internalNoteSchema], default: [] },

  // Evidencia (foto/captura) — igual que ResponsivaArchive: se guarda el
  // binario en Mongo, no en disco (Render no persiste el filesystem entre
  // despliegues).
  attachmentData:     { type: Buffer },
  attachmentMimeType:  { type: String, default: '' },
  attachmentFileName:  { type: String, default: '' },

  status: { type: String, enum: ['abierto', 'en_proceso', 'resuelto', 'cerrado'], default: 'abierto' },

  // Prioridad la fija Sistemas al triage, no quien reporta (todos creen que
  // el suyo es urgente) — por default "media" hasta que alguien la ajuste.
  // "critica" (P1) se agregó junto con el SLA_CATALOG de arriba.
  priority: { type: String, enum: ['baja', 'media', 'alta', 'critica'], default: 'media' },

  // Nivel de Servicio (SLA) — se llena de un jalón al elegir la Categoría de
  // Falla (ver SLA_CATALOG arriba y PUT /:id/sla-category), reemplaza al
  // antiguo campo `severity`. null hasta que Sistemas lo clasifique ("Sin
  // clasificar" en la UI).
  slaCategory: { type: String, enum: SLA_CATALOG.map((r) => r.category), default: null },
  slaLevel:    { type: Number, enum: [1, 2, 3], default: null },
  responseDueAt:   { type: Date, default: null },
  resolutionDueAt: { type: Date, default: null },

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
Ticket.SLA_CATALOG = SLA_CATALOG;

module.exports = Ticket;
