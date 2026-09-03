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
// 'hardware'/'software'/'red' (genéricos) se dejan en el enum SOLO por los
// tickets viejos que ya existen con ese tipo — pedido explícito del
// usuario: separar cada uno entre Computadoras y Celulares (más
// "Accesorios" aparte, ver ReportarTicket.jsx) para no tener que preguntar
// "¿sobre cuál de tus equipos es esto?" cuando el botón ya lo dice. El
// wizard de Reportar Ticket ya NO ofrece los genéricos — solo los nuevos.
const TICKET_TYPES = [
  'hardware', 'software', 'red', // heredados, solo para tickets ya creados
  'hardware_pc', 'hardware_celular', 'accesorio',
  'software_pc', 'software_celular',
  'red_pc', 'red_celular',
  // 'reporte_erp' (2026-08-10) — pedido explícito de ERP: sus solicitudes de
  // reporte "los tiempos los afectan" y querían el mismo trato que
  // "Proyecto" de BI (etapas Recibido→Entregado, tablero propio) en vez de
  // un ticket plano de subject/descripción — ver erpReportData/erpStage
  // abajo, mismo patrón que biProjectData/biStage pero sin las ~30
  // preguntas de BI (ese formulario replica un Word que ya existía; ERP no
  // tiene uno, así que el formulario es corto: nombre, módulo, datos,
  // uso, fecha límite). Tipo propio (no un appRef más), mismo criterio que
  // 'erp': se enruta SOLO a lider.erp/analista.erp — ver isErpOnlyUser()/
  // canViewTicket() en routes/tickets.js (ambos ya tratan 'reporte_erp'
  // igual que 'erp' para visibilidad/gestión).
  'aplicacion', 'impresora', 'cuenta_acceso', 'seguridad', 'erp', 'reporte_erp', 'soporte_bi', 'otro',
];
const TICKET_TYPE_LABELS = {
  hardware: 'Hardware', software: 'Software', red: 'Red / Conectividad', // heredados
  hardware_pc: 'Hardware Computadoras', hardware_celular: 'Hardware Celulares', accesorio: 'Accesorios',
  software_pc: 'Software Computadoras', software_celular: 'Software Celulares',
  red_pc: 'Red Computadoras', red_celular: 'Red Celulares',
  aplicacion: 'Aplicaciones',
  impresora: 'Impresoras', cuenta_acceso: 'Cuenta / Acceso', seguridad: 'Seguridad', erp: 'ERP',
  reporte_erp: 'Reporte ERP',
  soporte_bi: 'Soporte BI', otro: 'Otro',
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
  // Agregada junto con el tipo de ticket "Soporte BI" — ni una falla ni una
  // urgencia (es pedir un proyecto de análisis o una base de datos), así
  // que se clasifica como una solicitud de bajo nivel, con más margen de
  // resolución que un problema real (1 día hábil).
  { category: 'Soporte BI',                      level: 1, priority: 'media',   tRespuestaMin: 60,  tResolucionMin: 1440 },
];

// Matriz de SLA con Proveedor (Matriz_SLA_Con_Proveedor.pdf, aportada por
// el usuario 2026-08-04) — mismas 12 categorías de SLA_CATALOG de arriba
// (excepto "Soporte BI", que nunca se escala a un proveedor externo), pero
// con los tiempos que aplican UNA VEZ que el ticket se transfiere a un
// tercero. Regla explícita del propio documento: "Al transferir el ticket
// al proveedor, el SLA interno se congela y se activa el tiempo de
// respuesta/resolución del Contrato Subyacente (UC)" — por eso se aplica
// como un catálogo APARTE (`providerSlaLabel`/`providerSlaDueAt` en el
// ticket), no reemplazando `slaCategory`/`resolutionDueAt` internos, y por
// eso `tResolucionProveedorMin` cuenta desde el momento de ESCALAR
// (`escalatedAt`), no desde `createdAt` como el SLA interno. Se usa el
// límite SUPERIOR de cada rango del documento (ej. "24-48 hrs" → 2880 min)
// como el tiempo máximo, igual criterio que `tResolucionMin` de arriba.
// `tResolucionProveedorMin: null` = "N/A (Resuelto Internamente)" — esa
// categoría, según el propio documento, nunca debería llegar a escalarse a
// un proveedor real; se deja aquí solo para que el label se muestre
// completo si de todos modos se llegara a escalar.
const PROVIDER_SLA_CATALOG = [
  { category: 'Cuentas y Accesos',              tMaxEscalarMin: 15, tResolucionProveedorMin: null, label: 'N/A (Resuelto internamente)' },
  { category: 'Ofimática y Archivos',            tMaxEscalarMin: 30, tResolucionProveedorMin: 1440, label: '24 hrs (Soporte Microsoft / Cloud)' },
  { category: 'Periféricos',                     tMaxEscalarMin: 45, tResolucionProveedorMin: 2880, label: '24-48 hrs (Proveedor / Garantía)' },
  { category: 'Software y Sistema Operativo',    tMaxEscalarMin: 60, tResolucionProveedorMin: 1440, label: '24 hrs (Soporte de Marca / Licencias)' },
  { category: 'Red Local (Usuario)',             tMaxEscalarMin: 60, tResolucionProveedorMin: 1440, label: '12-24 hrs (Proveedor Cableado / Red)' },
  { category: 'Cuentas Críticas / ERP-SAE',      tMaxEscalarMin: 30, tResolucionProveedorMin: 480,  label: '4-8 hrs (Soporte Aspel / ERP)' },
  { category: 'Hardware Local',                  tMaxEscalarMin: 60, tResolucionProveedorMin: 2880, label: '24-48 hrs (Garantía Hardware / Marcas)*' },
  { category: 'Infraestructura Local',           tMaxEscalarMin: 30, tResolucionProveedorMin: 720,  label: '8-12 hrs (Proveedor Infraestructura)' },
  { category: 'Sistemas de CCTV',                tMaxEscalarMin: 30, tResolucionProveedorMin: 2880, label: '24-48 hrs (Soporte Fabricante / Dahua)' },
  { category: 'Servidores y Core',               tMaxEscalarMin: 15, tResolucionProveedorMin: 240,  label: '4 hrs (ISP / Enlace Dedicado)' },
  { category: 'Incidentes de Seguridad',         tMaxEscalarMin: 15, tResolucionProveedorMin: 480,  label: '4-8 hrs (Partner Ciberseguridad)' },
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

  // Borrar mensaje (2026-08-13, pedido explícito del usuario: "déjame
  // eliminar mensajes, luego nos equivocamos") — borrado suave: se limpia
  // el texto/adjunto real (no queda recuperable por API), pero se deja el
  // rastro de que algo se borró — el frontend muestra "🗑️ Mensaje
  // eliminado" en su lugar en vez de romper la conversación (ver DELETE
  // /:id/messages/:messageId en routes/tickets.js).
  deleted:        { type: Boolean, default: false },
  deletedAt:      { type: Date },
  deletedByName:  { type: String, default: '' },
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
  text:       { type: String, default: '' }, // puede venir vacío si la nota es solo una imagen/video

  // Adjunto (imagen o video) — pedido explícito del usuario (2026-07-24).
  // A diferencia de los demás adjuntos del proyecto, este NO se guarda como
  // Buffer aquí embebido: vive en GridFS (colección aparte, ver
  // utils/gridfs.js) porque un video fácilmente rebasa el límite de 16MB
  // por documento de MongoDB, que aplicaría a este Ticket completo si se
  // guardara embebido. `attachmentId` es el id del archivo en GridFS, no
  // el archivo en sí.
  attachmentId:       { type: mongoose.Schema.Types.ObjectId },
  attachmentMimeType: { type: String, default: '' },
  attachmentFileName: { type: String, default: '' },
}, { timestamps: { createdAt: true, updatedAt: false } });

// Bitácora PÚBLICA — pedido explícito del usuario (2026-08-03), pensada
// para el seguimiento de un ticket escalado a Proveedor: mismo molde exacto
// que `internalNoteSchema` de arriba (texto + adjunto opcional en GridFS),
// pero esta SÍ la ve el empleado (solo lectura de su lado, ver GET /mine y
// POST /:id/public-notes en routes/tickets.js) — para contarle "vamos así"
// sin exponer facturas/tickets del proveedor, que van en `internalNotes`.
const publicNoteSchema = internalNoteSchema;

const ticketSchema = new mongoose.Schema({
  folio: { type: String, required: true, unique: true, default: () => `TICK-${crypto.randomBytes(3).toString('hex').toUpperCase()}` },

  // Quién reporta — si su nombre coincide con un Empleado real (ver
  // /employees/public-lookup) se guarda employeeRef, pero se acepta el
  // nombre tal cual si no hay match (ej. alguien muy nuevo que RH aún no
  // ha dado de alta) — nunca se bloquea el reporte por esto.
  employeeName: { type: String, required: true },
  employeeRef:  { type: mongoose.Schema.Types.ObjectId, ref: 'Employee' },

  // Solo cuando quien reporta usa una cuenta de USO MÚLTIPLE (ej. "Auxiliar
  // Devoluciones" en una tablet compartida por varias personas, ver
  // Employee.isSharedAccount) — pedido explícito del usuario (2026-07-24):
  // sin esto, TODOS los tickets de la tablet se ven como reportados por la
  // misma cuenta, sin forma de saber cuál de las varias personas de verdad
  // necesita ayuda con ESTE ticket. Se pide como paso obligatorio al
  // empezar "Reportar un problema" (ver ReportarTicket.jsx) y se muestra en
  // el panel de Sistemas junto al nombre de la cuenta compartida.
  sharedAccountReporterName: { type: String, default: '' },

  // Activo(s) sobre los que es el ticket — TODO lo que el empleado tenía
  // asignado activo al momento de reportar (snapshot implícito: si después
  // se reasigna a otra persona, este ticket sigue apuntando al mismo
  // activo). Vacío si no se pudo emparejar el nombre con ningún Empleado.
  assetRefs: { type: [mongoose.Schema.Types.ObjectId], ref: 'Asset', default: [] },

  ticketType:      { type: String, enum: TICKET_TYPES, required: true },
  otherTypeDetail: { type: String, default: '' }, // qué es, si ticketType === 'otro'
  // Sistema ERP afectado (sugerencia #26, matriz de pruebas de Felipe,
  // 2026-08-20) — obligatorio si ticketType === 'erp'. Catálogo cerrado
  // (backend/src/config/erpSystems.js), mismo criterio que ya usa
  // Solicitud de Cuenta ERP.
  erpSystem: { type: String, default: '' },

  // Reclasificación de Sistemas cuando el ticket se reportó en la categoría
  // equivocada — pedido explícito y urgente del usuario (2026-07-27):
  // "quiero que el usuario aprenda a reportar", así que además de corregir
  // el tipo (ver PUT /:id/reassign-type), se deja rastro visible para que
  // el empleado vea en Mis Tickets que Sistemas lo reclasificó. Vacío/null
  // mientras nunca se haya reasignado.
  originalTicketType: { type: String, default: '' },
  reassignedByName:   { type: String, default: '' },
  reassignedAt:        { type: Date },

  // Si el ticket es sobre un aplicativo interno del catálogo (ver
  // InternalApp) — quien reporta lo elige de un selector opcional cuando
  // ticketType es 'software', para que Sistemas sepa a dónde enrutarlo
  // (ej. "Cuentas por Pagar" es de Héctor, no de Sistemas).
  appRef: { type: mongoose.Schema.Types.ObjectId, ref: 'InternalApp' },

  // A quién le corresponde de verdad este ticket — 'sistemas' (incluye
  // ERP/BI, lo de siempre) vs 'externo' (equipos genuinamente ajenos a
  // Sistemas, ej. Contabilidad/Pagos vía "Solicitud de Pagos" — ver
  // classifyTicketAudience() en routes/tickets.js, misma clasificación
  // que ya se usaba solo para decidir el correo). Pedido explícito del
  // usuario (2026-07-28): Sistemas no tiene acceso a esas plataformas, así
  // que del lado del empleado esto no debe verse como "un ticket" (algo
  // que Sistemas resuelve) sino como "una solicitud" — se excluye de Mis
  // Tickets y se muestra en Mis Solicitudes en su lugar (mismo criterio ya
  // usado para Soporte BI, ver GET /mine y /mine/external-requests).
  requestAudience: { type: String, enum: ['sistemas', 'externo'], default: 'sistemas' },

  subject:     { type: String, required: true },
  description: { type: String, default: '' },

  // Solo para los 2 problemas de "Alta de Proveedores" (Solicitud de Pagos)
  // marcados con `providerFields: true` en ticketCategories.js — pedido
  // explícito del equipo de Pagos (2026-07-22): en vez de dejar estos datos
  // sueltos en la descripción, se piden como campos estructurados. La CSF
  // (Constancia de Situación Fiscal) reusa el adjunto genérico de siempre
  // (attachmentData de abajo), solo que se vuelve obligatorio y cambia de
  // etiqueta en el formulario cuando aplica. `bankProofData` es un SEGUNDO
  // adjunto aparte (ej. carátula bancaria/estado de cuenta) — comprobante
  // de los `providerBankDetails` de arriba, también obligatorio para estos
  // 2 problemas.
  providerName:        { type: String, default: '' },
  providerEmail:       { type: String, default: '' },
  providerPhone:       { type: String, default: '' },
  providerBankDetails: { type: String, default: '' },
  bankProofData:       { type: Buffer },
  bankProofMimeType:   { type: String, default: '' },
  bankProofFileName:   { type: String, default: '' },
  // Solo para ticketType === 'soporte_bi' — cuál de las 3 opciones del
  // módulo se pidió. 'proyecto' llena `biProjectData` (las ~30 respuestas
  // del formulario "Solicitud de Proyecto", una réplica exacta del .docx
  // que ya usa BI, ver utils/biProjectDocx.js) + el documento generado
  // (biDocData); 'bases_datos' llena `biDatabaseRequest` (tipo/plataforma/
  // tienda/periodo) — sin documento (quitado 2026-07-23, pedido explícito
  // del usuario: "es muy poquita información para un PDF" — el detalle
  // completo va directo en el cuerpo del correo, ver
  // buildTicketNotificationEmail en utils/emailTemplates.js). 'soporte'
  // (2026-07-30, caso real: Jonathan Ovadia pidiendo ayuda con Excel sin
  // saber que existía Soporte BI) es soporte puntual sin formulario —
  // usa `subject`/`description` normales, como cualquier ticket, y NO usa
  // `biStage` (se resuelve con el status genérico de siempre).
  biRequestKind: { type: String, enum: ['proyecto', 'bases_datos', 'soporte'] },
  biProjectData: { type: mongoose.Schema.Types.Mixed },
  biDatabaseRequest: { type: mongoose.Schema.Types.Mixed },
  // biProjectRef (2026-08-12) — pedido explícito de BI (Iván Ramirez):
  // "¿puedo reasignar una base de datos a un proyecto?". Vincula una
  // Solicitud de Bases de Datos con un Proyecto YA EXISTENTE sin fusionar
  // ambas solicitudes — cada una conserva su propio flujo (aprobar/
  // rechazar/entregar para BD, Kanban de etapas para Proyecto). Solo tiene
  // sentido cuando biRequestKind === 'bases_datos', apuntando a otro
  // Ticket con biRequestKind === 'proyecto' (ver PUT /:id/bi-link-project
  // en routes/tickets.js). Distinto de convertir de tipo (PUT
  // /:id/bi-convert-to-project), que sí cambia el `biRequestKind` mismo.
  biProjectRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Ticket', default: null },
  // Documento Word ya rellenado (Solicitud de Proyecto) — mismo patrón que
  // el resto de adjuntos de este modelo: el binario vive en Mongo, no en
  // disco (Render no persiste el filesystem entre despliegues).
  biDocData:     { type: Buffer },
  biDocMimeType: { type: String, default: '' },
  biDocFileName: { type: String, default: '' },
  // Enlace al reporte publicado en la web (Power BI) — pedido explícito de
  // BI (Ivan Ramirez, 2026-08-10): el entregable real de "proyecto" no es
  // un archivo (a diferencia de bases_datos) sino la URL publicada del
  // reporte. Mismo criterio que biDeliverableId: no se puede marcar
  // "entregado" sin esto (ver PUT /:id/bi-stage).
  biPublishedUrl: { type: String, default: '' },
  // Etapa de trabajo de BI — pedido explícito del usuario (2026-07-30):
  // "gestionar cómo lo resuelve BI", con etapas propias en vez del
  // status genérico abierto/en_proceso/resuelto/cerrado (que sigue
  // existiendo en paralelo). Al llegar a 'entregado' se marca también
  // status: 'resuelto' (ver PUT /:id/bi-stage en routes/tickets.js) —
  // mismo patrón de metadatos que resolvedAt/resolvedByName.
  biStage: {
    type: String,
    enum: ['recibido', 'en_definicion', 'en_desarrollo', 'en_revision', 'entregado'],
    default: 'recibido',
  },
  biStageUpdatedAt:     { type: Date },
  biStageUpdatedByName: { type: String, default: '' },

  // Etiquetas y comentarios estilo Trello — pedido explícito del usuario
  // (2026-08-04), SOLO para biRequestKind === 'proyecto' (Bases de Datos
  // se queda igual): "no me gusta que las observaciones se hagan en el
  // chat... las anotaciones las necesito como en Trello, tarjetas,
  // etiquetas, y dentro de esas tarjetas comentarios". El chat con quien
  // reportó (`messages`) sigue existiendo aparte para coordinar — esto es
  // el seguimiento de trabajo interno de BI, no una conversación.
  // `projectLabelIds` referencia el catálogo reutilizable (ver
  // ProjectLabel.js) — mismo catálogo compartido entre todas las
  // tarjetas, como las etiquetas reales de Trello (crear una vez, asignar
  // a cualquier tarjeta).
  projectLabelIds: { type: [mongoose.Schema.Types.ObjectId], ref: 'ProjectLabel', default: [] },
  projectComments: {
    type: [{
      authorName: { type: String, required: true },
      text:       { type: String, required: true },
      createdAt:  { type: Date, default: Date.now },
    }],
    default: [],
  },

  // Base de datos entregada de verdad (Excel/CSV/PDF) — pedido explícito
  // del usuario (2026-07-30): "que cuando abran el ticket ahí esté la
  // BD". Solo para biRequestKind === 'bases_datos'. A diferencia de TODOS
  // los demás adjuntos de este modelo (Buffer embebido), este vive en
  // GridFS (bucket 'biDeliverables', ver utils/gridfs.js) — un export
  // real de ventas/inventarios puede pesar más que el límite de 16MB por
  // documento de MongoDB, mismo motivo que ya llevó a los adjuntos de
  // Notas internas por ese camino.
  biDeliverableId:         { type: mongoose.Schema.Types.ObjectId },
  biDeliverableMimeType:   { type: String, default: '' },
  biDeliverableFileName:   { type: String, default: '' },
  biDeliveredAt:           { type: Date },
  biDeliveredByName:       { type: String, default: '' },

  // Aprobar/rechazar una solicitud de Bases de Datos antes de trabajarla —
  // pedido explícito del usuario (2026-07-31), mismo criterio que ya usan
  // Altas/Cuentas/Recursos (ver resourceRequests.js): el motivo de rechazo
  // NO es obligatorio en el servidor, mismo criterio que esas rutas. Solo
  // aplica a biRequestKind === 'bases_datos' (ver PUT /:id/bi-approve y
  // /:id/bi-reject en routes/tickets.js).
  biApprovedByName:  { type: String, default: '' },
  biApprovedAt:      { type: Date },
  biRejectionReason: { type: String, default: '' },
  biRejectedByName:  { type: String, default: '' },
  biRejectedAt:      { type: Date },

  // Reportes ERP (2026-08-10) — solo para ticketType === 'reporte_erp'.
  // Mismo patrón que biProjectData/biStage/biDeliverable de arriba, pero
  // sin las etapas de aprobación (eso es solo de bases_datos de BI) y sin
  // el sistema de etiquetas/comentarios estilo Trello (no se pidió aquí).
  erpReportData: { type: mongoose.Schema.Types.Mixed }, // { reportName, module, dataNeeded, purpose, deadline }
  erpStage: {
    type: String,
    enum: ['recibido', 'en_definicion', 'en_desarrollo', 'en_revision', 'entregado'],
    default: 'recibido',
  },
  erpStageUpdatedAt:     { type: Date },
  erpStageUpdatedByName: { type: String, default: '' },
  // Reporte entregado de verdad (Excel/CSV/PDF) — GridFS (bucket
  // 'erpDeliverables'), mismo motivo que biDeliverableId: puede pesar más
  // que el límite de 16MB por documento de MongoDB.
  erpDeliverableId:       { type: mongoose.Schema.Types.ObjectId },
  erpDeliverableMimeType: { type: String, default: '' },
  erpDeliverableFileName: { type: String, default: '' },
  erpDeliveredAt:         { type: Date },
  erpDeliveredByName:     { type: String, default: '' },

  // "¿te impide trabajar?" — YA NO lo marca quien reporta (se quitó el
  // checkbox del formulario): se deriva solo de la prioridad ('alta'/
  // 'critica' = sí) de la Categoría de Falla que le tocó al problema
  // elegido, ver applySlaCategory() en routes/tickets.js.
  blocksWork:  { type: Boolean, default: false },

  messages: { type: [ticketMessageSchema], default: [] },
  internalNotes: { type: [internalNoteSchema], default: [] },
  publicNotes:   { type: [publicNoteSchema], default: [] },

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
  // Tiempos personalizados, EXCLUSIVO de tickets ERP (2026-08-10) — pedido
  // explícito del usuario: "los tiempos establecidos les afectan, como
  // trabajan 100% con un proveedor externo son diferentes sus tiempos". A
  // diferencia del resto (que solo eligen una Categoría de Falla ya fija
  // del catálogo, ver PUT /:id/sla-category), ERP escribe directo la fecha
  // que les dio SU proveedor — no hay catálogo que le atine a eso. Mismos
  // campos responseDueAt/resolutionDueAt de arriba (todo lo que ya lee esos
  // campos —countdown, Indicadores, TicketsSLA— sigue funcionando igual),
  // solo se registra quién/cuándo los puso a mano (ver PUT
  // /:id/erp-sla-custom en routes/tickets.js).
  slaCustomByName: { type: String, default: '' },
  slaCustomAt:     { type: Date },

  // Autorización para cerrar por abandono (2026-08-13) — pedido explícito
  // del usuario: "muchas veces el usuario no contesta porque soy yo
  // trabajando... me gustaría que me pidas autorización para cerrar el
  // ticket". Reemplaza el cierre 100% automático de
  // autoCloseAbandonedOverdue() (routes/tickets.js): ya NO cierra solo,
  // solo marca el candidato — el cierre real lo confirma quien lo tiene
  // asignado (o el Gerente de Sistemas) vía PUT /:id/close-abandoned, o lo
  // rechaza extendiendo el tiempo vía PUT /:id/extend-sla.
  awaitingCloseAuthorization: { type: Boolean, default: false },
  awaitingCloseSince:         { type: Date },

  // Extensiones manuales de SLA (2026-08-13) — pedido explícito del
  // usuario: "déjame aumentarle el tiempo manualmente y pídeme una
  // justificación, para que esto se añada al SLA y se tome en cuenta" —
  // bitácora de cada vez que se movió `resolutionDueAt` a mano con su
  // motivo, para no perder el porqué de un ticket que en los reportes de
  // SLA "se ve" vencido cuando en realidad se esperaba al empleado.
  slaExtensions: {
    type: [{
      extendedByName:          { type: String, required: true },
      extendedAt:              { type: Date, default: Date.now },
      reason:                  { type: String, required: true },
      previousResolutionDueAt: { type: Date },
      newResolutionDueAt:      { type: Date, required: true },
    }],
    default: [],
  },

  // Extensión manual del SLA CON PROVEEDOR (2026-08-19, pedido explícito
  // del usuario) — mismo espíritu que slaExtensions de arriba, pero para
  // `providerSlaDueAt` en vez de `resolutionDueAt`: un ticket escalado a
  // proveedor externo puede vencer por algo que ya no es culpa ni de
  // Sistemas ni del proveedor (ej. un técnico de Lenovo revisó en
  // remoto y no quedó resuelto) — se necesita poder mover esa fecha con
  // justificación, sin tocar el SLA interno (que ya está congelado
  // mientras dure el escalamiento).
  providerSlaExtensions: {
    type: [{
      extendedByName:        { type: String, required: true },
      extendedAt:            { type: Date, default: Date.now },
      reason:                { type: String, required: true },
      previousProviderSlaDueAt: { type: Date },
      newProviderSlaDueAt:      { type: Date, required: true },
    }],
    default: [],
  },

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

  // Escalamiento — pedido explícito del usuario (2026-08-03): cadena fija
  // por rol (ver ESCALATION_CHAIN/getEscalationTargets en tickets.js), ya
  // no un simple toggle de "sí/no". `escalationType` distingue las 3
  // formas de escalar:
  //   'persona' — se reasigna (assignedTo) a un compañero/superior
  //               específico dentro del mismo equipo, ej. becario -> sistemas.3.
  //   'area'    — el caso no compete a esta área; el ticket queda SIN
  //               asignar y pasa a la cola de otra área (Sistemas/ERP/BI),
  //               ver `escalatedToArea` y canViewTicket().
  //   'proveedor' — versión ligera (pendiente el proceso completo de
  //               proveedores/garantías): solo queda una nota, sin cambiar
  //               asignación ni visibilidad.
  escalated:        { type: Boolean, default: false },
  escalationType:   { type: String, enum: ['persona', 'area', 'proveedor', ''], default: '' },
  // 'ventas' (2026-08-18) — bug real encontrado en producción el mismo día
  // que se agregó: el código ya ponía `escalatedToArea = 'ventas'` (ver
  // POST /mine y PUT /:id/reassign-type en routes/tickets.js) pero este
  // enum nunca se actualizó, así que CUALQUIER `.save()` posterior sobre
  // ese ticket (ej. Miguel respondiéndole al empleado) tronaba con
  // "Ticket validation failed: escalatedToArea: `ventas` is not a valid
  // enum value" — bloqueando la respuesta real a un empleado en espera.
  escalatedToArea:  { type: String, enum: ['sistemas', 'erp', 'bi', 'ventas', ''], default: '' },
  escalationReason: { type: String, default: '' },
  escalatedByName:  { type: String, default: '' },
  escalatedAt:      { type: Date, default: null },

  // Redirigir a Solicitud de Recursos (2026-08-07) — pedido explícito del
  // usuario: el empleado confunde qué es un ticket y qué es una Solicitud
  // de Recursos (ej. reporta como ticket algo que en realidad es "pedir
  // un recurso"). Un botón crea la Solicitud de Recursos equivalente y
  // deja esta marca — el ticket SIGUE funcionando normal (a diferencia del
  // escalamiento, esto NO bloquea el chat), es solo un aviso visual (ver
  // PUT /:id/redirect-to-resource-request).
  redirectedToResourceRequest: { type: mongoose.Schema.Types.ObjectId, ref: 'ResourceRequest', default: null },
  redirectReason:              { type: String, default: '' },
  redirectedByName:            { type: String, default: '' },
  redirectedAt:                { type: Date, default: null },

  // SLA con Proveedor — pedido explícito del usuario (2026-08-04): al
  // escalar a Proveedor, aplicar por default la matriz de
  // PROVIDER_SLA_CATALOG según la Categoría de Falla (`slaCategory`) que
  // ya tenga el ticket clasificada (ver PUT /:id/escalate). Vacío/null si
  // el ticket nunca se escaló a proveedor, o si no tenía `slaCategory`
  // clasificada al momento de escalar (nada de qué partir).
  providerSlaLabel: { type: String, default: '' },
  providerSlaDueAt: { type: Date, default: null },

  raw: { type: mongoose.Schema.Types.Mixed, default: {} },
}, { timestamps: true });

const Ticket = mongoose.model('Ticket', ticketSchema);
Ticket.TICKET_TYPES = TICKET_TYPES;
Ticket.TICKET_TYPE_LABELS = TICKET_TYPE_LABELS;
Ticket.SLA_CATALOG = SLA_CATALOG;
Ticket.PROVIDER_SLA_CATALOG = PROVIDER_SLA_CATALOG;

module.exports = Ticket;
