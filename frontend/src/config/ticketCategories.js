// Única fuente de verdad para el wizard "Reportar ticket" (ReportarTicket.jsx)
// Y el buscador de Mesa de Ayuda (MesaDeAyuda.jsx) — antes eran 2 listas
// separadas (una para el wizard, otra para el buscador) y se desincronizaron
// solas más de una vez (ej. la categoría "Aplicaciones" no existía en una de
// las dos). Con un solo catálogo, agregar/editar un problema aquí actualiza
// AMBOS lugares automáticamente.
//
// De lo general a lo particular en 2 pasos reales (no uno que repite al
// otro): 1) categoría amplia, 2) problema específico DE esa categoría — cada
// una con su propio contenido curado, no la misma lista disfrazada. "Software"
// (sistema operativo/programas instalados en tu equipo) y "Aplicaciones"
// (páginas/sistemas internos de la empresa) son categorías separadas a
// propósito — no son lo mismo.
//
// Cada `problems` item es `{ label, keywords, sla?, note? }`:
// - `keywords`: frases/palabras que el buscador usa para llegar DIRECTO a
//   este problema específico (no solo a la categoría) — la resolución más
//   "particular" posible desde una búsqueda de texto libre.
// - `sla` (opcional): a cuál Categoría de Falla del catálogo oficial
//   (`Ticket.SLA_CATALOG` en el backend) corresponde este problema — se
//   manda como `slaHint` al crear el ticket, para que quede clasificado
//   (nivel/prioridad/fechas límite) desde que nace, en vez de depender de
//   que un admin lo clasifique después a mano, o del checkbox "¿te impide
//   trabajar?" (que cualquiera puede marcar siempre, impida o no realmente).
//   Sin `sla`: el ticket nace sin clasificar, exactamente como antes.
// - `note` (opcional): en vez de avanzar directo al formulario, muestra una
//   explicación con 2 salidas (ver ReportarTicket.jsx) — para problemas que
//   en realidad no son una falla (ej. límite de licencia).
//
// `problems: 'apps'` = la lista del paso 2 se arma con el catálogo de
// Aplicaciones Internas (cargado aparte, ver ambos consumidores). `problems:
// null` = sin paso 2, directo al formulario — solo "Otro" lo usa, porque
// pide su propio detalle libre en vez de una lista curada.
export const CATEGORIES = [
  {
    key: 'hardware', icon: '🖥️', label: 'Hardware',
    desc: 'Un equipo físico que ya tienes: laptop, celular, monitor, mouse...',
    keywords: ['hardware', 'equipo', 'laptop', 'computadora', 'celular', 'monitor'],
    problems: [
      { label: 'No enciende o no prende', keywords: ['no enciende', 'no prende', 'no arranca', 'se apaga solo', 'se apaga sola'], sla: 'Hardware Local' },
      { label: 'La pantalla no da imagen o se ve mal', keywords: ['pantalla', 'no da imagen', 'se ve mal', 'pantalla rota', 'pantalla negra', 'se quema la pantalla'], sla: 'Hardware Local' },
      { label: 'La batería no carga o se descarga muy rápido', keywords: ['bateria', 'no carga', 'se descarga rapido', 'cargador'], sla: 'Hardware Local' },
      // Teclado/mouse son periféricos, no "Hardware Local" — el SLA oficial
      // los separa (distinta prioridad/tiempos), así que el problema
      // específico manda aquí, no la categoría general.
      { label: 'El teclado o el mouse no funciona', keywords: ['teclado', 'mouse', 'no funciona el teclado', 'no funciona el mouse', 'no jala el mouse'], sla: 'Periféricos' },
      { label: 'Otro problema de hardware', keywords: [] },
    ],
  },
  {
    key: 'software', icon: '💾', label: 'Software',
    desc: 'El sistema operativo o un programa instalado en tu equipo.',
    // 'anydesk'/'zoom'/'skype' agregados al minar el histórico del sistema
    // de tickets anterior (BD_Helpdesk.csv) — herramientas que la gente
    // reporta por su nombre, no como "un programa".
    keywords: ['software', 'programa', 'windows', 'sistema operativo', 'anydesk', 'zoom', 'skype'],
    problems: [
      { label: 'Windows lento o con errores', keywords: ['windows lento', 'lento', 'lenta', 'con errores', 'se congela', 'pantalla azul'], sla: 'Software y Sistema Operativo' },
      { label: 'Un programa no abre o se cierra solo', keywords: ['no abre', 'se cierra solo', 'programa no abre', 'no responde'], sla: 'Software y Sistema Operativo' },
      // Outlook/OneDrive/Teams/Excel son ofimática, no "Software y Sistema
      // Operativo" en general — el SLA oficial también los separa.
      // Keywords ampliados con variantes reales tomadas del histórico
      // (BD_Helpdesk.csv): "no me permite abrir mi correo", "recepción de
      // correos", etc. — mismo problema, forma distinta de contarlo.
      {
        label: 'Outlook no me manda o no me llegan correos',
        keywords: [
          'outlook', 'no manda correos', 'no llegan correos', 'no recibo correos', 'no me llegan correos', 'no me llega el correo',
          'no puedo entrar a mi correo', 'no abre mi correo', 'no me permite abrir mi correo', 'no puedo accesar a mi correo',
          'recepcion de correos', 'no recibo mail', 'no llegan mails', 'no recibiendo los mail', 'no me llegan mail',
        ],
        sla: 'Ofimática y Archivos',
      },
      { label: 'OneDrive no guarda o no sincroniza mis archivos', keywords: ['onedrive', 'no sincroniza', 'no guarda mis archivos', 'archivos no aparecen'], sla: 'Ofimática y Archivos' },
      { label: 'Teams no tiene audio o video en las llamadas', keywords: ['teams', 'no tengo audio', 'no tengo video', 'no se escucha', 'no se ve en teams'], sla: 'Ofimática y Archivos' },
      { label: 'Macros o plantillas de Excel', keywords: ['macro', 'macros', 'plantilla de excel', 'excel'], sla: 'Ofimática y Archivos' },
      {
        label: 'No encuentro Word, Excel o PowerPoint en mi computadora',
        keywords: ['no tengo word', 'no tengo excel', 'no tengo powerpoint', 'no encuentro office', 'no viene instalado office', 'no tengo office'],
        note: {
          text: 'Esto casi siempre pasa porque tu plan de Microsoft 365 solo incluye la versión web (desde el navegador), no el programa instalado. No es una falla — se pide como Solicitud de Recurso, no como ticket.',
          ctaLabel: 'Ir a Solicitar Recurso',
          ctaTo: '/solicitar-recurso?tipo=software',
        },
      },
      // Agregado al minar BD_Helpdesk.csv: "activación de Office"/"licencia
      // vencida" era, por mucho, el problema más repetido del histórico que
      // el catálogo anterior no cubría con un problema propio (caía todo al
      // catch-all genérico).
      {
        label: 'Office pide activarse, dice que la licencia venció o necesita reinstalarse',
        keywords: [
          'activacion de office', 'activar office', 'activar mi office', 'licencia de office', 'licencia vencida',
          'no tengo licencia', 'inactivo office', 'no puedo accesar a office', 'actualizacion de office', 'actualizar office',
          'actualizacion de microsoft', 'copia no esta activada', 'no funciona mi office', 'reinstalacion de office',
          'reinstalar office', 'inicio de sesion en microsoft', 'iniciar sesion en office',
        ],
        sla: 'Ofimática y Archivos',
      },
      // Agregado al minar BD_Helpdesk.csv: acceso a carpetas compartidas
      // (OneDrive o de red) es un problema distinto a que OneDrive no
      // sincronice — aquí el archivo/carpeta existe pero no se puede entrar.
      {
        label: 'No tengo acceso a una carpeta compartida',
        keywords: ['carpeta compartida', 'carpeta de red', 'acceso a la carpeta', 'compartir carpeta', 'compartir un archivo'],
        sla: 'Ofimática y Archivos',
      },
      // Agregado al minar BD_Helpdesk.csv: configurar/cambiar la firma del
      // correo institucional aparecía seguido y no tenía dónde caer.
      {
        label: 'Necesito configurar o cambiar mi firma de correo',
        keywords: ['firma de correo', 'firma electronica', 'firma en el correo', 'cambiar firma', 'configurar firma'],
        sla: 'Ofimática y Archivos',
      },
      // Nota (no falla), mismo patrón que "No encuentro Word/Excel...":
      // instalar algo nuevo (Zoom, AnyDesk, Zebra Designer, etc.) es una
      // Solicitud de Recurso, no un ticket — pero en el histórico se
      // reportaba seguido como si fuera una falla.
      {
        label: 'Necesito instalar un programa nuevo (Zoom, AnyDesk, etc.)',
        keywords: ['instalar zoom', 'instalar anydesk', 'zebra designer', 'instalar software', 'instalar programa', 'intalar zebradesigner'],
        note: {
          text: 'Instalar un programa nuevo (que no traías antes en tu equipo) se pide como Solicitud de Recurso, no como ticket — así queda registrada la petición y su aprobación.',
          ctaLabel: 'Ir a Solicitar Recurso',
          ctaTo: '/solicitar-recurso?tipo=software',
        },
      },
      { label: 'Otro problema de software', keywords: [] },
    ],
  },
  {
    key: 'aplicacion', icon: '🗂️', label: 'Aplicaciones',
    desc: 'Una página o sistema interno de la empresa (no un programa de tu equipo).',
    keywords: ['aplicacion', 'pagina', 'portal', 'sistema interno', 'no carga la pagina', 'error 404', 'no abre la pagina'],
    // Sin SLA automático a propósito: cada aplicación interna puede tener un
    // responsable distinto (ej. "Cuentas por Pagar" es de Héctor, no de
    // Sistemas) — un admin la clasifica a mano según a quién le toque.
    problems: 'apps',
  },
  {
    key: 'red', icon: '📶', label: 'Red / Conectividad',
    desc: 'WiFi o VPN.',
    keywords: ['red', 'conectividad'],
    problems: [
      { label: 'No tengo WiFi o internet', keywords: ['wifi', 'internet', 'no conecta', 'no hay internet', 'sin senal', 'no navega'], sla: 'Red Local (Usuario)' },
      { label: 'La VPN no conecta', keywords: ['vpn', 'no conecta la vpn'], sla: 'Red Local (Usuario)' },
      { label: 'Otro problema de red', keywords: [] },
    ],
  },
  {
    key: 'impresora', icon: '🖨️', label: 'Impresoras',
    desc: 'No imprime, se atora, falta tóner o tinta...',
    keywords: ['impresora', 'imprimir', 'impresion'],
    problems: [
      { label: 'No imprime nada', keywords: ['no imprime', 'no imprime nada', 'la impresora no jala', 'no funciona la impresora'], sla: 'Periféricos' },
      { label: 'Se atora el papel', keywords: ['se atora', 'atasco de papel', 'papel atorado', 'se traba el papel'], sla: 'Periféricos' },
      { label: 'Falta tóner o tinta', keywords: ['toner', 'tinta', 'falta toner', 'falta tinta', 'cartucho'], sla: 'Periféricos' },
      { label: 'Impresión de mala calidad (rayada, borrosa)', keywords: ['mala calidad', 'rayada', 'borrosa', 'manchada', 'se ve mal impreso'], sla: 'Periféricos' },
      { label: 'No conecta o no la encuentra la computadora', keywords: ['no conecta', 'no la encuentra', 'no aparece la impresora', 'no detecta la impresora'], sla: 'Periféricos' },
      // Agregado al minar BD_Helpdesk.csv: el escáner (casi siempre el mismo
      // equipo multifunción que la impresora) tenía su propio volumen de
      // reportes que antes caía al catch-all genérico.
      { label: 'El escáner no funciona o no puedo escanear', keywords: ['escanear', 'escaner', 'scaner', 'scanner', 'configuracion scaner', 'configuracion del escaner'], sla: 'Periféricos' },
      { label: 'Otro problema de impresora', keywords: [], sla: 'Periféricos' },
    ],
  },
  {
    key: 'cuenta_acceso', icon: '🔐', label: 'Cuenta / Acceso',
    desc: 'Ya tienes la cuenta pero no puedes entrar.',
    keywords: ['cuenta', 'acceso'],
    problems: [
      { label: 'Olvidé mi contraseña', keywords: ['contrasena', 'password', 'olvide mi contrasena'], sla: 'Cuentas y Accesos' },
      { label: 'Mi cuenta está bloqueada', keywords: ['bloqueado', 'bloqueada', 'cuenta bloqueada', 'no puedo entrar', 'no me deja entrar', 'iniciar sesion', 'inicio de sesion', 'no puedo iniciar sesion'], sla: 'Cuentas y Accesos' },
      { label: 'No tengo permisos para algo', keywords: ['permisos', 'no tengo permisos'], sla: 'Cuentas y Accesos' },
      { label: 'Otro problema de cuenta', keywords: [], sla: 'Cuentas y Accesos' },
    ],
  },
  {
    key: 'seguridad', icon: '🛡️', label: 'Seguridad',
    desc: 'Un correo raro, un enlace sospechoso o crees que alguien entró a tu cuenta.',
    keywords: ['seguridad', 'phishing', 'virus'],
    // Toda la categoría es en sí misma "Incidentes de Seguridad" — incluso
    // el "otro" catch-all se clasifica igual (mejor de más urgente que de
    // menos, tratándose de seguridad).
    problems: [
      { label: 'Recibí un correo sospechoso (puede ser phishing)', keywords: ['phishing', 'correo sospechoso', 'correo raro', 'suplantacion'], sla: 'Incidentes de Seguridad' },
      { label: 'Creo que alguien entró a mi cuenta sin permiso', keywords: ['me hackearon', 'hackearon mi cuenta', 'entraron a mi cuenta', 'acceso no autorizado', 'hackeada'], sla: 'Incidentes de Seguridad' },
      { label: 'Un enlace o mensaje raro me pidió mi contraseña', keywords: ['enlace sospechoso', 'me pidio mi contrasena', 'link raro', 'link sospechoso'], sla: 'Incidentes de Seguridad' },
      { label: 'Otro problema de seguridad', keywords: [], sla: 'Incidentes de Seguridad' },
    ],
  },
  {
    key: 'erp', icon: '🏭', label: 'ERP',
    desc: 'El sistema ERP interno — módulos, reportes, accesos.',
    keywords: ['erp', 'sistema administrativo'],
    // Toda la categoría ERP ya es "Cuentas Críticas / ERP-SAE" en el SLA
    // oficial — incluye el catch-all "otro", mismo criterio que Seguridad.
    // Nota: el histórico (BD_Helpdesk.csv) muestra que la gente reporta por
    // el nombre real del sistema (SAE/COI/NOI), no por "ERP" — pero, a
    // pedido explícito del usuario, ese enrutamiento específico todavía NO
    // se implementa (pendiente de decisión de producto).
    problems: [
      { label: 'No puedo entrar al ERP', keywords: ['no puedo entrar al erp', 'erp no abre', 'no abre el erp'], sla: 'Cuentas Críticas / ERP-SAE' },
      { label: 'Un módulo no funciona', keywords: ['modulo', 'modulos', 'modulo no funciona'], sla: 'Cuentas Críticas / ERP-SAE' },
      { label: 'Necesito un reporte y no sale', keywords: ['reporte', 'reporte del erp', 'no sale el reporte'], sla: 'Cuentas Críticas / ERP-SAE' },
      { label: 'Otro problema del ERP', keywords: [], sla: 'Cuentas Críticas / ERP-SAE' },
    ],
  },
  {
    key: 'otro', icon: '❓', label: 'Otro',
    desc: 'No encaja en las anteriores.',
    keywords: [],
    problems: null,
  },
];

// Los problemas del paso 2 son casi siempre un objeto simple, pero conviven
// con la forma vieja (string plano) por si algo externo todavía la usa —
// estos 3 helpers dejan que el resto del código no le importe la forma
// exacta.
export function problemLabel(item) {
  return typeof item === 'string' ? item : item.label;
}
export function problemNote(item) {
  return typeof item === 'string' ? null : item.note || null;
}
export function problemKeywords(item) {
  return typeof item === 'string' ? [] : (item.keywords || []);
}
export function problemSla(item) {
  return typeof item === 'string' ? null : (item.sla || null);
}
