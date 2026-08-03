const router = require('express').Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const Ticket = require('../models/Ticket');
const TicketResolutionOption = require('../models/TicketResolutionOption');
const InternalApp = require('../models/InternalApp');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const employeeAuth = require('../middleware/employeeAuth');
const { notifyTelegram } = require('../utils/telegram');
const { notifyEmail } = require('../utils/graphMail');
const { sendPushToEmployee, sendPushToUser } = require('../utils/webPush');
const { uploadBuffer, downloadStream, deleteFile } = require('../utils/gridfs');
const { buildTicketNotificationEmail, buildExternalTicketNotificationEmail } = require('../utils/emailTemplates');
const { GERENTE_SISTEMAS_EMAIL } = require('../utils/pdfBranding');
const { buildBiProjectDocx } = require('../utils/biProjectDocx');
const logAction = require('../utils/audit');

// Aviso por correo (Microsoft Graph) de un ticket nuevo — canal adicional a
// Telegram, no lo reemplaza. Ya no se manda a una lista fija de personas
// (el problema del sistema anterior — ver captura del usuario, mandaba a
// una lista vieja sin importar de qué era el ticket): se calcula según
// quién es "área ERP" (lider.erp/analista.erp, mismo criterio que
// isErpOnlyUser) vs "área sistema-IT" (el resto de admins de Sistemas).
const SOLICITUD_PAGOS_APP_NAME = 'solicitud de pagos';

// "Solicitud de Pagos" — pedido explícito del usuario: cada apartado del
// wizard (ver PAYMENT_REQUEST_SUBAREAS en frontend/src/config/
// ticketCategories.js) lo atiende un equipo externo a Sistemas, nada que
// ver con el enrutamiento general de abajo. Se guarda en
// `ticket.otherTypeDetail` (el mismo campo libre que ya se usa para
// "Otro"/"Impresoras") y aquí solo se compara por substring — tolerante a
// como esté redactado el label exacto en el frontend.
//
// `audience` decide QUÉ correo recibe cada quien (2026-07-22, pedido
// explícito): 'sistemas' = la plantilla técnica de siempre (SLA, prioridad,
// botón al panel) — lider.erp/analista.erp cuentan como Sistemas/ERP/BI
// para esto, aunque el apartado sea de "Solicitud de Pagos"; 'externo' = la
// plantilla amigable sin jerga técnica ni botón al panel (gerente.
// contabilidad/pagos no tienen sesión en Assets Manager y un correo con
// tono de alerta de IT los alarmaría sin necesidad).
const SOLICITUD_PAGOS_RECIPIENTS = [
  { match: 'usuario', emails: ['lider.erp@selectshop.com.mx', 'analista.erp@selectshop.com.mx'], audience: 'sistemas' },
  { match: 'costo', emails: ['gerente.contabilidad@selectshop.com.mx'], audience: 'externo' },
  { match: 'motivo de pago', emails: ['gerente.contabilidad@selectshop.com.mx'], audience: 'externo' },
  { match: 'proveedor', emails: ['pagos@selectshop.com.mx'], audience: 'externo' },
];

// "Ventas" — a diferencia de Solicitud de Pagos, aquí NO importa el
// apartado que haya elegido quien reporta (Aprobación de Solicitudes /
// Cotizaciones.../ Acceso...): pedido explícito del usuario, TODO lo de
// esta app llega solo a este correo, sin excepción.
const VENTAS_APP_NAME = 'ventas';
const VENTAS_EMAIL = 'sistemas.2@selectshop.com.mx';

// "Gestor de Constancias Aduaneras" — mismo criterio que Ventas: un solo
// correo, sin importar el apartado (login/cuentas, permisos, documentos,
// Excel, correos, push, calendario, general).
const GESTOR_CONSTANCIAS_APP_NAME = 'gestor de constancias aduaneras';
const GESTOR_CONSTANCIAS_EMAIL = 'sistemas.3@selectshop.com.mx';

// "Worky" — plataforma de RH/Nómina, ajena a Sistemas (pedido explícito
// del usuario 2026-07-28) — mismo criterio que "Solicitud de Pagos":
// audience 'externo' (plantilla de correo amigable, sin jerga de SLA ni
// botón al panel — Nóminas no tiene sesión ahí), y por lo tanto excluida
// de Tickets/Mis Tickets (ver classifyTicketAudience más abajo), mostrada
// en su lugar en Mis Solicitudes.
const WORKY_APP_NAME = 'worky';
const WORKY_EMAILS = ['jefa.nominas@selectshop.com.mx', 'nominas.5@selectshop.com.mx', 'nominas.2@selectshop.com.mx'];

// "Soporte BI" — módulo independiente (como Hardware/Software), NO un
// InternalApp con apartados, así que se enruta directo por `ticketType`
// (ver getTicketEmailRecipients de abajo), no por nombre de app. Pedido
// explícito del usuario 2026-07-23: los 2 correos SIEMPRE reciben, sin
// importar si es "Solicitar proyecto" o "Solicitar bases de datos".
const BI_EMAILS = ['lider.bi@selectshop.com.mx', 'analista.bi2@selectshop.com.mx'];

// Felipe (sistemas.4) — pedido explícito del usuario (2026-07-24): "él
// atiende los de allá y no atiende piso 13 ni nada de eso", y de paso
// ("evidentemente sistemas.3, becario.sistemas y lider.infra.soporte no
// debemos recibir los de Tepotz"): Tepotzotlán II/III/IV es EXCLUSIVO de
// Felipe, no se junta con el resto de Sistemas — mismo criterio que
// Seguridad/BI/Ventas/Gestor de Constancias arriba. Fuera de esas 3
// sucursales, Felipe sigue siendo admin normal y recibe todo lo demás
// como cualquier otro de Sistemas.
const FELIPE_EMAIL = 'sistemas.4@selectshop.com.mx';
const FELIPE_OFFICES = ['TEPOTZOTLAN II', 'TEPOTZOTLAN III', 'TEPOTZOTLAN IV'];

// Cadena de escalamiento de tickets — pedido explícito y urgente del
// usuario (2026-08-03): no cualquiera puede escalarle a cualquiera, hay
// una jerarquía fija por equipo. Mismo patrón que GERENTE_SISTEMAS_EMAIL/
// FELIPE_EMAIL de arriba (no existe un campo de rol granular en User —
// son cuentas reales identificadas por correo). `SISTEMAS_3_EMAIL` es la
// misma cuenta real que `GESTOR_CONSTANCIAS_EMAIL` de arriba (Lilly
// Arroyo) — se deja su propia constante aquí por claridad, aunque
// apunten al mismo correo.
const SISTEMAS_3_EMAIL = 'sistemas.3@selectshop.com.mx';
const BECARIO_SISTEMAS_EMAIL = 'becario.sistemas@selectshop.com.mx';
const LIDER_INFRA_SOPORTE_EMAIL = 'lider.infra.soporte@selectshop.com.mx';
const LIDER_ERP_EMAIL = 'lider.erp@selectshop.com.mx';
const LIDER_BI_EMAIL = 'lider.bi@selectshop.com.mx';

// Factorizado aparte de getTicketEmailRecipients de abajo porque también
// hace falta de forma SÍNCRONA al crear el ticket (ver POST /mine), para
// fijar `requestAudience` (ver Ticket.js) sin esperar al cálculo de
// destinatarios de correo (ese sí necesita await por el enrutamiento
// general de Sistemas). Todas las reglas de abajo ya eran síncronas —
// únicamente el fallback final (línea ~140) necesita la base de datos, y
// ese siempre cae en 'sistemas'.
function findSolicitudPagosRule(otherTypeDetail) {
  const subarea = (otherTypeDetail || '').trim().toLowerCase();
  return SOLICITUD_PAGOS_RECIPIENTS.find((r) => subarea.includes(r.match)) || null;
}
function classifyTicketAudience(ticketType, appName, otherTypeDetail) {
  if (ticketType === 'seguridad' || ticketType === 'soporte_bi') return 'sistemas';
  const normalizedAppName = (appName || '').trim().toLowerCase();
  if (normalizedAppName.includes(SOLICITUD_PAGOS_APP_NAME)) {
    const rule = findSolicitudPagosRule(otherTypeDetail);
    if (rule) return rule.audience;
  }
  if (normalizedAppName.includes(WORKY_APP_NAME)) return 'externo';
  return 'sistemas';
}

// Regresa `{ emails, audience }` — `audience` decide qué plantilla de
// correo usar (ver buildTicketNotificationEmail/buildExternalTicketNotifi-
// cationEmail en utils/emailTemplates.js): 'sistemas' para Sistemas/ERP/BI
// (la plantilla técnica de siempre, sin cambios), 'externo' para equipos
// genuinamente ajenos a Sistemas.
async function getTicketEmailRecipients(ticket, appName, employeeOffice, sharedAccountResponsibleEmails) {
  // Seguridad: por ahora EXCLUSIVO al Gerente de Sistemas (Bruno) — pedido
  // explícito, "por el momento" (puede cambiar después). No pasa por el
  // enrutamiento de área de abajo, ni se junta con el resto de Sistemas.
  if (ticket.ticketType === 'seguridad') return { emails: [GERENTE_SISTEMAS_EMAIL], audience: 'sistemas' };

  // Soporte BI: exclusivo a lider.bi/analista.bi2, sin importar si es
  // "Solicitar proyecto" o "Solicitar bases de datos" — mismo criterio que
  // Seguridad (root ticketType, no depende de ningún InternalApp).
  if (ticket.ticketType === 'soporte_bi') return { emails: BI_EMAILS, audience: 'sistemas' };

  const normalizedAppName = (appName || '').trim().toLowerCase();

  // Por substring, no igualdad exacta — bug real encontrado: un ticket de
  // "Ventas" SÍ le llegó a todo Sistemas en vez de solo a sistemas.2, porque
  // el nombre real de la app en el catálogo (Aplicaciones Internas) no
  // coincidía letra por letra con la constante de aquí abajo (mayúsculas,
  // espacios de más, etc.) y la comparación exacta (===) nunca la
  // reconocía. Con .includes() basta con que el nombre contenga la
  // palabra clave para reconocerla, sin depender de que quede idéntica.
  // Solicitud de Pagos: enrutamiento EXCLUSIVO por apartado — no le llega
  // a Sistemas ni al Gerente de Sistemas, cada equipo recibe solo lo suyo.
  if (normalizedAppName.includes(SOLICITUD_PAGOS_APP_NAME)) {
    const rule = findSolicitudPagosRule(ticket.otherTypeDetail);
    if (rule) return { emails: rule.emails, audience: rule.audience };
    // Apartado desconocido/dato viejo — cae al enrutamiento general de abajo
    // en vez de perderse sin avisar a nadie.
  }

  // Ventas: exclusivo a un solo correo, sin importar el apartado.
  if (normalizedAppName.includes(VENTAS_APP_NAME)) return { emails: [VENTAS_EMAIL], audience: 'sistemas' };

  // Gestor de Constancias Aduaneras: mismo criterio, un solo correo.
  if (normalizedAppName.includes(GESTOR_CONSTANCIAS_APP_NAME)) return { emails: [GESTOR_CONSTANCIAS_EMAIL], audience: 'sistemas' };

  // Worky: ajeno a Sistemas, va directo a Nóminas — audience 'externo'
  // (plantilla amigable, sin jerga de SLA ni botón al panel).
  if (normalizedAppName.includes(WORKY_APP_NAME)) return { emails: WORKY_EMAILS, audience: 'externo' };

  const recipients = new Set();
  if (ticket.ticketType === 'erp') {
    const erpUsers = await User.find({
      role: { $ne: 'admin' },
      canManagePlatformAccountsErp: true,
      canManageGmailAccounts: false,
      canManagePlatformAccounts: false,
    }).select('email');
    erpUsers.forEach((u) => recipients.add(u.email));
  } else if (sharedAccountResponsibleEmails && sharedAccountResponsibleEmails.length) {
    // Cuenta de uso múltiple con responsable(s) configurado(s) a mano (ver
    // Employee.sharedAccountResponsibleUsers, editable desde
    // CuentasCompartidas.jsx) — pedido explícito del usuario (2026-07-28):
    // el enrutamiento automático por oficina falló una vez ("Auxiliar
    // Devoluciones" le llegó a sistemas.3 en vez de a Felipe), así que
    // cuando está configurado, GANA sobre Felipe/Tepotzotlán y sobre "todo
    // Sistemas" — Sistemas ya dijo explícitamente quién es el dueño real.
    // Puede ser más de uno (ej. "somos 3 los responsables" de las tablets
    // de recepción) — todos reciben el mismo aviso.
    sharedAccountResponsibleEmails.forEach((email) => recipients.add(email));
  } else if (FELIPE_OFFICES.includes((employeeOffice || '').toUpperCase())) {
    // Tepotzotlán II/III/IV es exclusivo de Felipe — pedido explícito del
    // usuario (2026-07-24): "evidentemente sistemas.3, becario.sistemas y
    // lider.infra.soporte no debemos recibir los de Tepotz". No se junta
    // con el resto de Sistemas, mismo criterio que ya usan Seguridad/BI/
    // Ventas/Gestor de Constancias arriba (una lista exclusiva, no un
    // filtro sobre la lista general).
    recipients.add(FELIPE_EMAIL);
  } else {
    const sistemasUsers = await User.find({ role: 'admin' }).select('email');
    sistemasUsers.forEach((u) => recipients.add(u.email));
    recipients.delete(FELIPE_EMAIL);
  }
  return { emails: [...recipients], audience: 'sistemas' };
}

// Un ticket ya asignado sigue siendo "de quien lo está atendiendo" — pedido
// explícito: aunque cualquiera con acceso a ese ticket (admin, o ERP-only
// para los de tipo 'erp') puede VERLO, solo quien lo tiene asignado (o el
// Gerente de Sistemas, con visibilidad total) puede modificarlo/
// reasignarlo/eliminarlo. Un ticket SIN asignar sigue abierto a cualquiera
// (alguien tiene que poder tomarlo).
//
// Bug real encontrado (2026-07-24): un ticket quedó asignado a un usuario
// ERP-only (rol 'viewer', ve solo tickets tipo 'erp' por canViewTicket) —
// como el ticket era de otro tipo, ese usuario ni siquiera podía verlo, y
// como GERENTE_SISTEMAS_EMAIL no tenía una cuenta real dada de alta,
// NADIE podía reasignarlo ni eliminarlo — quedó atorado 13 días (TICK-
// 4E1372, reportado por el usuario). Se agrega `role === 'admin'` como
// vía de rescate real (no depende de que exista una cuenta específica) —
// cualquier administrador ya puede reasignar o eliminar un ticket
// atorado, sin esperar a que exista/loguee la cuenta de gerente.sistemas.
//
// Corrección explícita del usuario (2026-08-03): "sistemas no debería
// estar en ERP y viceversa, el único que debe andar en todo es
// gerente.sistemas" — encontrado al reportar que un ticket ERP asignado a
// un analista no lo podía tocar el OTRO analista/líder de ERP: el
// `role === 'admin'` de arriba le daba a CUALQUIER admin de Sistemas
// acceso total a CUALQUIER ticket (incluido ERP), pero ERP nunca tuvo ese
// mismo privilegio de "equipo" entre ellos — cada ticket ERP solo lo
// podía tocar quien lo tenía asignado, aunque fuera su propio compañero.
// Un ticket 'erp' (o cualquiera escalado a la cola de ERP) ahora es
// exclusivo del equipo de ERP entre sí — ni un admin de Sistemas entra
// ahí ya, salvo que se le haya escalado de vuelta a Sistemas.
function canManageTicket(req, ticket) {
  if (req.user.email === GERENTE_SISTEMAS_EMAIL || req.user.canViewManagerDashboard) return true;

  const erpTicket = (ticket.escalatedToArea || ticket.ticketType) === 'erp';
  if (erpTicket) return isErpOnlyUser(req.user);

  if (req.user.role === 'admin') return true;
  if (!ticket.assignedTo) return true;
  return String(ticket.assignedTo) === String(req.user.id);
}

// Mismo criterio que isErpOnlyUser() en frontend/src/components/Layout.jsx —
// alguien que SOLO tiene el permiso de Plataformas ERP (no admin, no
// Gmail/Plataformas normales). lider.erp/analista.erp entran por aquí.
function isErpOnlyUser(user) {
  return user.role !== 'admin'
    && !user.canManageGmailAccounts
    && !user.canManagePlatformAccounts
    && !!user.canManagePlatformAccountsErp;
}

// Mismo criterio que isBiOnlyUser() en frontend/src/components/Layout.jsx —
// pedido explícito del usuario (2026-07-30): BI necesita entrar al sistema
// para gestionar sus propias solicitudes de "Soporte BI" (Bases de Datos/
// Proyectos, ver BiLayout.jsx), pero no gestiona cuentas ni ve el resto
// del panel — mismo patrón que ERP-only, con su propio permiso dedicado.
function isBiOnlyUser(user) {
  return user.role !== 'admin' && !!user.canManageBiRequests;
}

// Corrección explícita del usuario (2026-07-30): "el área de Sistemas se
// consolida en Infraestructura y Soporte, ERP y BI... aunque somos parte
// de la misma área, trabajamos en diferentes cosas" — son 3 flujos
// separados de verdad, no "Sistemas ve todo menos lo de ERP". Partición
// completa en los 3 sentidos: ERP-only ve ÚNICAMENTE 'erp', BI-only
// ÚNICAMENTE 'soporte_bi', e Infraestructura y Soporte (el resto de
// admins) ve todo MENOS esos 2 — antes solo se excluía 'erp' de esa
// última rama, dejando que cualquier admin viera also los tickets de BI,
// justo lo que se corrigió aquí. El único que ve los 3 flujos completos
// es quien tiene canViewManagerDashboard (gerente.sistemas) — antes ni
// siquiera Gerencia.jsx veía los tickets de ERP porque caía en esta misma
// función con el criterio viejo, un bug real que esto también corrige.
// Ajuste explícito del usuario (2026-08-03): "Bases de Datos" y "Proyecto"
// de BI son solicitudes desde la perspectiva del empleado, pero para
// Sistemas funcionan internamente como cualquier otro ticket — folio,
// conversación, se pueden eliminar. La conversación de los 3 caminos de BI
// (Soporte/Bases de Datos/Proyecto) ahora vive ÚNICAMENTE en el Tablero de
// Tickets (ver BiRequestDetailModal.jsx, que ya no la muestra) — así que
// tanto un admin normal (Infraestructura y Soporte) como BI mismo
// necesitan ver `soporte_bi` completo aquí, no solo "Soporte". Las páginas
// especializadas de BI (BiDatabaseRequests.jsx/BiProjects.jsx) siguen
// existiendo para lo que Tickets no cubre (aprobar/rechazar, etapas,
// entregar archivo) — quedan como el historial/área de trabajo de BI, sin
// duplicar el chat.
// Extensión aditiva (2026-08-03) para el escalamiento entre áreas: cuando
// un ticket se escala a otra área "porque no compete" (ver
// getEscalationTargets/PUT :id/escalate más abajo), queda SIN asignar y
// pasa a la cola de esa área — `escalatedToArea` manda sobre el
// `ticketType` original para decidir quién lo ve. Un ticket 'erp' escalado
// a Sistemas ya no lo debe ver ERP; uno normal escalado a ERP/BI ya sí.
function canViewTicket(req, ticket) {
  if (req.user.canViewManagerDashboard) return true;
  if (isErpOnlyUser(req.user)) {
    if (ticket.escalatedToArea) return ticket.escalatedToArea === 'erp';
    return ticket.ticketType === 'erp';
  }
  if (isBiOnlyUser(req.user)) {
    if (ticket.escalatedToArea) return ticket.escalatedToArea === 'bi';
    return ticket.ticketType === 'soporte_bi';
  }
  // Sistemas (admin normal, incl. becario.sistemas vía canManageTickets):
  // ve todo lo que no sea puramente ERP — salvo que ERP se lo haya
  // escalado de vuelta explícitamente. Un ticket normal escalado de lado
  // (a ERP o BI) sigue viéndose aquí también (tablero unificado ya
  // existente, sin cambio de comportamiento para eso).
  return ticket.ticketType !== 'erp' || ticket.escalatedToArea === 'sistemas';
}

// Devuelve los destinos válidos de escalamiento para quien pide la
// acción — pedido explícito del usuario (2026-08-03): cadena fija por
// rol, validada en el servidor (PUT /:id/escalate), no solo sugerida en
// el frontend.
//   { kind: 'persona', email, label } — reasigna el ticket a esa persona.
//   { kind: 'area', area, label }     — el caso no compete a esta área;
//                                        el ticket queda sin asignar.
//   { kind: 'proveedor', label }      — versión ligera (nota libre), sin
//                                        cambiar asignación ni visibilidad;
//                                        el proceso completo de
//                                        proveedores/garantías queda
//                                        pendiente para otra sesión.
function getEscalationTargets(user) {
  const targets = [];

  if (isBiOnlyUser(user)) {
    // Pedido explícito del usuario: solo lider.bi puede escalar — nadie
    // más del equipo de BI, ni siquiera a la categoría de Escalamiento
    // (ver frontend/src/pages/TicketsLayout.jsx).
    if (user.email !== LIDER_BI_EMAIL) return [];
    targets.push({ kind: 'persona', email: GERENTE_SISTEMAS_EMAIL, label: 'Gerente de Sistemas' });
    targets.push({ kind: 'area', area: 'erp', label: 'ERP (no le compete a BI)' });
    targets.push({ kind: 'area', area: 'sistemas', label: 'Sistemas (no le compete a BI)' });
    return targets;
  }

  if (isErpOnlyUser(user)) {
    if (user.email === LIDER_ERP_EMAIL) {
      targets.push({ kind: 'persona', email: GERENTE_SISTEMAS_EMAIL, label: 'Gerente de Sistemas' });
    } else {
      // analista.erp (o cualquier otro analista ERP futuro).
      targets.push({ kind: 'persona', email: LIDER_ERP_EMAIL, label: 'Líder de ERP' });
    }
    targets.push({ kind: 'area', area: 'bi', label: 'BI (no le compete a ERP)' });
    targets.push({ kind: 'area', area: 'sistemas', label: 'Sistemas (no le compete a ERP)' });
    return targets;
  }

  // Infraestructura y Soporte (Sistemas): cadena fija becario -> sistemas.3/
  // sistemas.4 -> lider.infra.soporte -> gerente.sistemas. Corrección
  // explícita del usuario (2026-08-03, "se me olvidó sistemas.4"):
  // sistemas.4 (Felipe) es su propio nivel, un peldaño abajo de
  // sistemas.3/lider.infra.soporte, no arriba de gerente.sistemas.
  // Cualquier otro admin de Sistemas no nombrado explícitamente se trata
  // como el nivel "soporte" genérico (mismo nivel que sistemas.3).
  if (user.email === GERENTE_SISTEMAS_EMAIL || user.canViewManagerDashboard) {
    // Tope de la cadena interna — no tiene a quién escalar hacia arriba.
  } else if (user.email === LIDER_INFRA_SOPORTE_EMAIL) {
    targets.push({ kind: 'persona', email: GERENTE_SISTEMAS_EMAIL, label: 'Gerente de Sistemas' });
  } else if (user.email === BECARIO_SISTEMAS_EMAIL) {
    targets.push({ kind: 'persona', email: SISTEMAS_3_EMAIL, label: 'Sistemas 3' });
    targets.push({ kind: 'persona', email: LIDER_INFRA_SOPORTE_EMAIL, label: 'Líder de Infraestructura y Soporte' });
    targets.push({ kind: 'persona', email: FELIPE_EMAIL, label: 'Sistemas 4' });
  } else if (user.email === FELIPE_EMAIL) {
    targets.push({ kind: 'persona', email: SISTEMAS_3_EMAIL, label: 'Sistemas 3' });
    targets.push({ kind: 'persona', email: LIDER_INFRA_SOPORTE_EMAIL, label: 'Líder de Infraestructura y Soporte' });
  } else {
    targets.push({ kind: 'persona', email: LIDER_INFRA_SOPORTE_EMAIL, label: 'Líder de Infraestructura y Soporte' });
    targets.push({ kind: 'persona', email: GERENTE_SISTEMAS_EMAIL, label: 'Gerente de Sistemas' });
  }
  targets.push({ kind: 'area', area: 'erp', label: 'ERP (no le compete a Sistemas)' });
  targets.push({ kind: 'area', area: 'bi', label: 'BI (no le compete a Sistemas)' });
  targets.push({ kind: 'proveedor', label: 'Proveedores (garantía / soporte externo)' });
  return targets;
}

// Aplica sobre un ticket ya existente los campos que derivan de una
// Categoría de Falla (SLA): nivel, prioridad y fechas límite (el reloj corre
// desde `createdAt`, no desde que se clasificó). Compartido entre la
// clasificación manual de un admin (PUT /:id/sla-category) y la automática al
// reportar (POST /mine, según el problema específico que eligió quien
// reporta — ver `sla` en config/ticketCategories.js del frontend). Regresa
// `false` si `slaCategory` no es null/undefined pero tampoco es una
// categoría real del catálogo, para que quien llama decida qué hacer
// (la ruta de admin lo rechaza con 400; la de creación simplemente lo
// ignora, sin tronar el ticket por un valor raro).
// `blocksWork` ya NO lo marca quien reporta (checkbox quitado del formulario,
// pedido explícito del usuario: "el SLA detectaba si sí le impide trabajar o
// no") — se deriva de la prioridad de la Categoría de Falla elegida: 'alta'
// y 'critica' SÍ bloquean (Hardware Local, Cuentas Críticas/ERP-SAE,
// Infraestructura Local, CCTV, Incidentes de Seguridad, Servidores y Core),
// 'baja'/'media' no (Cuentas y Accesos, Ofimática, Periféricos, Software,
// Red Local). Sin clasificar (sin `sla` en el problema elegido, o el
// catch-all "Otro"), queda en `false` por default hasta que se clasifique.
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
  const base = ticket.createdAt.getTime();
  ticket.responseDueAt = new Date(base + row.tRespuestaMin * 60000);
  ticket.resolutionDueAt = new Date(base + row.tResolucionMin * 60000);
  return true;
}

// internalNotes es la bitácora técnica del equipo — nunca debe llegar al
// empleado. Ticket.find()/findById() regresan TODOS los campos por default,
// así que hay que quitarlo a mano en cada respuesta del lado empleado.
function stripInternal(ticket) {
  const obj = ticket.toObject ? ticket.toObject() : ticket;
  delete obj.internalNotes;
  return obj;
}

// Incidente real (2026-07-31): "Tickets" tardaba hasta 3 minutos en
// cargar para cualquiera — encontrado en vivo que NINGÚN listado excluía
// los campos Buffer (adjuntos embebidos directo en el documento:
// screenshot del reporte, comprobante bancario, el .docx generado de
// Solicitud de Proyecto BI). Con solo 32 tickets en toda la colección,
// pero varios con adjuntos, el promedio ya era de ~200KB por documento —
// medido en vivo: la MISMA query tardaba 58s completa vs. 1.1s excluyendo
// estos campos (50x). Ningún listado necesita los bytes reales: el
// frontend solo usa `*MimeType`/`*FileName` (para saber si hay algo que
// mostrar) — el contenido se pide aparte, ya bajo demanda, por las rutas
// dedicadas (GET /:id/attachment, /:id/bank-proof-attachment,
// /:id/bi-document) cuando alguien de verdad abre ese adjunto.
const LIST_EXCLUDE_FIELDS = '-attachmentData -bankProofData -biDocData -messages.attachmentData';

const ALLOWED_ATTACHMENT_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'application/pdf'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — de sobra para una foto de celular
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_ATTACHMENT_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan JPG, PNG, HEIC o PDF como evidencia'));
    }
    cb(null, true);
  },
});

// Solo para adjuntos de Notas internas — pedido explícito del usuario
// (2026-07-24): a diferencia de `upload` de arriba, aquí SÍ se acepta
// video y con un límite mucho mayor, porque el archivo no se guarda
// embebido en el Ticket (ver utils/gridfs.js) — no choca con el límite de
// 16MB por documento de MongoDB.
const ALLOWED_NOTE_ATTACHMENT_MIME = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif',
  'video/mp4', 'video/quicktime', 'video/webm',
];
const uploadNoteAttachment = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 80 * 1024 * 1024 }, // 80MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_NOTE_ATTACHMENT_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan JPG, PNG, HEIC, MP4, MOV o WEBM'));
    }
    cb(null, true);
  },
});

// Base de datos entregada por BI (Excel/CSV/PDF) — config aparte, mismo
// criterio que uploadNoteAttachment: un export real puede pesar bastante
// más que una foto, y se guarda en GridFS (bucket 'biDeliverables'), no
// embebido.
const ALLOWED_BI_DELIVERABLE_MIME = [
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
  'application/vnd.ms-excel', // .xls
  'text/csv',
  'application/pdf',
];
const uploadBiDeliverable = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_BI_DELIVERABLE_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan XLSX, XLS, CSV o PDF'));
    }
    cb(null, true);
  },
});

function assetLabel(asset) {
  if (!asset) return '';
  return [asset.brand, asset.model].filter(Boolean).join(' ') + (asset.serialNumber ? ` (${asset.serialNumber})` : '');
}

// Link directo al ticket dentro del panel — pedido explícito del usuario
// (2026-07-24): que el aviso de Telegram ya no diga solo "Revisa en
// Tickets" a secas, sino que lleve directo al ticket en cuestión. Reusa el
// mismo mecanismo de `?ticket=<id>` que ya abre el detalle solo (ver
// TicketsLayout.jsx, agregado para las notificaciones push).
//
// Vía /login?next=... (mismo patrón ya usado en el correo de aviso, ver
// línea ~526 de este archivo) y NO directo a /tickets/general: quien abre
// este link desde el celular (típico con Telegram) puede no tener sesión
// iniciada en ese navegador — yendo directo a la ruta protegida,
// PrivateRoute solo muestra un 404 genérico sin forma de continuar. Con
// /login?next=, ve el login real y, al entrar, sigue derecho al ticket en
// vez de quedarse en el Dashboard.
function ticketAdminUrl(ticketId) {
  const path = `/tickets/general?ticket=${ticketId}`;
  return `${process.env.FRONTEND_URL}/login?next=${encodeURIComponent(path)}`;
}

// Cierre automático — un ticket "resuelto" sin que el empleado responda en
// AUTO_CLOSE_DAYS pasa solo a "cerrado" (se entiende que sí quedó bien). Con
// el pedido de 2026-08-03 (el ticket ya no cierra hasta que el empleado
// califica, ver POST /:id/satisfaction), esta es la ÚNICA otra forma de que
// un ticket llegue a "cerrado" sin calificación — el respaldo para que uno
// no se quede en "resuelto" para siempre si nadie vuelve a entrar a
// calificarlo. No hay cron real en este proyecto, así que se revisa
// "perezosamente": cada vez que se pide la lista de tickets (admin o
// empleado), primero se cierran los que ya cumplieron el plazo. Un mensaje
// nuevo del empleado ya reabre el ticket (ver POST /:id/messages) antes de
// que esto aplique, así que nunca cierra uno que sigue en curso.
const AUTO_CLOSE_DAYS = 5;
async function autoCloseStaleResolved() {
  const cutoff = new Date(Date.now() - AUTO_CLOSE_DAYS * 24 * 60 * 60 * 1000);
  await Ticket.updateMany(
    { status: 'resuelto', resolvedAt: { $lte: cutoff } },
    { $set: { status: 'cerrado' } },
  );
}

// Equipo(s) asignado(s) a quien reporta — el formulario lo usa para
// preguntar "¿sobre cuál equipo es esto?" SOLO cuando hay más de uno (ej.
// celular Y laptop), para no seguir ligando ambos al ticket cuando el
// problema es de uno solo. Con 0 o 1 equipo no hace falta preguntar.
router.get('/mine/assets', employeeAuth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ employee: req.employee.employeeRef, active: true })
      .populate('asset', 'type brand model serialNumber');
    const assets = assignments.map((a) => a.asset).filter(Boolean)
      .map((a) => ({ _id: a._id, type: a.type, brand: a.brand, model: a.model, serialNumber: a.serialNumber }));
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Requiere sesión de EMPLEADO (portal Mis Tickets, ver employeeAuth.js) —
// ya no es anónimo. La identidad (nombre/employeeRef) viene del propio JWT,
// nunca de lo que mande el formulario, así que a diferencia de la versión
// anterior no hay nada que "emparejar por nombre": el activo(s) asignado(s)
// se busca directo por el _id real del empleado autenticado.
router.post('/mine', employeeAuth, (req, res, next) => {
  // `fields`, no `single`: "Alta de Proveedores" pide 2 adjuntos aparte (CSF
  // + comprobante de datos bancarios) — el resto de tickets sigue mandando
  // solo `attachment`, `bankProofAttachment` simplemente llega vacío.
  upload.fields([{ name: 'attachment', maxCount: 1 }, { name: 'bankProofAttachment', maxCount: 1 }])(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la evidencia' });
    next();
  });
}, async (req, res) => {
  try {
    const body = req.body || {};
    const attachmentFile = req.files?.attachment?.[0];
    const bankProofFile = req.files?.bankProofAttachment?.[0];
    if (!Ticket.TICKET_TYPES.includes(body.ticketType)) {
      return res.status(400).json({ message: 'Selecciona el tipo de soporte' });
    }
    const otherTypeDetail = (body.otherTypeDetail || '').trim();
    if (body.ticketType === 'otro' && !otherTypeDetail) {
      return res.status(400).json({ message: 'Especifica de qué se trata el ticket' });
    }
    // Las impresoras no son equipo asignado a una persona (a diferencia de
    // Hardware) — no hay forma de saber cuál es sin que lo diga quien
    // reporta. Se reusa el mismo campo libre `otherTypeDetail` (ya se
    // guarda/muestra sin importar el tipo de ticket, ver Tickets.jsx admin).
    if (body.ticketType === 'impresora' && !otherTypeDetail) {
      return res.status(400).json({ message: 'Especifica cuál impresora es' });
    }
    const subject = (body.subject || '').trim();
    if (!subject) return res.status(400).json({ message: 'Falta el asunto del ticket' });

    // Cuenta de USO MÚLTIPLE (ej. tablet compartida en Mesa de Ayuda) — se
    // exige decir quién de verdad está reportando, para no perder esa
    // identidad detrás del nombre de la cuenta compartida. `isSharedAccount`
    // ya viaja en el JWT (ver employeeAuthFlags en routes/employeeAuth.js),
    // así que no hace falta otra consulta a Empleados solo para eso. Se
    // ignora en silencio si alguien más lo manda sin ser cuenta compartida —
    // nunca se guarda como si fuera de otra persona.
    //
    // Pedido explícito del usuario (2026-07-27): ya no basta con "algo no
    // vacío" — tiene que ser exactamente uno de los nombres del roster de
    // esa cuenta (ver Employee.sharedAccountUsers, editado desde
    // CuentasCompartidas.jsx), para que nadie pueda saltarse el selector del
    // frontend escribiendo texto libre directo contra la API.
    let sharedAccountReporterName = '';
    if (req.employee.isSharedAccount) {
      sharedAccountReporterName = (body.sharedAccountReporterName || '').trim();
      if (!sharedAccountReporterName) {
        return res.status(400).json({ message: 'Falta indicar quién está reportando este ticket.' });
      }
      const sharedAccount = await Employee.findById(req.employee.employeeRef).select('sharedAccountUsers');
      const validNames = (sharedAccount?.sharedAccountUsers || []).map((u) => u.name);
      if (!validNames.includes(sharedAccountReporterName)) {
        return res.status(400).json({ message: 'Selecciona tu nombre de la lista.' });
      }
    }

    // "Alta de Proveedores" (Solicitud de Pagos) — pedido explícito del
    // equipo de Pagos: los 2 problemas marcados `providerFields: true` en
    // ticketCategories.js piden datos estructurados del proveedor + la CSF
    // adjunta, en vez de dejarlos sueltos en la descripción. Se revalida
    // aquí (no solo en el frontend) porque el formulario manda
    // `multipart/form-data` y cualquiera podría llamar la ruta directo.
    const requiresProviderInfo = body.requiresProviderInfo === 'true';
    const providerName = (body.providerName || '').trim();
    const providerEmail = (body.providerEmail || '').trim();
    const providerPhone = (body.providerPhone || '').trim();
    const providerBankDetails = (body.providerBankDetails || '').trim();
    if (requiresProviderInfo) {
      if (!providerName || !providerEmail || !providerPhone || !providerBankDetails) {
        return res.status(400).json({ message: 'Completa los datos del proveedor (nombre, correo, teléfono y datos bancarios)' });
      }
      if (!attachmentFile) {
        return res.status(400).json({ message: 'Adjunta la Constancia de Situación Fiscal (CSF) del proveedor' });
      }
      if (!bankProofFile) {
        return res.status(400).json({ message: 'Adjunta el comprobante de los datos bancarios del proveedor' });
      }
    }

    // Soporte BI — "Solicitar proyecto" (llena y adjunta el .docx real de BI,
    // ver utils/biProjectDocx.js), "Solicitar bases de datos" (solo datos
    // estructurados, sin documento — la vista previa que ya vio quien
    // solicita en el wizard ES el detalle completo), o "Tengo una duda o
    // problema" (2026-07-30, sin formulario — usa `subject`/`description`
    // normales, ya capturados abajo como cualquier ticket). Se revalida
    // aquí (no solo en el frontend) por la misma razón que "Alta de
    // Proveedores" arriba: cualquiera podría llamar la ruta directo.
    let biRequestKind;
    let biProjectData;
    let biDatabaseRequest;
    let biDocFile; // { data, mimeType, fileName } si se generó un documento
    if (body.ticketType === 'soporte_bi') {
      biRequestKind = body.biRequestKind;
      if (!['proyecto', 'bases_datos', 'soporte'].includes(biRequestKind)) {
        return res.status(400).json({ message: 'Falta indicar qué tipo de solicitud de BI es' });
      }
      if (biRequestKind === 'proyecto') {
        try {
          biProjectData = JSON.parse(body.biProjectData || '{}');
        } catch (_) {
          return res.status(400).json({ message: 'Datos de la Solicitud de Proyecto inválidos' });
        }
        if (!biProjectData.nombreReporte || !biProjectData.solicitante) {
          return res.status(400).json({ message: 'Falta el nombre del reporte o el solicitante' });
        }
        const docBuffer = await buildBiProjectDocx(biProjectData);
        const safeName = String(biProjectData.nombreReporte).replace(/[^a-zA-Z0-9\- ]/g, '_').replace(/\s+/g, '_');
        biDocFile = {
          data: docBuffer,
          mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          fileName: `Solicitud_Proyecto_BI_${safeName}.docx`,
        };
      } else if (biRequestKind === 'bases_datos') {
        try {
          biDatabaseRequest = JSON.parse(body.biDatabaseRequest || '{}');
        } catch (_) {
          return res.status(400).json({ message: 'Datos de la Solicitud de Bases de Datos inválidos' });
        }
        // Filtro real (tipo + plataforma + tienda + periodo), no un canal
        // fijo de 3 opciones — ver comentario en frontend/BiDatabaseForm.jsx
        // sobre la corrección explícita del usuario a este diseño.
        const { tipo, plataforma, plataformaOtra, tienda, startDate, endDate } = biDatabaseRequest;
        if (!['ventas', 'inventarios'].includes(tipo) || !plataforma || !tienda || !startDate || !endDate) {
          return res.status(400).json({ message: 'Completa el tipo, la plataforma, la tienda y el periodo solicitado' });
        }
        if (plataforma === 'otra' && !String(plataformaOtra || '').trim()) {
          return res.status(400).json({ message: 'Escribe el nombre de la plataforma' });
        }
      }
      // biRequestKind === 'soporte': nada que validar aparte — ya se exige
      // `subject` (línea de arriba) como cualquier ticket normal.
    }

    // Igual que antes: se acepta solo si de verdad existe y está activa —
    // es un selector controlado (viene de GET /internal-apps/public), pero
    // se revalida por si llega manipulado.
    let appRef;
    let appName = '';
    if (/^[a-f0-9]{24}$/i.test(body.appRef || '')) {
      const app = await InternalApp.findOne({ _id: body.appRef, active: true }).select('name');
      if (app) { appRef = app._id; appName = app.name; }
    }
    const requestAudience = classifyTicketAudience(body.ticketType, appName, otherTypeDetail);

    const assignments = await Assignment.find({ employee: req.employee.employeeRef, active: true })
      .populate('asset', 'type brand model serialNumber');
    const allAssets = assignments.map((a) => a.asset).filter(Boolean);
    // Si solo tiene un equipo asignado (o ninguno) no hay nada que preguntar
    // — se sigue ligando automático, como antes. Con dos o más (ej. celular
    // Y laptop), el frontend ya obligó a elegir uno específico (o "no aplica
    // a un equipo en particular") vía GET /mine/assets, así que aquí solo se
    // valida que lo elegido de verdad sea un equipo asignado a esta persona.
    const assets = allAssets.length > 1
      ? allAssets.filter((a) => String(a._id) === body.assetId)
      : allAssets;
    const assetRefs = assets.map((a) => a._id);

    const ticket = await Ticket.create({
      employeeName: req.employee.name,
      employeeRef: req.employee.employeeRef,
      sharedAccountReporterName,
      assetRefs,
      appRef,
      requestAudience,
      ticketType: body.ticketType,
      otherTypeDetail,
      subject,
      description: (body.description || '').trim(),
      providerName,
      providerEmail,
      providerPhone,
      providerBankDetails,
      // blocksWork ya no se acepta de quien reporta — se deriva más abajo,
      // en applySlaCategory(), a partir de la prioridad del problema elegido.
      attachmentData:     attachmentFile?.buffer,
      attachmentMimeType:  attachmentFile?.mimetype || '',
      attachmentFileName:  attachmentFile?.originalname || '',
      bankProofData:       bankProofFile?.buffer,
      bankProofMimeType:   bankProofFile?.mimetype || '',
      bankProofFileName:   bankProofFile?.originalname || '',
      biRequestKind,
      biProjectData,
      biDatabaseRequest,
      biDocData:     biDocFile?.data,
      biDocMimeType: biDocFile?.mimeType || '',
      biDocFileName: biDocFile?.fileName || '',
      raw: body,
    });

    // Si el problema específico que eligió quien reporta ya tiene una
    // Categoría de Falla (SLA) conocida (ver `sla` en
    // config/ticketCategories.js del frontend), se clasifica desde que nace
    // — ya no depende de que un admin lo clasifique a mano después. Esto
    // también fija `blocksWork` (ver applySlaCategory) según la prioridad de
    // esa categoría, en vez de preguntarle a quien reporta "¿esto te impide
    // trabajar?" (checkbox quitado — cualquiera lo marcaba siempre, impida o
    // no). `applySlaCategory` regresa `false` si el valor no es una
    // categoría real del catálogo — se ignora en silencio en vez de tronar
    // el ticket por un dato manipulado o desconocido.
    const slaHint = (body.slaHint || '').trim();
    if (slaHint && applySlaCategory(ticket, slaHint)) {
      await ticket.save();
    }

    notifyTelegram(
      `🎫 <b>Nuevo ticket de soporte</b>\n` +
      `Folio: ${ticket.folio}\n` +
      `👤 ${req.employee.name}\n` +
      `🏷️ ${Ticket.TICKET_TYPE_LABELS[ticket.ticketType]}${otherTypeDetail ? `: ${otherTypeDetail}` : ''}${ticket.blocksWork ? ' · ⚠️ le impide trabajar' : ''}\n` +
      (assets.length ? `💻 ${assets.map(assetLabel).join(' · ')}\n` : '') +
      (appName ? `🗂️ Aplicación: ${appName}\n` : '') +
      `📝 ${subject}\n` +
      `<a href="${ticketAdminUrl(ticket._id)}">Ver ticket</a>`
    );

    // Igual que Telegram, sin await — nunca debe demorar ni romper la
    // respuesta al empleado si el cálculo de destinatarios o el envío falla.
    // La sucursal del empleado (`office`) no viaja en el JWT — se consulta
    // aparte, solo para decidir si Felipe entra o no en el enrutamiento
    // general (ver FELIPE_OFFICES arriba). `sharedAccountResponsibleUsers`
    // tampoco viaja en el JWT por la misma razón que el roster (ver
    // Employee.sharedAccountResponsibleUsers) — puede cambiar sin forzar un
    // reinicio de sesión de la tablet.
    Employee.findById(req.employee.employeeRef).select('office sharedAccountResponsibleUsers')
      .populate('sharedAccountResponsibleUsers', 'email')
      .then((emp) => getTicketEmailRecipients(ticket, appName, emp?.office, (emp?.sharedAccountResponsibleUsers || []).map((u) => u.email)))
      .then(({ emails, audience }) => {
      if (emails.length === 0) return;
      // 'sistemas' (Sistemas/ERP/BI — incluye lider.erp/analista.erp aunque
      // el apartado sea de otra área) usa la plantilla técnica de siempre,
      // sin cambios; 'externo' (equipos genuinamente ajenos a Sistemas, ej.
      // gerente.contabilidad/pagos) usa la versión amigable, sin jerga de
      // SLA/prioridad ni botón al panel (no tienen sesión ahí) — pedido
      // explícito del usuario 2026-07-22, ese tono los alarmaba sin motivo.
      const { subject: emailSubject, html } = audience === 'externo'
        ? buildExternalTicketNotificationEmail(ticket, { employeeName: req.employee.name, appName })
        : buildTicketNotificationEmail(ticket, {
          employeeName: req.employee.name,
          otherTypeDetail,
          typeLabel: Ticket.TICKET_TYPE_LABELS[ticket.ticketType],
          assetsLabel: assets.length ? assets.map(assetLabel).join(', ') : '',
          appName,
          // Vía /login?next=... y no directo a /tickets: quien abre este
          // link sin sesión iniciada (común — es un aviso por correo, no
          // algo que se visite ya logueado) antes caía en el 404 genérico
          // de PrivateRoute (a propósito para rutas privadas visitadas al
          // azar, ver App.jsx) — pero este es un link legítimo compartido
          // por correo, no alguien adivinando la URL; merece mandar a
          // iniciar sesión y de ahí seguir directo al ticket, no un
          // callejón sin salida. Login.jsx ya sabe leer `next` (mismo
          // patrón que EmployeeLogin.jsx) y, si ya hay sesión vigente,
          // salta directo sin mostrar el formulario.
          ticketsUrl: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/login?next=%2Ftickets` : '',
        });
      // Los adjuntos (CSF + comprobante bancario de un proveedor) se mandan
      // incrustados en el correo SOLO para 'externo' — esos destinatarios no
      // tienen sesión en el panel para ir a descargarlos desde ahí (a
      // diferencia de Sistemas, que ya tiene el botón "Ver ticket en el
      // panel").
      const attachments = audience === 'externo'
        ? [attachmentFile, bankProofFile]
          .filter(Boolean)
          .map((f) => ({ filename: f.originalname, contentType: f.mimetype, buffer: f.buffer }))
        : [];
      // "Solicitud de Proyecto BI" — a diferencia de la CSF/comprobante de
      // arriba, este SÍ se manda adjunto al correo aunque `audience` sea
      // 'sistemas' (pedido explícito del usuario: el equipo de BI debe
      // recibir el documento directo en el correo, no solo un link al panel).
      if (ticket.biDocData) {
        attachments.push({ filename: ticket.biDocFileName, contentType: ticket.biDocMimeType, buffer: ticket.biDocData });
      }
      notifyEmail({ to: emails, subject: emailSubject, html, attachments });
    }).catch(() => {});

    res.status(201).json({ id: ticket._id, folio: ticket.folio });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Historial del propio empleado — la Mesa de Ayuda ("Mis Tickets") lo pinta
// como una conversación (reporte inicial + resolución de Sistemas si ya la
// hay), reutilizando los mismos campos que ya existen en el ticket.
//
// Soporte BI (proyecto Y bases de datos) se guarda como Ticket (mismo
// folio/SLA/panel admin de siempre — no se tocó esa parte), pero pedido
// explícito del usuario (2026-07-23, ampliado el mismo día para incluir
// también "Solicitar proyecto", que al inicio se había dejado como ticket
// normal): del lado del empleado NINGUNO de los 2 caminos de Soporte BI
// debe verse en "Mis Tickets" — no son algo que "atender" como un
// problema, son solicitudes de soporte, así que ambos se excluyen aquí y
// se muestran en su lugar en "Mis Solicitudes" (ver GET /mine/bi-requests
// más abajo y MisSolicitudes.jsx).
//
// Mismo criterio se extendió (2026-07-28) a `requestAudience === 'externo'`
// — hoy solo "Solicitud de Pagos" en sus apartados de Centro de Costos/
// Motivo de Pago y Alta de Proveedores (ver classifyTicketAudience arriba):
// Sistemas no tiene acceso a esas plataformas, así que del lado del
// empleado tampoco debe verse como "un ticket" — se excluye aquí y se
// muestra en su lugar en "Mis Solicitudes" (ver GET /mine/external-requests
// más abajo). El panel de Sistemas (GET '/' más abajo) NO cambió — ahí
// sigue viéndose igual que cualquier otro ticket, por si Sistemas quiere
// confirmar que se atendió.
router.get('/mine', employeeAuth, async (req, res) => {
  try {
    await autoCloseStaleResolved();
    const tickets = await Ticket.find({
      employeeRef: req.employee.employeeRef,
      ticketType: { $ne: 'soporte_bi' },
      requestAudience: { $ne: 'externo' },
    })
      .select(LIST_EXCLUDE_FIELDS)
      .populate('appRef', 'name')
      .sort({ createdAt: -1 });
    res.json(tickets.map(stripInternal));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// El otro lado de la exclusión de arriba — "Mis Solicitudes" (ver
// MisSolicitudes.jsx) pinta estas mismas solicitudes junto con Cuentas/
// Recursos/Ingreso/Baja, no como parte de "Mis Tickets". Regresa AMBOS
// caminos (proyecto y bases de datos) — MisSolicitudes.jsx decide cómo
// mostrar cada uno según `biRequestKind`.
router.get('/mine/bi-requests', employeeAuth, async (req, res) => {
  try {
    const tickets = await Ticket.find({
      employeeRef: req.employee.employeeRef,
      ticketType: 'soporte_bi',
    }).select(LIST_EXCLUDE_FIELDS).sort({ createdAt: -1 });
    res.json(tickets.map(stripInternal));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// El otro lado de la exclusión de `requestAudience: 'externo'` de arriba —
// hoy solo cubre "Solicitud de Pagos" (Centro de Costos/Motivo de Pago,
// Alta de Proveedores), pero no depende de esa app por nombre: cualquier
// ticket futuro que se clasifique como 'externo' cae aquí solo.
router.get('/mine/external-requests', employeeAuth, async (req, res) => {
  try {
    const tickets = await Ticket.find({
      employeeRef: req.employee.employeeRef,
      requestAudience: 'externo',
    })
      .select(LIST_EXCLUDE_FIELDS)
      .populate('appRef', 'name')
      .sort({ createdAt: -1 });
    res.json(tickets.map(stripInternal));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Punto de notificación en el sidebar del portal (ver PortalLayout.jsx) —
// se consulta en cada navegación, así que se mantiene deliberadamente
// ligero (count en vez de traer los tickets completos). Desde que calificar
// es lo que cierra el ticket (2026-08-03), "pendiente" ya es 'resuelto' sin
// calificar, no 'cerrado' sin calificar (eso último ya no puede pasar salvo
// por el cierre automático de 5 días, que sí deja de poder calificarse).
router.get('/mine/pending-rating-count', employeeAuth, async (req, res) => {
  try {
    const count = await Ticket.countDocuments({
      employeeRef: req.employee.employeeRef,
      status: 'resuelto',
      satisfactionRating: null,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Roster de personas autorizadas a usar esta cuenta compartida, para el
// paso "¿Quién eres?" de ReportarTicket.jsx — se pide fresco aquí en vez de
// viajar en el JWT del portal porque el roster puede cambiar en cualquier
// momento (Sistemas agrega/quita gente) sin que eso deba forzar un
// reinicio de sesión de la tablet (ver CuentasCompartidas.jsx).
router.get('/mine/shared-account-users', employeeAuth, async (req, res) => {
  try {
    const employee = await Employee.findById(req.employee.employeeRef).select('isSharedAccount sharedAccountUsers');
    if (!employee) return res.status(404).json({ message: 'Empleado no encontrado' });
    res.json({ users: employee.isSharedAccount ? employee.sharedAccountUsers : [] });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// El empleado da seguimiento a su propio ticket — conversación de ida y
// vuelta real, no solo el reporte inicial + resolución formal. Pedido
// explícito del usuario (2026-07-24): un ticket "resuelto" NUNCA vuelve a
// abierto/en_proceso, ni solo ni a mano (ver también PUT /:id/status más
// abajo) — un mensaje nuevo del empleado se agrega igual a la
// conversación, pero el estatus y la resolución ya capturada se quedan
// como están.
router.post('/:id/messages', employeeAuth, (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la imagen' });
    next();
  });
}, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (String(ticket.employeeRef) !== String(req.employee.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }
    if (ticket.status === 'cerrado') {
      return res.status(400).json({ message: 'Este ticket ya está cerrado — reporta uno nuevo si el problema sigue.' });
    }
    // Escalado a Proveedor — pedido explícito del usuario (2026-08-03): ya
    // no compete a Sistemas mientras se espera al proveedor externo, así
    // que el empleado no puede seguir escribiendo (ni quejarse) hasta que
    // el servicio quede terminado (ver botón "Servicio con el proveedor
    // terminado" en TicketDetailModal.jsx, que marca el ticket como
    // resuelto y ahí sí reabre la calificación normal).
    if (ticket.escalationType === 'proveedor' && !['resuelto', 'cerrado'].includes(ticket.status)) {
      return res.status(400).json({ message: 'Este ticket se escaló a un proveedor externo — te avisaremos cuando el servicio esté listo.' });
    }
    const text = (req.body.text || '').trim();
    if (!text && !req.file) return res.status(400).json({ message: 'Escribe un mensaje o adjunta una imagen' });

    ticket.messages.push({
      from: 'employee',
      authorName: req.employee.name,
      text,
      attachmentData:     req.file?.buffer,
      attachmentMimeType:  req.file?.mimetype || '',
      attachmentFileName:  req.file?.originalname || '',
    });
    await ticket.save();

    // Pedido explícito del usuario (2026-07-28): Telegram es para AVISOS,
    // no para mandar el chat completo. Esa vez se quitó el texto
    // (`📝 ${text}`) pero se dejó un aviso genérico por CADA mensaje — con
    // una conversación activa, eso terminó inundando el grupo "Avisos" con
    // un ping por mensaje (reportado 2026-08-03: 5 avisos en 8 minutos para
    // el mismo ticket). Se quita por completo: el push de abajo (privado,
    // solo a quien tiene asignado el ticket) ya cubre el aviso en tiempo
    // real sin llenar el grupo compartido. Nota: un ticket SIN asignar ya
    // no dispara ningún aviso al recibir un mensaje de seguimiento (antes
    // Telegram era el único que cubría ese caso) — el aviso de "ticket
    // nuevo" (ver POST /mine más arriba) sigue avisando al crearse.
    //
    // Push al técnico que tiene asignado este ticket — pedido explícito del
    // usuario (2026-07-24): "que también me llegue cuando el usuario me
    // contesta".
    if (ticket.assignedTo) {
      sendPushToUser(ticket.assignedTo, {
        title: `${req.employee.name} respondió el ticket ${ticket.folio}`,
        body: text ? text.slice(0, 120) : 'Revisa la imagen adjunta',
        url: `/tickets/general?ticket=${ticket._id}`,
      }).catch(() => {});
    }

    res.status(201).json(stripInternal(ticket));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Encuesta de satisfacción (CSAT) — solo el empleado dueño del ticket, y
// solo una vez que Sistemas ya lo marcó "resuelto". Pedido explícito del
// usuario (2026-08-03): el ticket ya NO se considera cerrado de verdad
// hasta que el empleado califica — calificar es lo que dispara el cierre
// real (status → 'cerrado'), no una acción aparte de Sistemas. Si nunca
// califica, el ticket se queda en "resuelto" (el cierre automático a los 5
// días sin actividad, ver autoCloseStaleResolved() arriba, sigue siendo el
// único respaldo para que no se quede en limbo para siempre).
router.post('/:id/satisfaction', employeeAuth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (String(ticket.employeeRef) !== String(req.employee.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }
    if (ticket.status !== 'resuelto') {
      return res.status(400).json({ message: 'Este ticket todavía no está resuelto' });
    }
    if (ticket.satisfactionRating) {
      return res.status(400).json({ message: 'Ya calificaste este ticket.' });
    }
    const { rating } = req.body;
    if (!Ticket.schema.path('satisfactionRating').enumValues.includes(rating)) {
      return res.status(400).json({ message: 'Calificación inválida' });
    }
    ticket.satisfactionRating = rating;
    ticket.status = 'cerrado';
    await ticket.save();
    res.json(stripInternal(ticket));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Imagen adjunta a un mensaje de la conversación — la puede pedir cualquiera
// de los dos lados (el empleado que la mandó/recibió, o Sistemas), así que
// a diferencia del resto de rutas de este archivo no puede colgarse ni de
// employeeAuth ni de adminOnly a secas (cualquiera de los dos bloquearía al
// otro). Se valida el JWT a mano (mismo secreto/librería que auth.js y
// employeeAuth.js) y solo se restringe la propiedad del ticket si el token
// es de empleado.
router.get('/:id/messages/:messageId/attachment', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Sin sesión' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Sesión inválida' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (payload.type === 'employee' && String(ticket.employeeRef) !== String(payload.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }

    const message = ticket.messages.id(req.params.messageId);
    if (!message || !message.attachmentData) return res.status(404).json({ message: 'Sin imagen adjunta' });
    res.setHeader('Content-Type', message.attachmentMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${message.attachmentFileName || 'imagen'}"`);
    res.end(message.attachmentData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Adjunto de una nota PÚBLICA (imagen/video, GridFS) — mismo patrón dual
// admin/empleado que GET /:id/messages/:messageId/attachment de arriba
// (JWT decodificado a mano, antes del gate de admin), porque a diferencia
// de las notas internas, estas SÍ las puede ver quien reportó el ticket.
router.get('/:id/public-notes/:noteId/attachment', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Sin sesión' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Sesión inválida' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (payload.type === 'employee') {
      if (String(ticket.employeeRef) !== String(payload.employeeRef)) {
        return res.status(403).json({ message: 'Este ticket no es tuyo' });
      }
    } else if (!canViewTicket({ user: payload }, ticket)) {
      return res.status(404).json({ message: 'Ticket no encontrado' });
    }

    const note = ticket.publicNotes.id(req.params.noteId);
    if (!note || !note.attachmentId) return res.status(404).json({ message: 'Sin adjunto' });
    res.setHeader('Content-Type', note.attachmentMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${note.attachmentFileName || 'adjunto'}"`);
    downloadStream(note.attachmentId)
      .on('error', () => res.status(404).end())
      .pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Base de datos entregada por BI — mismo patrón dual admin/empleado que
// /:id/messages/:messageId/attachment de arriba (JWT decodificado a mano,
// antes del gate de abajo), pedido explícito del usuario (2026-07-30):
// "que cuando abran el ticket ahí esté la BD". A diferencia de esa ruta,
// aquí SÍ se aplica canViewTicket() para el caso admin/BI/ERP (no solo la
// verificación de dueño del lado empleado) — este archivo puede tener
// datos de ventas/inventarios reales, no una imagen cualquiera de chat.
router.get('/:id/bi-deliverable', async (req, res) => {
  try {
    const token = req.headers.authorization?.split(' ')[1];
    if (!token) return res.status(401).json({ message: 'Sin sesión' });
    let payload;
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET);
    } catch {
      return res.status(401).json({ message: 'Sesión inválida' });
    }

    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (payload.type === 'employee') {
      if (String(ticket.employeeRef) !== String(payload.employeeRef)) {
        return res.status(403).json({ message: 'Este ticket no es tuyo' });
      }
    } else if (!canViewTicket({ user: payload }, ticket)) {
      return res.status(404).json({ message: 'Ticket no encontrado' });
    }

    if (!ticket.biDeliverableId) return res.status(404).json({ message: 'Sin archivo entregado' });
    res.setHeader('Content-Type', ticket.biDeliverableMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${ticket.biDeliverableFileName || 'base-de-datos'}"`);
    downloadStream(ticket.biDeliverableId, 'biDeliverables')
      .on('error', () => res.status(404).end())
      .pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Ya no es adminOnly a secas: lider.erp/analista.erp (viewer + solo permiso
// ERP) también entran a Tickets, pero acotados a los de tipo 'erp' — ver
// canViewTicket() para el filtrado real por ticket. Mismo criterio para BI
// (2026-07-30, acotados a 'soporte_bi').
router.use(auth, (req, res, next) => {
  // canManageTickets (2026-08-03) — acceso al Tablero sin ser
  // Administrador completo del sistema, ver becario.sistemas en User.js.
  if (req.user.role === 'admin' || req.user.canManageTickets || isErpOnlyUser(req.user) || isBiOnlyUser(req.user)) return next();
  return res.status(403).json({ message: 'No tienes acceso a Tickets' });
});

router.get('/', async (req, res) => {
  try {
    await autoCloseStaleResolved();
    const filter = {};
    if (req.query.status) filter.status = { $in: req.query.status.split(',') };
    // assetRefs es un arreglo — una igualdad simple contra un campo arreglo
    // en Mongo ya busca "¿está este valor DENTRO del arreglo?", así que
    // filtrar por un solo activo sigue funcionando igual que antes.
    if (req.query.assetRef) filter.assetRefs = req.query.assetRef;
    if (req.query.assignedTo) filter.assignedTo = req.query.assignedTo;
    // Mismo criterio que canViewTicket() — ERP sigue exclusivo de
    // lider.erp/analista.erp; BI (los 3 caminos: Soporte/Bases de Datos/
    // Proyecto) ya no se excluye de este listado (2026-08-03, ver
    // canViewTicket() arriba) — tanto Sistemas como BI necesitan ver el
    // ticket completo aquí, porque la conversación ya solo vive en Tickets.
    // `escalatedToArea` (2026-08-03) manda sobre `ticketType` cuando un
    // ticket se escaló a otra área por no competerle — se usa `$or` en vez
    // de una simple igualdad para reflejar exactamente lo que ya decide
    // canViewTicket() por ticket individual.
    const NOT_AREA_ESCALATED = { $nin: ['erp', 'bi', 'sistemas'] };
    if (!req.user.canViewManagerDashboard) {
      if (isErpOnlyUser(req.user)) {
        filter.$or = [
          { escalatedToArea: 'erp' },
          { escalatedToArea: NOT_AREA_ESCALATED, ticketType: 'erp' },
        ];
      } else if (isBiOnlyUser(req.user)) {
        filter.$or = [
          { escalatedToArea: 'bi' },
          { escalatedToArea: NOT_AREA_ESCALATED, ticketType: 'soporte_bi' },
        ];
      } else {
        filter.$or = [
          { escalatedToArea: 'sistemas' },
          { ticketType: { $ne: 'erp' } },
        ];
      }
    }
    // Pedido explícito del usuario (2026-07-28, ampliando lo que al inicio
    // se había dejado solo del lado del empleado): "Solicitud de Pagos" en
    // sus apartados ajenos a Sistemas (Centro de Costos/Motivo de Pago,
    // Alta de Proveedores — ver requestAudience en Ticket.js) tampoco debe
    // verse aquí, en el Tablero de Sistemas — Sistemas no tiene ningún
    // acceso a esas plataformas para hacer algo con ellos. Sigue siendo un
    // Ticket real en la base de datos (folio, historial) y sigue abierto
    // por su _id directo (ej. desde el link del correo/Telegram) — solo se
    // excluye de este listado.
    filter.requestAudience = { $ne: 'externo' };
    const tickets = await Ticket.find(filter)
      .select(LIST_EXCLUDE_FIELDS)
      .populate('assetRefs', 'type brand model serialNumber inventoryTag')
      .populate('assignedTo', 'name')
      .populate('appRef', 'name responsibleName responsibleArea')
      .sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Cuántos tickets tiene cada activo (para el badge en Activos) — un solo
// query agregado en vez de pedirlo activo por activo. $unwind separa cada
// elemento de assetRefs en su propio documento antes de agrupar, para que
// un ticket con 2 equipos cuente para cada uno de los dos. Mismo criterio
// de partición de 3 flujos que canViewTicket()/GET / de arriba.
router.get('/counts-by-asset', async (req, res) => {
  try {
    // {} como valor de ticketType NO significa "sin filtro" en Mongo —
    // significaría "el campo es exactamente {}" y no matchearía nada. Para
    // el gerente (ve los 3 flujos) se omite la llave por completo en vez
    // de mandar un objeto vacío.
    const match = { assetRefs: { $ne: [] } };
    if (!req.user.canViewManagerDashboard) {
      match.ticketType = isErpOnlyUser(req.user)
        ? 'erp'
        : isBiOnlyUser(req.user)
          ? 'soporte_bi'
          : { $ne: 'erp' };
    }
    const counts = await Ticket.aggregate([
      { $match: match },
      { $unwind: '$assetRefs' },
      { $group: { _id: '$assetRefs', count: { $sum: 1 } } },
    ]);
    res.json(counts.map((c) => ({ assetRef: c._id, count: c.count })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// `scope` separa el catálogo genérico de Sistemas del catálogo propio de BI
// (ej. "Ayuda con Excel") — pedido explícito del usuario (2026-07-31): BI
// resuelve tickets de tipo de problema muy distinto al resto y no tiene
// sentido que compartan el mismo catálogo. Default 'general' para no
// afectar el comportamiento de siempre si no se manda el query param.
router.get('/resolution-options', async (req, res) => {
  try {
    const scope = ['bi', 'erp'].includes(req.query.scope) ? req.query.scope : 'general';
    const options = await TicketResolutionOption.find({ scope }).sort({ label: 1 }).select('label');
    res.json(options.map((o) => o.label));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Pedido explícito del usuario (2026-07-28): el catálogo solo crecía (vía
// "Otro (especifica)" al resolver un ticket, ver PUT /:id/status), sin
// forma de quitar entradas de prueba/basura (ej. "brrrr"). `label` es único
// en el modelo, así que se borra por label tal cual — no hace falta exponer
// el _id en GET /resolution-options ni tocar esa respuesta.
router.delete('/resolution-options/:label', async (req, res) => {
  try {
    const result = await TicketResolutionOption.deleteOne({ label: req.params.label });
    if (result.deletedCount === 0) return res.status(404).json({ message: 'No encontrado' });
    logAction(req.user, 'eliminar', 'catalogo_resolucion', null, req.params.label, `Eliminó "${req.params.label}" del catálogo de resoluciones`);
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// A quién se le puede asignar un ticket. Antes el frontend pedía esta lista
// a GET /api/users (adminOnly a secas) — lider.erp/analista.erp (viewer +
// solo permiso ERP) recibían 403 ahí, así que el selector de "Asignar a"
// les salía vacío y no podían ni verse a sí mismos para autoasignarse un
// ticket ERP, aunque canManageTicket() ya los autorizaba de sobra (bug real
// reportado 2026-07-22). Cada quien ve solo a la gente con la que de verdad
// podría compartir un ticket: un ERP-only ve a los demás ERP-only (con
// quienes comparte los tickets `erp`); todo el resto ve a los admins de
// Sistemas — mismo criterio de partición que canViewTicket(), sin exponer
// el resto de la ficha de Usuarios (permisos, oficina) que no hace falta
// para este selector.
router.get('/assignable-users', async (req, res) => {
  try {
    const filter = isErpOnlyUser(req.user)
      ? { role: { $ne: 'admin' }, canManageGmailAccounts: { $ne: true }, canManagePlatformAccounts: { $ne: true }, canManagePlatformAccountsErp: true }
      : { role: 'admin' };
    // `email` incluido (no solo para asignar tickets) — CuentasCompartidas.jsx
    // reusa este mismo endpoint para el dropdown de "responsable de soporte"
    // de una cuenta compartida (ver Employee.sharedAccountResponsibleUser).
    const users = await User.find(filter).select('name email').sort({ name: 1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Panel "Mi Equipo" del líder de BI — pedido explícito del usuario
// (2026-07-31): "cómo nos reportan a Sistemas, porque andan reportando
// muy mal" — aclarado por el usuario que se refiere a los tickets que el
// EQUIPO DE BI reporta como empleados (ej. se les descompuso su equipo),
// no a cómo BI resuelve lo que le piden. isBiOnlyUser() ya acota
// GET /tickets a solo `soporte_bi` para cualquier BI-only (líder
// incluido), así que esta información necesita su propia ruta: se
// identifica al equipo de BI por quién tiene canManageBiRequests (mismo
// criterio que isBiOnlyUser), y se buscan los tickets que ELLOS
// reportaron por nombre, de cualquier tipo que NO sea soporte_bi.
router.get('/bi-team/reports', async (req, res) => {
  try {
    if (!req.user.canViewBiTeamDashboard) {
      return res.status(403).json({ message: 'No tienes acceso a este panel' });
    }
    const biTeam = await User.find({ canManageBiRequests: true }).select('name');
    const escapeRegex = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const nameFilters = biTeam.map((u) => new RegExp(`^${escapeRegex(u.name.trim())}$`, 'i'));
    if (nameFilters.length === 0) return res.json([]);

    const tickets = await Ticket.find({
      ticketType: { $ne: 'soporte_bi' },
      requestAudience: 'sistemas',
      employeeName: { $in: nameFilters },
    }).select(LIST_EXCLUDE_FIELDS).sort({ createdAt: -1 });
    res.json(tickets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Ticket individual — usado para refrescar la conversación en vivo (polling)
// sin tener que volver a pedir el tablero completo cada vez.
router.get('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id)
      .populate('assetRefs', 'type brand model serialNumber inventoryTag')
      .populate('assignedTo', 'name')
      .populate('appRef', 'name responsibleName responsibleArea');
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    res.json(ticket);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/attachment', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Sin evidencia adjunta' });
    if (!ticket.attachmentData) return res.status(404).json({ message: 'Sin evidencia adjunta' });
    res.setHeader('Content-Type', ticket.attachmentMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${ticket.attachmentFileName || 'evidencia'}"`);
    res.end(ticket.attachmentData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Segundo adjunto de "Alta de Proveedores" — comprobante de los datos
// bancarios (carátula/estado de cuenta), aparte de la CSF de arriba.
router.get('/:id/bank-proof-attachment', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Sin comprobante adjunto' });
    if (!ticket.bankProofData) return res.status(404).json({ message: 'Sin comprobante adjunto' });
    res.setHeader('Content-Type', ticket.bankProofMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${ticket.bankProofFileName || 'comprobante-bancario'}"`);
    res.end(ticket.bankProofData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// "Solicitud de Proyecto BI" ya rellenada — mismo patrón que /attachment y
// /bank-proof-attachment de arriba, solo que este documento lo genera el
// propio servidor (no lo sube quien reporta).
router.get('/:id/bi-document', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Sin documento adjunto' });
    if (!ticket.biDocData) return res.status(404).json({ message: 'Sin documento adjunto' });
    res.setHeader('Content-Type', ticket.biDocMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `attachment; filename="${ticket.biDocFileName || 'solicitud-proyecto-bi.docx'}"`);
    res.end(ticket.biDocData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id/assign', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Este ticket ya está asignado a alguien más' });
    }

    const { userId, userName } = req.body;
    ticket.assignedTo = userId || null;
    ticket.assignedByName = userName || '';
    ticket.assignedAt = new Date();
    // Asignar implica que ya alguien lo está viendo — si seguía "abierto" pasa a "en proceso".
    if (ticket.status === 'abierto') ticket.status = 'en_proceso';
    await ticket.save();

    logAction(req.user, 'asignar', 'ticket', ticket._id, ticket.subject, `Asignó el ticket ${ticket.folio} a ${userName || 'nadie'}`);

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// La prioridad la fija Sistemas al triage (ver Ticket.js) — independiente
// del estatus, para poder medir/ordenar por urgencia sin que eso implique
// asignar ni resolver nada todavía.
router.put('/:id/priority', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    const { priority } = req.body;
    if (!['baja', 'media', 'alta', 'critica'].includes(priority)) {
      return res.status(400).json({ message: 'Prioridad inválida' });
    }
    ticket.priority = priority;
    await ticket.save();
    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Cambió la prioridad del ticket ${ticket.folio} a "${priority}"`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Escalamiento — pedido explícito del usuario: marcar un ticket que se sale
// del alcance del área (requiere garantía con fabricante, soporte externo,
// aprobación de otra área) para que tenga su propia bandeja (ver
// TicketsEscalamiento.jsx). Mismo permiso que el resto de acciones sobre el
// ticket — no es un rol aparte.
// Destinos válidos de escalamiento para el ticket actual (según quien
// pregunta) — pedido explícito del usuario (2026-08-03), el frontend
// arma el selector con esto en vez de tener la cadena de reglas
// duplicada en 2 lugares.
router.get('/:id/escalation-targets', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) return res.json([]);
    res.json(getEscalationTargets(req.user));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/escalate', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }

    const { escalate, reason } = req.body;

    // Quitar escalamiento — no revierte la asignación (ver comentario del
    // modelo en Ticket.js), solo limpia las banderas.
    if (!escalate) {
      ticket.escalated = false;
      ticket.escalationType = '';
      ticket.escalatedToArea = '';
      ticket.escalationReason = '';
      ticket.escalatedByName = '';
      ticket.escalatedAt = null;
      await ticket.save();
      logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Quitó el escalamiento del ticket ${ticket.folio}`);
      return res.json(ticket);
    }

    const { kind, targetEmail, targetArea } = req.body;
    const allowed = getEscalationTargets(req.user);
    const match = allowed.find((t) => (
      t.kind === kind
      && (kind !== 'persona' || t.email === targetEmail)
      && (kind !== 'area' || t.area === targetArea)
    ));
    if (!match) {
      return res.status(403).json({ message: 'No tienes permiso para escalar este ticket a ese destino' });
    }

    const trimmedReason = (reason || '').trim();
    ticket.escalated = true;
    ticket.escalationType = kind;
    ticket.escalationReason = trimmedReason;
    ticket.escalatedByName = req.user.name;
    ticket.escalatedAt = new Date();

    let logDetail = '';
    if (kind === 'persona') {
      const target = await User.findOne({ email: match.email });
      if (!target) return res.status(404).json({ message: `No se encontró la cuenta de ${match.label}` });
      ticket.assignedTo = target._id;
      ticket.assignedByName = req.user.name;
      ticket.assignedAt = new Date();
      ticket.escalatedToArea = '';
      if (ticket.status === 'abierto') ticket.status = 'en_proceso';
      logDetail = `Escaló el ticket ${ticket.folio} a ${match.label}${trimmedReason ? `: ${trimmedReason}` : ''}`;
      await ticket.save();
      sendPushToUser(target._id, {
        title: `Te escalaron el ticket ${ticket.folio}`,
        body: trimmedReason ? trimmedReason : `Escalado por ${req.user.name}`,
        url: `/tickets/general?ticket=${ticket._id}`,
      }).catch(() => {});
    } else if (kind === 'area') {
      ticket.assignedTo = null;
      ticket.escalatedToArea = match.area;
      logDetail = `Escaló el ticket ${ticket.folio} a ${match.label}${trimmedReason ? `: ${trimmedReason}` : ''}`;
      await ticket.save();
    } else {
      // 'proveedor' — pedido explícito del usuario (2026-08-03): queda
      // "resuelto" de nuestro lado (el empleado ya no puede escribir, ver
      // POST /:id/messages) mientras se espera al proveedor externo, sin
      // pasar todavía a `status: 'resuelto'` de verdad — eso solo lo hace
      // el botón "Servicio con el proveedor terminado" (mismo botón de
      // siempre, relabeled en TicketDetailModal.jsx), que reabre la
      // calificación normal del empleado. El seguimiento con el proveedor
      // (texto + fotos) se lleva en Notas internas — se deja sembrada la
      // primera nota para que quede claro desde dónde arrancó.
      ticket.escalatedToArea = '';
      ticket.internalNotes.push({
        authorName: req.user.name,
        text: `Escalado a Proveedor${trimmedReason ? `: ${trimmedReason}` : ''} — seguimiento de aquí en adelante en esta bitácora.`,
      });
      logDetail = `Escaló el ticket ${ticket.folio} a Proveedores${trimmedReason ? `: ${trimmedReason}` : ''}`;
      await ticket.save();
    }

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, logDetail);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Categoría de Falla (SLA) — elegirla rellena Nivel de Servicio + Prioridad +
// fechas límite de un jalón, según la matriz oficial (ver Ticket.SLA_CATALOG).
// El reloj del SLA corre desde que se reportó el ticket (createdAt), no
// desde que se clasificó. Sistemas puede seguir ajustando la prioridad a
// mano después con PUT /:id/priority si el caso lo amerita.
router.put('/:id/sla-category', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    const { slaCategory } = req.body;
    if (!applySlaCategory(ticket, slaCategory)) {
      return res.status(400).json({ message: 'Categoría de falla inválida' });
    }

    await ticket.save();
    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Clasificó el ticket ${ticket.folio} como "${slaCategory || 'sin clasificar'}"`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Reasignar la categoría de un ticket mal clasificado — pedido explícito y
// urgente del usuario (2026-07-27): antes no había forma de corregir el
// `ticketType` después de creado. Se excluyen los 3 tipos genéricos
// heredados (hardware/software/red) porque el wizard ya no los ofrece — no
// tendría sentido reasignar A algo que ya no se puede elegir al reportar.
// Guarda el tipo original + quién/cuándo para que el empleado vea en Mis
// Tickets que se reclasificó (pedido explícito: "quiero que el usuario
// aprenda a reportar").
// 'soporte_bi' se excluye a propósito: vive en su propio flujo (Mis
// Solicitudes, no el tablero general de Tickets) con campos totalmente
// distintos (biRequestKind/biProjectData/biDatabaseRequest) — reasignar
// hacia/desde ahí dejaría datos huérfanos, no tiene un caso de uso real.
const REASSIGNABLE_TICKET_TYPES = Ticket.TICKET_TYPES.filter((t) => !['hardware', 'software', 'red', 'soporte_bi'].includes(t));
router.put('/:id/reassign-type', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    const { ticketType, otherTypeDetail } = req.body;
    if (!REASSIGNABLE_TICKET_TYPES.includes(ticketType)) {
      return res.status(400).json({ message: 'Categoría inválida' });
    }
    if (ticketType === ticket.ticketType) {
      return res.status(400).json({ message: 'Ese ya es el tipo actual del ticket' });
    }
    if (ticketType === 'otro' && !(otherTypeDetail || '').trim()) {
      return res.status(400).json({ message: 'Especifica de qué se trata' });
    }

    const fromLabel = Ticket.TICKET_TYPE_LABELS[ticket.ticketType];
    const toLabel = Ticket.TICKET_TYPE_LABELS[ticketType];
    if (!ticket.originalTicketType) ticket.originalTicketType = ticket.ticketType;
    ticket.ticketType = ticketType;
    ticket.otherTypeDetail = ticketType === 'otro' ? otherTypeDetail.trim() : '';
    ticket.reassignedByName = req.user.name;
    ticket.reassignedAt = new Date();
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Reasignó el ticket ${ticket.folio} de "${fromLabel}" a "${toLabel}"`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/status', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }

    const { status, resolution, resolutionNotes, addToCatalog } = req.body;
    if (!['abierto', 'en_proceso', 'resuelto', 'cerrado'].includes(status)) {
      return res.status(400).json({ message: 'Estatus inválido' });
    }
    // Pedido explícito del usuario (2026-07-24): un ticket resuelto/cerrado
    // NUNCA vuelve a abierto/en_proceso — ni solo (ver POST /:id/messages,
    // ya no reabre) ni a mano (se quitó el botón "Reabrir" del panel). Se
    // bloquea aquí también por si alguien llama la ruta directo.
    if (['abierto', 'en_proceso'].includes(status) && ['resuelto', 'cerrado'].includes(ticket.status)) {
      return res.status(400).json({ message: 'Un ticket resuelto o cerrado ya no se puede reabrir.' });
    }
    // Pedido explícito del usuario (2026-07-27): "si yo Sistemas digo que ya
    // lo voy a cerrar es porque ya me cercioré que funciona" — resolver y
    // cerrar ya no son dos pasos separados. El frontend ahora manda
    // status='cerrado' directo desde el formulario de resolución (ver
    // handleResolve() en TicketDetailModal.jsx), así que la captura de
    // resolución aplica para 'resuelto' Y 'cerrado', no solo 'resuelto'
    // (ese status casi no se va a volver a usar, pero se deja vivo por los
    // tickets que ya estaban ahí antes de este cambio).
    if (['resuelto', 'cerrado'].includes(status) && !ticket.resolvedAt) {
      if (!(resolution || '').trim()) return res.status(400).json({ message: 'Selecciona cómo se resolvió' });
      ticket.resolution = resolution.trim();
      ticket.resolutionNotes = (resolutionNotes || '').trim();
      ticket.resolvedByName = req.user.name;
      ticket.resolvedAt = new Date();

      if (addToCatalog && resolution.trim()) {
        try {
          const scope = ticket.ticketType === 'soporte_bi' ? 'bi' : ticket.ticketType === 'erp' ? 'erp' : 'general';
          await TicketResolutionOption.create({ label: resolution.trim(), addedByName: req.user.name, scope });
        } catch (err) {
          if (err.code !== 11000) throw err; // 11000 = ya existía, se ignora
        }
      }
    }
    ticket.status = status;
    await ticket.save();

    const actionByStatus = { resuelto: 'resolver', cerrado: 'resolver', abierto: 'editar', en_proceso: 'editar' };
    logAction(req.user, actionByStatus[status], 'ticket', ticket._id, ticket.subject, `Cambió el ticket ${ticket.folio} a estatus "${status}"`);

    // Pedido explícito del usuario (2026-07-28, avisos por push; ajustado
    // 2026-08-03): el momento que de verdad le importa al empleado ya no es
    // "Sistemas cerró tu ticket" (eso ahora lo dispara su propia
    // calificación, ver POST /:id/satisfaction) sino "Sistemas ya lo
    // resolvió, ven a calificar". Se deja el aviso de 'cerrado' vivo por si
    // algún día se vuelve a setear directo desde aquí (ej. una herramienta
    // interna), pero el flujo normal de Sistemas ya no manda ese status.
    if (status === 'resuelto') {
      sendPushToEmployee(ticket.employeeRef, {
        title: 'Tu ticket fue resuelto',
        body: ticket.resolution ? `Resolución: ${ticket.resolution} — califica la atención.` : 'Sistemas ya lo resolvió — califica la atención.',
        url: `/mesa-de-ayuda/mis-tickets?ticket=${ticket._id}`,
      }).catch(() => {});
    } else if (status === 'cerrado') {
      sendPushToEmployee(ticket.employeeRef, {
        title: 'Tu ticket fue cerrado',
        body: ticket.resolution ? `Resolución: ${ticket.resolution}` : 'Sistemas ya lo cerró.',
        url: `/mesa-de-ayuda/mis-tickets?ticket=${ticket._id}`,
      }).catch(() => {});
    }

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

const BI_STAGES = ['recibido', 'en_definicion', 'en_desarrollo', 'en_revision', 'entregado'];

// Etapa de trabajo de BI (Bases de Datos/Proyectos) — pedido explícito del
// usuario (2026-07-30): "gestionar cómo lo resuelve BI", con etapas
// propias en vez de solo abierto/en_proceso/resuelto/cerrado. Mismo
// permiso de siempre (canManageTicket): BI puede mover un ticket sin
// asignar o asignado a sí mismo, igual que cualquier persona con un
// ticket ERP — no hay carve-out especial para BI-only aquí.
router.put('/:id/bi-stage', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (ticket.ticketType !== 'soporte_bi') {
      return res.status(400).json({ message: 'Esta acción es solo para tickets de Soporte BI' });
    }
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }

    const { biStage } = req.body;
    if (!BI_STAGES.includes(biStage)) return res.status(400).json({ message: 'Etapa inválida' });
    if (['resuelto', 'cerrado'].includes(ticket.status)) {
      return res.status(400).json({ message: 'Un ticket resuelto o cerrado ya no se puede modificar.' });
    }
    // Una solicitud de Bases de Datos no llega a "Entregado" sin el archivo
    // real — para eso está POST /:id/bi-deliver (sube el archivo Y avanza
    // la etapa en un solo paso). Esta ruta solo mueve etapas intermedias
    // para bases_datos; "Proyecto" sí puede marcarse entregado aquí (no
    // tiene archivo que entregar, solo el .docx de la solicitud).
    if (biStage === 'entregado' && ticket.biRequestKind === 'bases_datos' && !ticket.biDeliverableId) {
      return res.status(400).json({ message: 'Para marcar como entregada una base de datos, adjunta el archivo (Entregar base de datos).' });
    }

    ticket.biStage = biStage;
    ticket.biStageUpdatedAt = new Date();
    ticket.biStageUpdatedByName = req.user.name;

    // Al entregar, se marca resuelto de una vez (mismo criterio que
    // "resolver y cerrar ya no son dos pasos separados" del PUT /:id/status)
    // — así el empleado ve "resuelto" y se habilita la encuesta CSAT sin
    // que BI tenga que repetir la acción en dos lugares distintos.
    if (biStage === 'entregado' && !ticket.resolvedAt) {
      ticket.status = 'resuelto';
      ticket.resolution = 'Entregado por BI';
      ticket.resolvedByName = req.user.name;
      ticket.resolvedAt = new Date();
    }

    await ticket.save();
    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Cambió la etapa de BI del ticket ${ticket.folio} a "${biStage}"`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Aprobar/rechazar una solicitud de Bases de Datos — pedido explícito del
// usuario (2026-07-31), mismo shape que el aprobar/rechazar de
// resourceRequests.js (reviewedByName/reviewedAt + logAction, el motivo de
// rechazo NO obligatorio en el servidor). Solo tiene sentido mientras la
// solicitud sigue en "Recibido", sin aprobar/rechazar todavía.
router.put('/:id/bi-approve', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (ticket.biRequestKind !== 'bases_datos') {
      return res.status(400).json({ message: 'Esta acción es solo para solicitudes de Bases de Datos' });
    }
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    if (ticket.biApprovedAt || ticket.biRejectedAt) {
      return res.status(400).json({ message: 'Esta solicitud ya fue aprobada o rechazada' });
    }

    ticket.biApprovedByName = req.user.name;
    ticket.biApprovedAt = new Date();
    ticket.biStage = 'en_definicion';
    ticket.biStageUpdatedAt = new Date();
    ticket.biStageUpdatedByName = req.user.name;
    ticket.status = 'en_proceso';
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Aprobó la solicitud de Bases de Datos del ticket ${ticket.folio}`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/bi-reject', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (ticket.biRequestKind !== 'bases_datos') {
      return res.status(400).json({ message: 'Esta acción es solo para solicitudes de Bases de Datos' });
    }
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    if (ticket.biApprovedAt || ticket.biRejectedAt) {
      return res.status(400).json({ message: 'Esta solicitud ya fue aprobada o rechazada' });
    }

    ticket.biRejectionReason = req.body.reason || '';
    ticket.biRejectedByName = req.user.name;
    ticket.biRejectedAt = new Date();
    ticket.status = 'cerrado';
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Rechazó la solicitud de Bases de Datos del ticket ${ticket.folio}`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Entrega real de la base de datos — pedido explícito del usuario
// (2026-07-30): "que cuando abran el ticket ahí esté la BD". Sube el
// archivo a GridFS Y avanza a "entregado" en un solo paso (mismo efecto
// de auto-resolver que ya tiene PUT /:id/bi-stage al llegar ahí) — así
// BI no repite la acción en dos lugares.
router.post('/:id/bi-deliver', (req, res, next) => {
  uploadBiDeliverable.single('deliverable')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir el archivo' });
    next();
  });
}, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (ticket.ticketType !== 'soporte_bi' || ticket.biRequestKind !== 'bases_datos') {
      return res.status(400).json({ message: 'Esta acción es solo para solicitudes de Bases de Datos' });
    }
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    if (['resuelto', 'cerrado'].includes(ticket.status)) {
      return res.status(400).json({ message: 'Un ticket resuelto o cerrado ya no se puede modificar.' });
    }
    if (!ticket.biApprovedAt) {
      return res.status(400).json({ message: 'Aprueba la solicitud antes de entregar la base de datos' });
    }
    if (!req.file) return res.status(400).json({ message: 'Adjunta el archivo a entregar' });

    // Si ya había un archivo entregado antes (se vuelve a subir), se borra
    // el viejo de GridFS para no dejar basura huérfana.
    if (ticket.biDeliverableId) await deleteFile(ticket.biDeliverableId, 'biDeliverables');

    const fileId = await uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype, 'biDeliverables');
    ticket.biDeliverableId = fileId;
    ticket.biDeliverableMimeType = req.file.mimetype;
    ticket.biDeliverableFileName = req.file.originalname;
    ticket.biDeliveredAt = new Date();
    ticket.biDeliveredByName = req.user.name;

    ticket.biStage = 'entregado';
    ticket.biStageUpdatedAt = new Date();
    ticket.biStageUpdatedByName = req.user.name;
    // Pedido explícito del usuario (2026-07-31): al entregar la base de
    // datos, el estatus visible al empleado en Mis Solicitudes debe ser
    // "cerrado" (no "resuelto" — ese vocabulario quedó para tickets
    // normales, ver PUT /:id/status).
    if (!ticket.resolvedAt) {
      ticket.status = 'cerrado';
      ticket.resolution = 'Entregado por BI';
      ticket.resolvedByName = req.user.name;
      ticket.resolvedAt = new Date();
    }

    await ticket.save();
    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Entregó la base de datos del ticket ${ticket.folio}`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Sistemas responde sin necesidad de marcar el ticket como resuelto —
// permite ida y vuelta real ("¿me pasas una captura?", "ya lo intenté, sigue
// igual") antes de llegar a una resolución formal.
router.post('/:id/reply', (req, res, next) => {
  upload.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la imagen' });
    next();
  });
}, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede responderlo' });
    }
    const text = (req.body.text || '').trim();
    if (!text && !req.file) return res.status(400).json({ message: 'Escribe un mensaje o adjunta una imagen' });

    // Pedido explícito del usuario (2026-07-28): "no tiene sentido" poder
    // contestarle al empleado sin que el ticket quede asignado a alguien —
    // en vez de agregar un paso extra (obligar a asignarse antes de poder
    // escribir), la primera respuesta a un ticket sin asignar lo asigna de
    // una vez a quien contesta (mismo momento, un solo paso).
    const autoAssigned = !ticket.assignedTo;
    if (autoAssigned) {
      ticket.assignedTo = req.user.id;
      ticket.assignedByName = req.user.name;
      ticket.assignedAt = new Date();
    }

    ticket.messages.push({
      from: 'admin',
      authorName: req.user.name,
      text,
      attachmentData:     req.file?.buffer,
      attachmentMimeType:  req.file?.mimetype || '',
      attachmentFileName:  req.file?.originalname || '',
    });
    if (ticket.status === 'abierto') ticket.status = 'en_proceso';
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject,
      autoAssigned ? `Se asignó el ticket ${ticket.folio} al contestarlo` : `Respondió el ticket ${ticket.folio}`);

    // Fire-and-forget — que Sistemas nunca espere ni se entere si el push
    // falla (sin llaves VAPID configuradas, sin suscripción activa, etc.).
    sendPushToEmployee(ticket.employeeRef, {
      title: 'Sistemas respondió tu ticket',
      body: text ? text.slice(0, 120) : 'Revisa la imagen adjunta',
      url: `/mesa-de-ayuda/mis-tickets?ticket=${ticket._id}`,
    }).catch(() => {});

    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Bitácora técnica interna — pedido explícito, tomado de un trabajo anterior
// del usuario: "notas privadas" que solo ve el equipo de Sistemas (cómo se
// resolvió de verdad, a dónde se entró, etc.), separadas de la conversación
// pública con quien reportó, para que quede buscable en tickets futuros con
// un problema parecido. Nunca se manda al empleado (ver stripInternal y las
// rutas employeeAuth de arriba).
router.post('/:id/internal-notes', (req, res, next) => {
  uploadNoteAttachment.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir el archivo' });
    next();
  });
}, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede agregar notas internas' });
    }
    if (ticket.status === 'cerrado') {
      return res.status(400).json({ message: 'Este ticket ya está cerrado — las notas internas quedan como solo lectura.' });
    }
    const text = (req.body.text || '').trim();
    if (!text && !req.file) return res.status(400).json({ message: 'Escribe una nota o adjunta un archivo' });

    const note = { authorName: req.user.name, text };
    if (req.file) {
      note.attachmentId = await uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
      note.attachmentMimeType = req.file.mimetype;
      note.attachmentFileName = req.file.originalname;
    }
    ticket.internalNotes.push(note);
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Agregó una nota interna al ticket ${ticket.folio}`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Notas PÚBLICAS — pedido explícito del usuario (2026-08-03): a diferencia
// de las internas (facturas/tickets del proveedor, nunca visibles para el
// empleado), estas sí las ve quien reportó (ej. avisarle "vamos así" del
// seguimiento con un proveedor externo, sin exponer lo interno). Mismo
// molde/validaciones que POST /:id/internal-notes de arriba.
router.post('/:id/public-notes', (req, res, next) => {
  uploadNoteAttachment.single('attachment')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir el archivo' });
    next();
  });
}, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede agregar notas públicas' });
    }
    if (ticket.status === 'cerrado') {
      return res.status(400).json({ message: 'Este ticket ya está cerrado — las notas públicas quedan como solo lectura.' });
    }
    const text = (req.body.text || '').trim();
    if (!text && !req.file) return res.status(400).json({ message: 'Escribe una nota o adjunta un archivo' });

    const note = { authorName: req.user.name, text };
    if (req.file) {
      note.attachmentId = await uploadBuffer(req.file.buffer, req.file.originalname, req.file.mimetype);
      note.attachmentMimeType = req.file.mimetype;
      note.attachmentFileName = req.file.originalname;
    }
    ticket.publicNotes.push(note);
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Agregó una nota pública al ticket ${ticket.folio}`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Adjunto de una nota interna (imagen/video, ver GridFS en utils/gridfs.js)
// — vive DESPUÉS de router.use(auth, ...) de arriba (línea ~712), a
// diferencia del análogo de mensajes (GET /:id/messages/:messageId/attachment,
// que sí valida el JWT a mano porque el empleado también puede verlo): las
// notas internas NUNCA deben llegar al empleado, así que basta el gate de
// admin/ERP que ya protege todo lo de abajo.
router.get('/:id/internal-notes/:noteId/attachment', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    const note = ticket.internalNotes.id(req.params.noteId);
    if (!note || !note.attachmentId) return res.status(404).json({ message: 'Sin adjunto' });

    res.setHeader('Content-Type', note.attachmentMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${note.attachmentFileName || 'adjunto'}"`);
    downloadStream(note.attachmentId)
      .on('error', () => res.status(404).end())
      .pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede eliminarlo' });
    }
    // GridFS es una colección aparte (ver utils/gridfs.js) — borrar el
    // Ticket no limpia esos archivos solo, quedarían huérfanos para siempre.
    await Promise.all(
      ticket.internalNotes.filter((n) => n.attachmentId).map((n) => deleteFile(n.attachmentId))
    );
    if (ticket.biDeliverableId) await deleteFile(ticket.biDeliverableId, 'biDeliverables');
    await ticket.deleteOne();
    logAction(req.user, 'eliminar', 'ticket', ticket._id, ticket.subject, `Eliminó el ticket ${ticket.folio}`);
    res.json({ message: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
