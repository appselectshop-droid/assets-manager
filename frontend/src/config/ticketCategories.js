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
// Hardware/Software/Red se separan entre "Computadoras" (laptop/escritorio/
// all-in-one) y "Celulares" — pedido explícito del usuario: antes una sola
// categoría "Hardware" preguntaba "¿sobre cuál de tus equipos es esto?"
// (ver ReportarTicket.jsx), lo cual no tenía sentido para alguien reportando
// justo "mi laptop no enciende" y teniendo que igual elegir cuál equipo es.
// Con el botón ya separado por tipo de equipo no hace falta preguntar nada
// — y si alguien no tiene celular asignado, esas categorías ni le aparecen
// (ver CATEGORY_ASSET_REQUIREMENT y su uso en ReportarTicket.jsx, basado en
// los activos reales asignados vía GET /tickets/mine/assets).
export const CATEGORY_ASSET_REQUIREMENT = {
  hardware_pc: ['laptop', 'escritorio', 'all_in_one'],
  hardware_celular: ['celular'],
  software_pc: ['laptop', 'escritorio', 'all_in_one'],
  software_celular: ['celular'],
  red_pc: ['laptop', 'escritorio', 'all_in_one'],
  red_celular: ['celular'],
};

// Pedido explícito del usuario: "siento que está todo revuelto" — con 10
// categorías en una sola cuadrícula plana no se notaba ningún orden, aunque
// ya estuvieran más o menos agrupadas. Cada categoría de abajo declara su
// `section`; este orden fijo es el que usa ReportarTicket.jsx para pintar
// un encabezado por grupo en vez de una sola cuadrícula sin dividir.
export const CATEGORY_SECTIONS = ['Tu equipo', 'Programas y sistemas', 'Conexión e impresión', 'Cuentas y seguridad', 'Otro'];

export const CATEGORIES = [
  // Botón único "Hardware" — pedido explícito del usuario: no quería 7
  // botones sueltos en la pantalla principal. Al apretarlo, un paso
  // intermedio (`problems: 'device-split'`, ver ReportarTicket.jsx) deja
  // elegir Computadoras/Celulares — cada opción apunta a la categoría real
  // de abajo (marcada `hidden: true`, ya no se muestra como botón propio),
  // que sigue teniendo su propio catálogo de problemas de siempre.
  {
    key: 'hardware', icon: '🖥️', label: 'Hardware', section: 'Tu equipo',
    desc: 'Un equipo físico: laptop, escritorio, all-in-one o celular.',
    keywords: ['hardware', 'equipo', 'laptop', 'computadora', 'celular'],
    problems: 'device-split',
    deviceOptions: [
      { key: 'hardware_pc', icon: '🖥️', label: 'Computadoras' },
      { key: 'hardware_celular', icon: '📱', label: 'Celulares' },
    ],
  },
  {
    key: 'hardware_pc', icon: '🖥️', label: 'Hardware Computadoras', hidden: true,
    desc: 'Tu laptop, escritorio o all-in-one: no enciende, pantalla, batería...',
    keywords: ['hardware', 'equipo', 'laptop', 'escritorio', 'all in one', 'computadora'],
    problems: [
      { label: 'No enciende o no prende', keywords: ['no enciende', 'no prende', 'no arranca', 'se apaga solo', 'se apaga sola'], sla: 'Hardware Local' },
      { label: 'La pantalla no da imagen o se ve mal', keywords: ['pantalla', 'no da imagen', 'se ve mal', 'pantalla rota', 'pantalla negra', 'se quema la pantalla'], sla: 'Hardware Local' },
      { label: 'La batería no carga o se descarga muy rápido', keywords: ['bateria', 'no carga', 'se descarga rapido', 'cargador'], sla: 'Hardware Local' },
      { label: 'Otro problema de hardware', keywords: [] },
    ],
  },
  {
    key: 'hardware_celular', icon: '📱', label: 'Hardware Celulares', hidden: true,
    desc: 'Tu celular asignado: no enciende, pantalla, batería...',
    keywords: ['hardware celular', 'celular', 'telefono'],
    problems: [
      { label: 'No enciende o no prende', keywords: ['no enciende', 'no prende', 'no arranca', 'se apaga solo', 'se apaga sola'], sla: 'Hardware Local' },
      { label: 'La pantalla no da imagen, está rota o se ve mal', keywords: ['pantalla', 'pantalla rota', 'no da imagen', 'se ve mal'], sla: 'Hardware Local' },
      { label: 'La batería no carga o se descarga muy rápido', keywords: ['bateria', 'no carga', 'se descarga rapido', 'cargador'], sla: 'Hardware Local' },
      { label: 'Otro problema de hardware', keywords: [] },
    ],
  },
  // Antes vivía como "El teclado o el mouse no funciona" dentro de
  // Hardware — pedido explícito: separarlo en su propia categoría y
  // llamarla "Accesorios" (no "Consumibles", que no se entiende igual),
  // para cubrir cualquier periférico dañado, no solo teclado/mouse.
  {
    key: 'accesorio', icon: '🖱️', label: 'Accesorios', section: 'Tu equipo',
    desc: 'Mouse, teclado, monitor, base para laptop, cargador, audífonos...',
    keywords: ['accesorio', 'mouse', 'teclado', 'monitor', 'base para laptop', 'cargador', 'audifonos', 'webcam'],
    problems: [
      { label: 'El teclado o el mouse no funciona', keywords: ['teclado', 'mouse', 'no funciona el teclado', 'no funciona el mouse', 'no jala el mouse'], sla: 'Periféricos' },
      { label: 'El monitor no prende o se ve mal', keywords: ['monitor', 'no prende el monitor', 'monitor no enciende'], sla: 'Periféricos' },
      { label: 'La base para laptop está rota o dañada', keywords: ['base para laptop', 'base de lap', 'base rota'], sla: 'Periféricos' },
      { label: 'El cargador no carga o está dañado', keywords: ['cargador', 'no carga', 'cargador dañado'], sla: 'Periféricos' },
      { label: 'Los audífonos no funcionan', keywords: ['audifonos', 'diadema', 'headset'], sla: 'Periféricos' },
      { label: 'Otro accesorio dañado o que no funciona', keywords: [], sla: 'Periféricos' },
    ],
  },
  {
    key: 'software', icon: '💾', label: 'Software', section: 'Programas y sistemas',
    desc: 'El sistema operativo o un programa, en tu equipo o en tu celular.',
    keywords: ['software', 'programa', 'windows', 'sistema operativo'],
    problems: 'device-split',
    deviceOptions: [
      { key: 'software_pc', icon: '💾', label: 'Computadoras' },
      { key: 'software_celular', icon: '📲', label: 'Celulares' },
    ],
  },
  {
    key: 'software_pc', icon: '💾', label: 'Software Computadoras', hidden: true,
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
    key: 'software_celular', icon: '📲', label: 'Software Celulares', hidden: true,
    desc: 'Apps, correo o el sistema de tu celular.',
    keywords: ['software celular', 'app', 'aplicacion celular'],
    problems: [
      { label: 'El celular va lento o se traba', keywords: ['celular lento', 'se traba', 'va lento'], sla: 'Software y Sistema Operativo' },
      { label: 'Una app no abre o se cierra sola', keywords: ['app no abre', 'se cierra sola', 'no responde'], sla: 'Software y Sistema Operativo' },
      { label: 'No puedo instalar o actualizar una app', keywords: ['instalar app', 'actualizar app'], sla: 'Software y Sistema Operativo' },
      { label: 'El correo no funciona en el celular', keywords: ['correo en el celular', 'outlook celular', 'no me llegan correos al celular'], sla: 'Ofimática y Archivos' },
      { label: 'Otro problema de software en el celular', keywords: [] },
    ],
  },
  {
    key: 'aplicacion', icon: '🗂️', label: 'Aplicaciones', section: 'Programas y sistemas',
    desc: 'Una página o sistema interno de la empresa (no un programa de tu equipo).',
    keywords: ['aplicacion', 'pagina', 'portal', 'sistema interno', 'no carga la pagina', 'error 404', 'no abre la pagina'],
    // Sin SLA automático a propósito: cada aplicación interna puede tener un
    // responsable distinto (ej. "Cuentas por Pagar" es de Héctor, no de
    // Sistemas) — un admin la clasifica a mano según a quién le toque.
    problems: 'apps',
  },
  {
    key: 'red', icon: '📶', label: 'Red / Conectividad', section: 'Conexión e impresión',
    desc: 'WiFi o VPN, en tu equipo o en tu celular.',
    keywords: ['red', 'conectividad', 'wifi', 'vpn'],
    problems: 'device-split',
    deviceOptions: [
      { key: 'red_pc', icon: '📶', label: 'Computadoras' },
      { key: 'red_celular', icon: '📡', label: 'Celulares' },
    ],
  },
  {
    key: 'red_pc', icon: '📶', label: 'Red Computadoras', hidden: true,
    desc: 'WiFi o VPN en tu laptop, escritorio o all-in-one.',
    keywords: ['red', 'conectividad', 'wifi computadora'],
    problems: [
      { label: 'No tengo WiFi o internet', keywords: ['wifi', 'internet', 'no conecta', 'no hay internet', 'sin senal', 'no navega'], sla: 'Red Local (Usuario)' },
      { label: 'La VPN no conecta', keywords: ['vpn', 'no conecta la vpn'], sla: 'Red Local (Usuario)' },
      { label: 'Otro problema de red', keywords: [] },
    ],
  },
  {
    key: 'red_celular', icon: '📡', label: 'Red Celulares', hidden: true,
    desc: 'WiFi, datos o VPN en tu celular.',
    keywords: ['red celular', 'wifi celular', 'datos moviles'],
    problems: [
      { label: 'No tengo WiFi o datos en mi celular', keywords: ['wifi celular', 'datos moviles', 'no hay internet en el celular', 'sin senal'], sla: 'Red Local (Usuario)' },
      { label: 'No puedo conectarme a la VPN desde mi celular', keywords: ['vpn celular', 'no conecta la vpn'], sla: 'Red Local (Usuario)' },
      { label: 'Otro problema de red en el celular', keywords: [] },
    ],
  },
  {
    key: 'impresora', icon: '🖨️', label: 'Impresoras', section: 'Conexión e impresión',
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
    key: 'cuenta_acceso', icon: '🔐', label: 'Cuenta / Acceso', section: 'Cuentas y seguridad',
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
    key: 'seguridad', icon: '🛡️', label: 'Seguridad', section: 'Cuentas y seguridad',
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
    key: 'erp', icon: '🏭', label: 'ERP', section: 'Programas y sistemas',
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
    key: 'otro', icon: '❓', label: 'Otro', section: 'Otro',
    desc: 'No encaja en las anteriores.',
    keywords: [],
    problems: null,
  },
];

// Para el botón "← Cambiar categoría" cuando ya se está viendo el catálogo
// de problemas de una categoría "oculta" (hardware_pc, red_celular, etc.)
// — en vez de saltar directo a la pantalla de categorías, primero regresa
// al paso de elegir Computadoras/Celulares de su categoría "padre".
export const PARENT_GROUPING_CATEGORY = {
  hardware_pc: 'hardware', hardware_celular: 'hardware',
  software_pc: 'software', software_celular: 'software',
  red_pc: 'red', red_celular: 'red',
};

// "Solicitud de Pagos" — pedido explícito del usuario: cuando alguien
// reporta un ticket sobre esta aplicación específica del catálogo de
// Aplicaciones Internas, en vez de ir directo al formulario (como
// cualquier otra app), se le pregunta primero de qué apartado es — porque
// cada uno lo atiende un equipo distinto y muy específico, nada que ver
// con Sistemas: Usuarios → Líder/Analista ERP; Centro de Costos y Motivo
// de Pago → Gerente de Contabilidad; Alta de Proveedores → el correo de
// Pagos. Ver getTicketEmailRecipients() en backend/src/routes/tickets.js,
// que compara el `label` de cada apartado (en minúsculas) para decidir a
// quién le llega el correo — si se edita un `label` aquí, hay que
// actualizar esa función también.
export const SOLICITUD_PAGOS_APP_NAME = 'solicitud de pagos';

export function isSolicitudDePagosApp(appName) {
  return (appName || '').trim().toLowerCase() === SOLICITUD_PAGOS_APP_NAME;
}

export const PAYMENT_REQUEST_SUBAREAS = [
  {
    key: 'usuarios',
    icon: '👤',
    label: 'Usuarios',
    desc: 'Tu acceso a Solicitud de Pagos: contraseña, alta, historial, permisos.',
    problems: [
      { label: 'Olvidé mi contraseña', keywords: ['contrasena', 'password', 'olvide mi contrasena'] },
      { label: 'Necesito una cuenta nueva (alta de usuario)', keywords: ['alta de usuario', 'cuenta nueva', 'necesito un alta', 'crear usuario'] },
      { label: 'Mi cuenta está bloqueada o no puedo entrar', keywords: ['bloqueado', 'bloqueada', 'no puedo entrar', 'no me deja entrar'] },
      { label: 'No veo mi historial o mis solicitudes anteriores', keywords: ['no veo mi historial', 'no se ve mi historial', 'solicitudes anteriores'] },
      { label: 'Necesito cambiar mis permisos o accesos', keywords: ['permisos', 'accesos', 'cambiar permisos'] },
      { label: 'Otro problema de usuarios', keywords: [] },
    ],
  },
  // El usuario pidió explícitamente estas opciones ("ponle opciones de
  // contabilidad, es que de eso no sé") — problemas típicos de un catálogo
  // de centros de costos/motivos de pago, no confirmados por el equipo de
  // Contabilidad; ajustar si alguien de ahí pide otra redacción.
  {
    key: 'costos',
    icon: '🏷️',
    label: 'Centro de Costos / Motivo de Pago',
    desc: 'Catálogos de centros de costos y motivos de pago.',
    problems: [
      { label: 'Necesito dar de alta un centro de costos nuevo', keywords: ['alta centro de costos', 'nuevo centro de costos'] },
      { label: 'Necesito dar de alta un motivo de pago nuevo', keywords: ['alta motivo de pago', 'nuevo motivo de pago'] },
      { label: 'Un centro de costos o motivo de pago no aparece en el catálogo', keywords: ['no aparece', 'no esta en el catalogo'] },
      { label: 'Necesito modificar o corregir uno existente', keywords: ['modificar', 'corregir', 'editar centro de costos', 'editar motivo de pago'] },
      { label: 'Otro tema de centros de costos o motivos de pago', keywords: [] },
    ],
  },
  {
    key: 'proveedores',
    icon: '🏢',
    label: 'Alta de Proveedores',
    desc: 'Dar de alta o actualizar los datos de un proveedor.',
    problems: [
      { label: 'Necesito dar de alta un proveedor nuevo', keywords: ['alta de proveedor', 'proveedor nuevo', 'dar de alta un proveedor'] },
      { label: 'Necesito actualizar los datos de un proveedor (banco, RFC, dirección)', keywords: ['actualizar proveedor', 'datos bancarios', 'rfc', 'cambio de banco'] },
      { label: 'Un proveedor no aparece en el catálogo', keywords: ['no aparece el proveedor', 'proveedor no aparece'] },
      { label: 'Otro tema de proveedores', keywords: [] },
    ],
  },
];

// "Ventas" — mismo patrón que Solicitud de Pagos arriba (apartados con su
// propio catálogo de problemas), pero el enrutamiento es más simple: TODO
// lo de esta app llega solo a `sistemas.2@selectshop.com.mx`, sin importar
// el apartado (ver getTicketEmailRecipients() en backend/src/routes/
// tickets.js) — los apartados aquí son la lista de problemas que pasó
// Miguel, el `desc` de cada uno documenta quién lo atiende EN LA REALIDAD
// (jefe directo, Dirección, Admin), no a quién le llega el correo.
export const VENTAS_APP_NAME = 'ventas';

export function isVentasApp(appName) {
  return (appName || '').trim().toLowerCase() === VENTAS_APP_NAME;
}

export const VENTAS_SUBAREAS = [
  {
    key: 'aprobaciones',
    icon: '✅',
    label: 'Aprobación de Solicitudes',
    desc: 'La revisa tu jefe directo o Dirección.',
    problems: [
      { label: 'Mi solicitud lleva mucho tiempo sin aprobarse', keywords: ['sin aprobar', 'no se aprueba', 'lleva mucho tiempo'] },
      { label: 'No sé a quién le toca aprobar mi solicitud', keywords: ['quien aprueba', 'a quien le toca'] },
      { label: 'Necesito cancelar o modificar una solicitud ya enviada', keywords: ['cancelar solicitud', 'modificar solicitud'] },
      { label: 'Otro tema de aprobaciones', keywords: [] },
    ],
  },
  // El usuario dio esta agrupación tal cual se la pasó Miguel; los
  // problemas específicos de la lista son propuestos por mí, no
  // confirmados por Ventas — ajustar si piden otra redacción.
  {
    key: 'cotizaciones',
    icon: '🧾',
    label: 'Cotizaciones, Clientes y Catálogo',
    desc: 'Dudas de uso — las revisa tu jefe directo o un administrador.',
    problems: [
      { label: 'No sé cómo generar una cotización', keywords: ['generar cotizacion', 'como cotizar'] },
      { label: 'Un cliente no aparece en el sistema', keywords: ['cliente no aparece', 'no encuentro al cliente'] },
      { label: 'Necesito dar de alta un cliente nuevo', keywords: ['alta de cliente', 'cliente nuevo'] },
      { label: 'Un producto o precio del catálogo está mal o desactualizado', keywords: ['precio mal', 'catalogo desactualizado', 'precio incorrecto'] },
      { label: 'Otro tema de cotizaciones, clientes o catálogo', keywords: [] },
    ],
  },
  {
    key: 'acceso',
    icon: '🔐',
    label: 'Acceso / Usuario Bloqueado / Permisos',
    desc: 'La atiende Sistemas.',
    problems: [
      { label: 'Olvidé mi contraseña', keywords: ['contrasena', 'password', 'olvide mi contrasena'] },
      { label: 'Mi cuenta está bloqueada o no puedo entrar', keywords: ['bloqueado', 'bloqueada', 'no puedo entrar', 'no me deja entrar'] },
      { label: 'Necesito una cuenta nueva (alta de usuario)', keywords: ['alta de usuario', 'cuenta nueva', 'crear usuario'] },
      { label: 'Necesito cambiar mis permisos o accesos', keywords: ['permisos', 'accesos', 'cambiar permisos'] },
      { label: 'Otro problema de acceso', keywords: [] },
    ],
  },
];

// "Gestor de Constancias Aduaneras" — catálogo real pasado por el usuario
// (8 apartados, 30 problemas específicos, tal cual se los compartieron).
// Enrutamiento EXCLUSIVO a un solo correo, sin importar el apartado —
// mismo criterio que Ventas, ver getTicketEmailRecipients() en
// backend/src/routes/tickets.js.
export const GESTOR_CONSTANCIAS_APP_NAME = 'gestor de constancias aduaneras';

export function isGestorConstanciasApp(appName) {
  return (appName || '').trim().toLowerCase() === GESTOR_CONSTANCIAS_APP_NAME;
}

export const GESTOR_CONSTANCIAS_SUBAREAS = [
  {
    key: 'login',
    icon: '🔐',
    label: 'Inicio de sesión y cuentas',
    desc: 'Entrar con Microsoft o con usuario/contraseña, sesión, roles de admin.',
    problems: [
      { label: 'No puedo entrar, dice que mi cuenta está pendiente de aprobación', keywords: ['cuenta pendiente de aprobacion', 'pendiente de aprobacion'] },
      { label: 'Al iniciar con Microsoft aparece "Microsoft bloqueó el acceso" (permiso pendiente en Azure)', keywords: ['microsoft bloqueo el acceso', 'permiso pendiente en azure', 'azure'] },
      { label: 'No se pudo obtener el token de Microsoft. Intenta de nuevo', keywords: ['no se pudo obtener el token', 'token de microsoft'] },
      { label: 'Pantalla en blanco o error justo después de loguearse con Microsoft', keywords: ['pantalla en blanco', 'error despues de loguearse', 'navegar hacia atras'] },
      { label: 'Error de Microsoft: no_email / la cuenta Microsoft no tiene correo asociado', keywords: ['no_email', 'no tiene correo asociado'] },
      { label: '"Se me cerró la sesión sola" sin ningún aviso', keywords: ['se me cerro la sesion', 'sesion cerrada sola'] },
      { label: '"Correo o contraseña incorrectos" al entrar con usuario/contraseña', keywords: ['correo o contrasena incorrectos', 'contrasena incorrecta'] },
      { label: 'Se le quitó el rol admin a la cuenta del buzón de sistema y volvió a aparecer como admin', keywords: ['rol admin', 'buzon de sistema', 'volvio a aparecer como admin'] },
      { label: 'Otro problema de inicio de sesión o cuentas', keywords: [] },
    ],
  },
  {
    key: 'permisos',
    icon: '🎚️',
    label: 'Permisos y roles',
    desc: 'Lo que puede o no hacer un operador o un administrador.',
    problems: [
      { label: 'El operador no puede exportar ni importar el Excel', keywords: ['operador no puede exportar', 'operador no puede importar'] },
      { label: 'El operador no ve los módulos de Alertas ni Configuración', keywords: ['operador no ve alertas', 'operador no ve configuracion'] },
      { label: 'Un administrador no puede eliminar su propia cuenta', keywords: ['eliminar su propia cuenta', 'administrador no puede eliminar'] },
      { label: 'Otro problema de permisos o roles', keywords: [] },
    ],
  },
  {
    key: 'documentos',
    icon: '📄',
    label: 'Documentos (PDFs)',
    desc: 'Subir, corregir o guardar los documentos de un folio.',
    problems: [
      { label: '"Solo se aceptan archivos PDF" al subir un documento', keywords: ['solo se aceptan archivos pdf'] },
      { label: 'El botón para subir el documento aparece deshabilitado', keywords: ['boton para subir deshabilitado', 'boton deshabilitado'] },
      { label: 'Subieron el documento equivocado, ¿cómo se corrige?', keywords: ['documento equivocado', 'corregir documento'] },
      { label: '"Error al guardar/quitar el documento" sin más detalle', keywords: ['error al guardar el documento', 'error al quitar el documento'] },
      { label: '"No hay documentos guardados para este folio" al generar o enviar el correo', keywords: ['no hay documentos guardados', 'no hay documentos para este folio'] },
      { label: 'Otro problema con documentos (PDFs)', keywords: [] },
    ],
  },
  {
    key: 'excel',
    icon: '📊',
    label: 'Importar / Exportar Excel',
    desc: 'Subir o descargar el Excel de folios.',
    problems: [
      { label: 'El Excel se importó pero faltan datos en varias columnas', keywords: ['faltan datos en columnas', 'faltan columnas'] },
      { label: '"Error al importar Excel" (mensaje genérico, sin detalle)', keywords: ['error al importar excel'] },
      { label: '"Solo se aceptan archivos Excel (.xls, .xlsx)"', keywords: ['solo se aceptan archivos excel', 'xls', 'xlsx'] },
      { label: 'Después de importar, parecen faltar filas del Excel original', keywords: ['faltan filas', 'faltan filas del excel'] },
      { label: 'Otro problema al importar o exportar Excel', keywords: [] },
    ],
  },
  {
    key: 'correos',
    icon: '📧',
    label: 'Correos (recordatorios y liberación)',
    desc: 'Avisos de vencimiento y el correo de liberación.',
    problems: [
      { label: '"No me llegó el recordatorio de vencimiento"', keywords: ['no me llego el recordatorio', 'recordatorio de vencimiento'] },
      { label: 'No se pudo crear o enviar el correo de liberación (error del servidor)', keywords: ['correo de liberacion', 'error del servidor'] },
      { label: 'Cambiaron los "Días de anticipación" en Configuración y no se aplicó nada', keywords: ['dias de anticipacion', 'no se aplico'] },
      { label: 'Otro problema con correos (recordatorios o liberación)', keywords: [] },
    ],
  },
  {
    key: 'push',
    icon: '🔔',
    label: 'Notificaciones push',
    desc: 'Avisos que llegan al navegador o celular.',
    problems: [
      { label: 'Activó las notificaciones pero no le llega nada', keywords: ['activo las notificaciones', 'no le llega nada'] },
      { label: '"Tu navegador no soporta notificaciones push"', keywords: ['navegador no soporta notificaciones', 'no soporta push'] },
      { label: '"Permiso de notificaciones denegado"', keywords: ['permiso de notificaciones denegado', 'notificaciones denegadas'] },
      { label: 'Otro problema con notificaciones push', keywords: [] },
    ],
  },
  {
    key: 'calendario',
    icon: '📅',
    label: 'Calendario Outlook',
    desc: 'El botón de agendar un folio en el calendario.',
    problems: [
      { label: 'El botón de calendario en una tarjeta individual no hace nada ("Próximamente")', keywords: ['boton de calendario', 'proximamente'] },
      { label: '"No se pudo crear el evento de calendario"', keywords: ['no se pudo crear el evento', 'evento de calendario'] },
      { label: 'Otro problema con el calendario de Outlook', keywords: [] },
    ],
  },
  {
    key: 'general',
    icon: '⚙️',
    label: 'General',
    desc: 'Historial y otros temas generales.',
    problems: [
      { label: 'No aparece ningún registro en el Historial', keywords: ['no aparece en el historial', 'historial vacio'] },
      { label: 'Al crear una cuenta nueva pide contraseña de mínimo 6 caracteres', keywords: ['minimo 6 caracteres', 'contrasena minima'] },
      { label: 'Otro problema general', keywords: [] },
    ],
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
