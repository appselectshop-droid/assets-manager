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
// Cada `problems` item es `{ label, keywords, note? }`:
// - `keywords`: frases/palabras que el buscador usa para llegar DIRECTO a
//   este problema específico (no solo a la categoría) — la resolución más
//   "particular" posible desde una búsqueda de texto libre.
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
      { label: 'No enciende o no prende', keywords: ['no enciende', 'no prende', 'no arranca', 'se apaga solo', 'se apaga sola'] },
      { label: 'La pantalla no da imagen o se ve mal', keywords: ['pantalla', 'no da imagen', 'se ve mal', 'pantalla rota', 'pantalla negra', 'se quema la pantalla'] },
      { label: 'La batería no carga o se descarga muy rápido', keywords: ['bateria', 'no carga', 'se descarga rapido', 'cargador'] },
      { label: 'El teclado o el mouse no funciona', keywords: ['teclado', 'mouse', 'no funciona el teclado', 'no funciona el mouse', 'no jala el mouse'] },
      { label: 'Otro problema de hardware', keywords: [] },
    ],
  },
  {
    key: 'software', icon: '💾', label: 'Software',
    desc: 'El sistema operativo o un programa instalado en tu equipo.',
    keywords: ['software', 'programa', 'windows', 'sistema operativo'],
    problems: [
      { label: 'Windows lento o con errores', keywords: ['windows lento', 'lento', 'lenta', 'con errores', 'se congela', 'pantalla azul'] },
      { label: 'Un programa no abre o se cierra solo', keywords: ['no abre', 'se cierra solo', 'programa no abre', 'no responde'] },
      { label: 'Outlook no me manda o no me llegan correos', keywords: ['outlook', 'no manda correos', 'no llegan correos', 'no recibo correos', 'no me llegan correos', 'no me llega el correo'] },
      { label: 'OneDrive no guarda o no sincroniza mis archivos', keywords: ['onedrive', 'no sincroniza', 'no guarda mis archivos', 'archivos no aparecen'] },
      { label: 'Teams no tiene audio o video en las llamadas', keywords: ['teams', 'no tengo audio', 'no tengo video', 'no se escucha', 'no se ve en teams'] },
      { label: 'Macros o plantillas de Excel', keywords: ['macro', 'macros', 'plantilla de excel', 'excel'] },
      {
        label: 'No encuentro Word, Excel o PowerPoint en mi computadora',
        keywords: ['no tengo word', 'no tengo excel', 'no tengo powerpoint', 'no encuentro office', 'no viene instalado office', 'no tengo office'],
        note: {
          text: 'Esto casi siempre pasa porque tu plan de Microsoft 365 solo incluye la versión web (desde el navegador), no el programa instalado. No es una falla — se pide como Solicitud de Recurso, no como ticket.',
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
    problems: 'apps',
  },
  {
    key: 'red', icon: '📶', label: 'Red / Conectividad',
    desc: 'WiFi, impresora o VPN.',
    keywords: ['red', 'conectividad'],
    problems: [
      { label: 'No tengo WiFi o internet', keywords: ['wifi', 'internet', 'no conecta', 'no hay internet', 'sin senal', 'no navega'] },
      { label: 'La impresora no imprime', keywords: ['impresora', 'no imprime', 'imprimir'] },
      { label: 'La VPN no conecta', keywords: ['vpn', 'no conecta la vpn'] },
      { label: 'Otro problema de red', keywords: [] },
    ],
  },
  {
    key: 'cuenta_acceso', icon: '🔐', label: 'Cuenta / Acceso',
    desc: 'Ya tienes la cuenta pero no puedes entrar.',
    keywords: ['cuenta', 'acceso'],
    problems: [
      { label: 'Olvidé mi contraseña', keywords: ['contrasena', 'password', 'olvide mi contrasena'] },
      { label: 'Mi cuenta está bloqueada', keywords: ['bloqueado', 'bloqueada', 'cuenta bloqueada', 'no puedo entrar', 'no me deja entrar'] },
      { label: 'No tengo permisos para algo', keywords: ['permisos', 'no tengo permisos'] },
      { label: 'Otro problema de cuenta', keywords: [] },
    ],
  },
  {
    key: 'seguridad', icon: '🛡️', label: 'Seguridad',
    desc: 'Un correo raro, un enlace sospechoso o crees que alguien entró a tu cuenta.',
    keywords: ['seguridad', 'phishing', 'virus'],
    problems: [
      { label: 'Recibí un correo sospechoso (puede ser phishing)', keywords: ['phishing', 'correo sospechoso', 'correo raro', 'suplantacion'] },
      { label: 'Creo que alguien entró a mi cuenta sin permiso', keywords: ['me hackearon', 'hackearon mi cuenta', 'entraron a mi cuenta', 'acceso no autorizado', 'hackeada'] },
      { label: 'Un enlace o mensaje raro me pidió mi contraseña', keywords: ['enlace sospechoso', 'me pidio mi contrasena', 'link raro', 'link sospechoso'] },
      { label: 'Otro problema de seguridad', keywords: [] },
    ],
  },
  {
    key: 'erp', icon: '🏭', label: 'ERP',
    desc: 'El sistema ERP interno — módulos, reportes, accesos.',
    keywords: ['erp', 'sistema administrativo'],
    problems: [
      { label: 'No puedo entrar al ERP', keywords: ['no puedo entrar al erp', 'erp no abre', 'no abre el erp'] },
      { label: 'Un módulo no funciona', keywords: ['modulo', 'modulos', 'modulo no funciona'] },
      { label: 'Necesito un reporte y no sale', keywords: ['reporte', 'reporte del erp', 'no sale el reporte'] },
      { label: 'Otro problema del ERP', keywords: [] },
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
