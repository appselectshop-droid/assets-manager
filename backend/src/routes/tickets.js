const router = require('express').Router();
const multer = require('multer');
const jwt = require('jsonwebtoken');
const Ticket = require('../models/Ticket');
const TicketResolutionOption = require('../models/TicketResolutionOption');
const InternalApp = require('../models/InternalApp');
const Assignment = require('../models/Assignment');
const User = require('../models/User');
const auth = require('../middleware/auth');
const employeeAuth = require('../middleware/employeeAuth');
const { notifyTelegram } = require('../utils/telegram');
const { notifyEmail } = require('../utils/graphMail');
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

// "Soporte BI" — módulo independiente (como Hardware/Software), NO un
// InternalApp con apartados, así que se enruta directo por `ticketType`
// (ver getTicketEmailRecipients de abajo), no por nombre de app. Pedido
// explícito del usuario 2026-07-23: los 2 correos SIEMPRE reciben, sin
// importar si es "Solicitar proyecto" o "Solicitar bases de datos".
const BI_EMAILS = ['lider.bi@selectshop.com.mx', 'analista.bi2@selectshop.com.mx'];

// Regresa `{ emails, audience }` — `audience` decide qué plantilla de
// correo usar (ver buildTicketNotificationEmail/buildExternalTicketNotifi-
// cationEmail en utils/emailTemplates.js): 'sistemas' para Sistemas/ERP/BI
// (la plantilla técnica de siempre, sin cambios), 'externo' para equipos
// genuinamente ajenos a Sistemas.
async function getTicketEmailRecipients(ticket, appName) {
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
    const subarea = (ticket.otherTypeDetail || '').trim().toLowerCase();
    const rule = SOLICITUD_PAGOS_RECIPIENTS.find((r) => subarea.includes(r.match));
    if (rule) return { emails: rule.emails, audience: rule.audience };
    // Apartado desconocido/dato viejo — cae al enrutamiento general de abajo
    // en vez de perderse sin avisar a nadie.
  }

  // Ventas: exclusivo a un solo correo, sin importar el apartado.
  if (normalizedAppName.includes(VENTAS_APP_NAME)) return { emails: [VENTAS_EMAIL], audience: 'sistemas' };

  // Gestor de Constancias Aduaneras: mismo criterio, un solo correo.
  if (normalizedAppName.includes(GESTOR_CONSTANCIAS_APP_NAME)) return { emails: [GESTOR_CONSTANCIAS_EMAIL], audience: 'sistemas' };

  const recipients = new Set();
  if (ticket.ticketType === 'erp') {
    const erpUsers = await User.find({
      role: { $ne: 'admin' },
      canManagePlatformAccountsErp: true,
      canManageGmailAccounts: false,
      canManagePlatformAccounts: false,
    }).select('email');
    erpUsers.forEach((u) => recipients.add(u.email));
  } else {
    const sistemasUsers = await User.find({ role: 'admin' }).select('email');
    sistemasUsers.forEach((u) => recipients.add(u.email));
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
function canManageTicket(req, ticket) {
  if (req.user.role === 'admin') return true;
  if (req.user.email === GERENTE_SISTEMAS_EMAIL) return true;
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

// Pedido explícito: los tickets de tipo 'erp' SOLO los ve el equipo de ERP
// (lider.erp/analista.erp) — el resto de Sistemas nunca los ve, ni siquiera
// que existen. Es una partición completa, no un permiso adicional: quien es
// ERP-only ve ÚNICAMENTE tickets erp; todos los demás ven todo MENOS los erp.
function canViewTicket(req, ticket) {
  return isErpOnlyUser(req.user) ? ticket.ticketType === 'erp' : ticket.ticketType !== 'erp';
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

function assetLabel(asset) {
  if (!asset) return '';
  return [asset.brand, asset.model].filter(Boolean).join(' ') + (asset.serialNumber ? ` (${asset.serialNumber})` : '');
}

// Cierre automático — un ticket "resuelto" sin que el empleado responda en
// AUTO_CLOSE_DAYS pasa solo a "cerrado" (se entiende que sí quedó bien). No
// hay cron real en este proyecto (Render free tier se duerme y no lo
// correría de todos modos), así que se revisa "perezosamente": cada vez que
// se pide la lista de tickets (admin o empleado), primero se cierran los que
// ya cumplieron el plazo. Un mensaje nuevo del empleado ya reabre el ticket
// (ver POST /:id/messages) antes de que esto aplique, así que nunca cierra
// uno que sigue en curso.
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
    // ver utils/biProjectDocx.js) o "Solicitar bases de datos" (solo datos
    // estructurados, sin documento — la vista previa que ya vio quien
    // solicita en el wizard ES el detalle completo). Se revalida aquí (no
    // solo en el frontend) por la misma razón que "Alta de Proveedores"
    // arriba: cualquiera podría llamar la ruta directo.
    let biRequestKind;
    let biProjectData;
    let biDatabaseRequest;
    let biDocFile; // { data, mimeType, fileName } si se generó un documento
    if (body.ticketType === 'soporte_bi') {
      biRequestKind = body.biRequestKind;
      if (!['proyecto', 'bases_datos'].includes(biRequestKind)) {
        return res.status(400).json({ message: 'Falta indicar si es Solicitud de Proyecto o de Bases de Datos' });
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
      } else {
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
      assetRefs,
      appRef,
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
      `Revisa en Tickets.`
    );

    // Igual que Telegram, sin await — nunca debe demorar ni romper la
    // respuesta al empleado si el cálculo de destinatarios o el envío falla.
    getTicketEmailRecipients(ticket, appName).then(({ emails, audience }) => {
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
router.get('/mine', employeeAuth, async (req, res) => {
  try {
    await autoCloseStaleResolved();
    const tickets = await Ticket.find({
      employeeRef: req.employee.employeeRef,
      ticketType: { $ne: 'soporte_bi' },
    })
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
    }).sort({ createdAt: -1 });
    res.json(tickets.map(stripInternal));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// El empleado da seguimiento a su propio ticket — conversación de ida y
// vuelta real, no solo el reporte inicial + resolución formal. Un mensaje
// nuevo sobre un ticket ya "resuelto" implica que el problema sigue, así
// que se reabre solo (mismo criterio que ya usa el "Reabrir" manual de
// Sistemas: limpia la resolución anterior, para que no quede colgada como
// si todavía aplicara).
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
    if (ticket.status === 'resuelto') {
      ticket.status = 'abierto';
      ticket.resolution = '';
      ticket.resolutionNotes = '';
      ticket.resolvedByName = '';
      ticket.resolvedAt = undefined;
      // Se reabrió — la calificación anterior ya no aplica a esta nueva
      // vuelta; puede volver a calificar cuando se resuelva otra vez.
      ticket.satisfactionRating = null;
    }
    await ticket.save();

    notifyTelegram(
      `💬 <b>Nuevo mensaje en ${ticket.folio}</b>\n` +
      `👤 ${req.employee.name}\n` +
      `📝 ${text || '[imagen adjunta]'}\n` +
      `Revisa en Tickets.`
    );

    res.status(201).json(stripInternal(ticket));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// El empleado confirma que ya quedó resuelto y lo cierra él mismo — no hace
// falta esperar los 5 días del cierre automático (autoCloseStaleResolved) si
// ya sabe que no lo va a necesitar reabrir.
router.post('/:id/close', employeeAuth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (String(ticket.employeeRef) !== String(req.employee.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }
    if (ticket.status !== 'resuelto') {
      return res.status(400).json({ message: 'Solo se puede cerrar un ticket ya resuelto' });
    }
    ticket.status = 'cerrado';
    await ticket.save();
    res.json(stripInternal(ticket));
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Encuesta de satisfacción (CSAT) — solo el empleado dueño del ticket, y solo
// una vez resuelto/cerrado. Se puede volver a llamar para cambiar la
// respuesta (no se guarda historial, solo el valor actual).
router.post('/:id/satisfaction', employeeAuth, async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (String(ticket.employeeRef) !== String(req.employee.employeeRef)) {
      return res.status(403).json({ message: 'Este ticket no es tuyo' });
    }
    if (!['resuelto', 'cerrado'].includes(ticket.status)) {
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

// Ya no es adminOnly a secas: lider.erp/analista.erp (viewer + solo permiso
// ERP) también entran a Tickets, pero acotados a los de tipo 'erp' — ver
// canViewTicket() para el filtrado real por ticket.
router.use(auth, (req, res, next) => {
  if (req.user.role === 'admin' || isErpOnlyUser(req.user)) return next();
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
    filter.ticketType = isErpOnlyUser(req.user) ? 'erp' : { $ne: 'erp' };
    const tickets = await Ticket.find(filter)
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
// un ticket con 2 equipos cuente para cada uno de los dos. Se excluyen los
// de tipo 'erp' del conteo que ve Sistemas (y viceversa para ERP), mismo
// criterio de partición que el resto de esta ruta.
router.get('/counts-by-asset', async (req, res) => {
  try {
    const typeFilter = isErpOnlyUser(req.user) ? 'erp' : { $ne: 'erp' };
    const counts = await Ticket.aggregate([
      { $match: { assetRefs: { $ne: [] }, ticketType: typeFilter } },
      { $unwind: '$assetRefs' },
      { $group: { _id: '$assetRefs', count: { $sum: 1 } } },
    ]);
    res.json(counts.map((c) => ({ assetRef: c._id, count: c.count })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/resolution-options', async (req, res) => {
  try {
    const options = await TicketResolutionOption.find().sort({ label: 1 }).select('label');
    res.json(options.map((o) => o.label));
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
    const users = await User.find(filter).select('name').sort({ name: 1 });
    res.json(users);
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
router.put('/:id/escalate', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede modificarlo' });
    }
    const { escalated, reason } = req.body;
    ticket.escalated = !!escalated;
    if (ticket.escalated) {
      ticket.escalationReason = (reason || '').trim();
      ticket.escalatedByName = req.user.name;
      ticket.escalatedAt = new Date();
    } else {
      ticket.escalationReason = '';
      ticket.escalatedByName = '';
      ticket.escalatedAt = null;
    }
    await ticket.save();
    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, ticket.escalated
      ? `Escaló el ticket ${ticket.folio}${ticket.escalationReason ? `: ${ticket.escalationReason}` : ''}`
      : `Quitó el escalamiento del ticket ${ticket.folio}`);
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
    if (status === 'resuelto' && !ticket.resolvedAt) {
      if (!(resolution || '').trim()) return res.status(400).json({ message: 'Selecciona cómo se resolvió' });
      ticket.resolution = resolution.trim();
      ticket.resolutionNotes = (resolutionNotes || '').trim();
      ticket.resolvedByName = req.user.name;
      ticket.resolvedAt = new Date();

      if (addToCatalog && resolution.trim()) {
        try {
          await TicketResolutionOption.create({ label: resolution.trim(), addedByName: req.user.name });
        } catch (err) {
          if (err.code !== 11000) throw err; // 11000 = ya existía, se ignora
        }
      }
    }
    // Reabrir (de resuelto/cerrado a abierto/en_proceso) limpia la resolución
    // anterior — si vuelve a fallar, no debe quedar la nota vieja como si
    // aplicara todavía.
    if (['abierto', 'en_proceso'].includes(status) && ['resuelto', 'cerrado'].includes(ticket.status)) {
      ticket.resolution = '';
      ticket.resolutionNotes = '';
      ticket.resolvedByName = '';
      ticket.resolvedAt = undefined;
    }
    ticket.status = status;
    await ticket.save();

    const actionByStatus = { resuelto: 'resolver', cerrado: 'editar', abierto: 'editar', en_proceso: 'editar' };
    logAction(req.user, actionByStatus[status], 'ticket', ticket._id, ticket.subject, `Cambió el ticket ${ticket.folio} a estatus "${status}"`);

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

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Respondió el ticket ${ticket.folio}`);
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
router.post('/:id/internal-notes', async (req, res) => {
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
    if (!text) return res.status(400).json({ message: 'Escribe una nota' });

    ticket.internalNotes.push({ authorName: req.user.name, text });
    await ticket.save();

    logAction(req.user, 'editar', 'ticket', ticket._id, ticket.subject, `Agregó una nota interna al ticket ${ticket.folio}`);
    res.json(ticket);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const ticket = await Ticket.findById(req.params.id);
    if (!ticket || !canViewTicket(req, ticket)) return res.status(404).json({ message: 'Ticket no encontrado' });
    if (!canManageTicket(req, ticket)) {
      return res.status(403).json({ message: 'Solo quien tiene asignado este ticket (o el Gerente de Sistemas) puede eliminarlo' });
    }
    await ticket.deleteOne();
    logAction(req.user, 'eliminar', 'ticket', ticket._id, ticket.subject, `Eliminó el ticket ${ticket.folio}`);
    res.json({ message: 'Ticket eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
