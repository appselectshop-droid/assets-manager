const Ticket = require('../models/Ticket');
const { addBusinessMinutes } = require('./businessHours');

// Aplica sobre un ticket ya existente los campos que derivan de una
// Categoría de Falla (SLA): nivel, prioridad y fechas límite (el reloj corre
// desde `createdAt`, no desde que se clasificó). Antes vivía duplicado
// dentro de routes/tickets.js — se movió aquí (2026-08-14) para que
// resourceRequests.js también lo pueda usar (tickets de instalación
// auto-generados al aprobar "Software o Licencia", y los redirigidos desde
// Solicitud de Recursos), sin repetir la lógica.
// `blocksWork` se deriva de la prioridad de la Categoría de Falla elegida:
// 'alta'/'critica' SÍ bloquean, 'baja'/'media' no.
const BLOCKING_PRIORITIES = ['alta', 'critica'];

function applySlaCategory(ticket, slaCategory) {
  if (slaCategory === null || slaCategory === undefined) {
    ticket.slaCategory = null;
    ticket.slaLevel = null;
    ticket.responseDueAt = null;
    ticket.resolutionDueAt = null;
    return true;
  }
  const row = Ticket.SLA_CATALOG.find((r) => r.category === slaCategory);
  if (!row) return false;
  ticket.slaCategory = row.category;
  ticket.slaLevel = row.level;
  ticket.priority = row.priority;
  ticket.blocksWork = BLOCKING_PRIORITIES.includes(row.priority);
  // BUG-10 (matriz de Felipe, 2026-08-20; reglas reales confirmadas con el
  // usuario 2026-09-01): los minutos del catálogo son tiempo HÁBIL, no
  // corrido — horario de Sistemas 8:00-19:00, lunes a viernes (festivos NO
  // se excluyen por ahora). Si `createdAt` cae fuera de jornada (noche, fin
  // de semana), el conteo arranca hasta el siguiente inicio hábil — ver
  // addBusinessMinutes().
  ticket.responseDueAt = addBusinessMinutes(ticket.createdAt, row.tRespuestaMin);
  // BUG-09 (matriz de pruebas de Felipe, 2026-08-20): el "Tiempo de
  // resolución" NO debe nacer junto con el de respuesta — mientras el
  // ticket sigue 'abierto' todavía no lo está atendiendo nadie. Se calcula
  // aparte, en el momento real en que pasa a 'en_proceso' (ver
  // assignResolutionDueAt() más abajo, llamada desde los puntos donde el
  // ticket se toma/asigna en tickets.js) — mismo criterio que ya existía
  // para `providerSlaDueAt` (se calcula al escalar a proveedor, no al
  // crear el ticket). Si `status` todavía no está definido (se llama antes
  // de que Mongoose aplique sus defaults) se trata igual que 'abierto'.
  ticket.resolutionDueAt = (ticket.status && ticket.status !== 'abierto')
    ? addBusinessMinutes(ticket.createdAt, row.tResolucionMin)
    : null;
  return true;
}

// Calcula `resolutionDueAt` en el momento en que un ticket pasa de 'abierto'
// a 'en_proceso' (se toma/asigna) — separado de applySlaCategory() porque
// esa corre en la creación, cuando el ticket no debe tener todavía "Tiempo
// de resolución" (ver BUG-09 arriba). No hace nada si el ticket sigue sin
// `slaCategory` (todavía sin clasificar — se calculará solo hasta que
// alguien lo clasifique, igual que hoy) ni si ya tiene `resolutionDueAt`
// (no lo recalcula/pisa en una segunda toma, ej. reasignación).
function assignResolutionDueAt(ticket) {
  if (!ticket.slaCategory || ticket.resolutionDueAt) return;
  const row = Ticket.SLA_CATALOG.find((r) => r.category === ticket.slaCategory);
  if (!row) return;
  // BUG-10: mismo horario laboral que applySlaCategory() de arriba.
  ticket.resolutionDueAt = addBusinessMinutes(ticket.createdAt, row.tResolucionMin);
}

// Clasificación automática por palabras clave en el TEXTO LIBRE (asunto +
// descripción) — pedido explícito del usuario (2026-08-14): "que lea no
// solo el asunto, sino la descripción y ya lo clasifique automáticamente...
// porque entonces para qué existe el automático si yo lo hago a mano".
//
// Antes, lo "automático" SOLO pasaba cuando quien reportó eligió un
// problema específico del catálogo con `sla` ya fijo (ver
// frontend/src/config/ticketCategories.js) — "Otro", "Aplicaciones" y
// cualquier ticket creado por otra ruta (ej. redirigido desde Solicitud de
// Recursos, o el de instalación auto-generado al aprobar "Software o
// Licencia") se quedaban siempre sin clasificar. Esto corre como
// COMPLEMENTO (nunca pisa un slaHint que ya funcionó) cuando ese hint no
// resolvió nada — mismo criterio de palabras clave a mano que ya usa el
// buscador de Mesa de Ayuda (sin IA de por medio, ver memoria del
// proyecto), no una lista exhaustiva de todos los casos posibles: se puede
// seguir ampliando a mano según lo que se vaya viendo en tickets reales
// (mismo criterio que las `keywords` del buscador).
//
// Ambigüedad real reportada por el usuario, resuelta explícitamente por
// ella (2026-08-14): "si es su computadora, no sé si quieras manejarlo
// como hardware, pero el chiste es que la compu no reconoce el driver" —
// un accesorio que la compu YA NO RECONOCE (driver/detección) es un
// problema de software, no daño físico — por eso "no detecta"/"no
// reconoce" cae en Software y Sistema Operativo, y Periféricos se reserva
// para daño físico real (no funciona, está roto, no prende, no carga).
const TEXT_RULES = [
  {
    category: 'Ofimática y Archivos',
    keywords: [
      'onedrive', 'one drive', 'no sincroniza', 'carpeta compartida', 'no se actualiza la informacion',
      'outlook', 'no manda correos', 'no llegan correos', 'no recibo correos', 'no me llegan correos',
      'no me llega el correo', 'no puedo entrar a mi correo', 'se fue a spam',
      'teams', 'no tengo audio', 'no tengo video', 'no se escucha', 'no se ve en teams',
      'macro', 'plantilla de excel', 'excel', 'powerpoint', 'no tengo office', 'licencia de office',
      'activacion de office', 'firma de correo', 'firma electronica',
    ],
  },
  {
    category: 'Cuentas y Accesos',
    keywords: [
      'contrasena', 'olvide mi contrasena', 'cuenta bloqueada', 'cuenta esta bloqueada',
      'no puedo entrar', 'no tengo permisos', 'no tengo acceso', 'inicio de sesion', 'no me deja entrar',
    ],
  },
  {
    // Solo daño físico/consumibles reales — "no detecta"/"no reconoce"/"no
    // conecta" (falla de comunicación con el dispositivo, sea del sistema
    // operativo o de un programa específico) va en Software y Sistema
    // Operativo (ver esa regla abajo), no aquí. Ajuste explícito del
    // usuario (2026-08-14) sobre "el sae no está conectado a la
    // impresora": "suena a impresora, pero es software, ¿no? ya que un
    // programa no conecta con la impresora" — la impresora física está
    // bien, el problema es que SAE (un programa) no logra comunicarse con
    // ella, así que ya NO basta con mencionar "impresora" a secas.
    category: 'Periféricos',
    keywords: [
      'el mouse no funciona', 'el teclado no funciona', 'no funciona el mouse', 'no funciona el teclado',
      'monitor no prende', 'monitor no enciende', 'base para laptop rota', 'cargador dañado',
      'audifonos no funcionan', 'no funcionan los audifonos', 'webcam no funciona',
      'no imprime', 'toner', 'falta tinta', 'atasco de papel', 'impresion de mala calidad',
      'se atora el papel', 'escaner', 'escanear',
    ],
  },
  {
    category: 'Red Local (Usuario)',
    keywords: [
      'no tengo wifi', 'no hay wifi', 'sin wifi', 'no hay internet', 'sin internet', 'sin senal',
      'no conecta la vpn', 'no navega',
    ],
  },
  {
    category: 'Hardware Local',
    keywords: [
      'no enciende', 'no prende', 'no arranca', 'se apaga solo', 'pantalla rota', 'pantalla no da imagen',
      'la bateria no carga', 'se descarga rapido',
    ],
  },
  {
    // Fallas de DETECCIÓN/COMUNICACIÓN — el dispositivo/impresora en sí
    // puede estar bien, pero el sistema operativo o un programa específico
    // no logra reconocerlo/conectarse con él (driver, integración) — eso
    // es software, no el accesorio físico.
    category: 'Software y Sistema Operativo',
    keywords: [
      'no detecta', 'no reconoce', 'no reconoce el driver', 'no hay driver', 'windows lento',
      'se congela', 'pantalla azul', 'se cierra solo', 'no responde', 'no abre',
      'no conecta la impresora', 'no esta conectado a la impresora', 'no aparece la impresora',
      'no la encuentra la computadora', 'no detecta la impresora',
    ],
  },
  {
    category: 'Incidentes de Seguridad',
    keywords: [
      'phishing', 'correo sospechoso', 'me hackearon', 'hackearon mi cuenta', 'acceso no autorizado',
      'entraron a mi cuenta',
    ],
  },
];

function normalize(s) {
  return (s || '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function classifyByText(subject, description) {
  const text = normalize(`${subject || ''} ${description || ''}`);
  let best = null;
  let bestScore = 0;
  for (const rule of TEXT_RULES) {
    const score = rule.keywords.filter((k) => text.includes(k)).length;
    if (score > bestScore) {
      bestScore = score;
      best = rule.category;
    }
  }
  return best;
}

// Mapeo aparte para Solicitudes de Recursos redirigidas a Ticket (2026-08-14)
// \u2014 a diferencia de `classifyByText` (que lee una narrativa de "qu\u00e9 pas\u00f3" y
// por eso NO basta con que aparezca la palabra "impresora" a secas, ver
// comentario de la regla "Perif\u00e9ricos" arriba), aqu\u00ed el nombre del recurso
// S\u00cd es la categor\u00eda directa (ResourceRequest.resourceItems, ver
// SolicitarRecurso.jsx) \u2014 pedir de alta una impresora es Perif\u00e9ricos sin
// ambig\u00fcedad, no hace falta adivinar por contexto.
const RESOURCE_ITEM_SLA = {
  Mouse: 'Perif\u00e9ricos',
  Accesorio: 'Perif\u00e9ricos',
  'Base para Laptop': 'Perif\u00e9ricos',
  Cable: 'Perif\u00e9ricos',
  'Kit Teclado+Mouse': 'Perif\u00e9ricos',
  Aud\u00edfonos: 'Perif\u00e9ricos',
  Webcam: 'Perif\u00e9ricos',
  Impresora: 'Perif\u00e9ricos',
};

module.exports = { applySlaCategory, assignResolutionDueAt, classifyByText, RESOURCE_ITEM_SLA };
