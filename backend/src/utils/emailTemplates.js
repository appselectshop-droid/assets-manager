// Plantillas de correo (contenido) — separado de utils/graphMail.js (que
// solo sabe CÓMO mandar un correo por Microsoft Graph, no qué dice). HTML
// "a prueba de Outlook de escritorio" a propósito: layout de tablas y
// estilos inline únicamente, nada de flexbox/grid/CSS moderno ni imágenes
// externas — el motor de render de Outlook (basado en Word) no soporta la
// mayoría de eso y el correo se vería roto para quien más lo va a usar.

const BRAND_COLOR = '#E8431A'; // mismo naranja de SelectShop MB que usa el resto de la app
const FONT = "Arial, Helvetica, sans-serif";

const PRIORITY_LABELS = {
  critica: { label: 'Crítica', color: '#9333ea' },
  alta:    { label: 'Alta',    color: '#dc2626' },
  media:   { label: 'Media',   color: '#d97706' },
  baja:    { label: 'Baja',    color: '#16a34a' },
};

function escapeHtml(str) {
  return String(str || '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

function formatDateTime(date) {
  if (!date) return '';
  return new Date(date).toLocaleString('es-MX', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit',
  });
}

function row(label, value) {
  if (!value) return '';
  return `
    <tr>
      <td style="padding:7px 0; width:150px; font-family:${FONT}; font-size:13px; color:#888; vertical-align:top;">${label}</td>
      <td style="padding:7px 0; font-family:${FONT}; font-size:13px; color:#222; vertical-align:top;">${value}</td>
    </tr>`;
}

// "Alta de Proveedores" (Solicitud de Pagos) — pedido explícito del equipo
// de Pagos (2026-07-22): los 2 problemas marcados `providerFields: true` en
// ticketCategories.js piden nombre/correo/teléfono/datos bancarios del
// proveedor como campos estructurados (ver Ticket.js/routes/tickets.js) —
// se muestran en ambas plantillas cuando existen, no solo en una. La CSF
// no se imprime aquí (es un archivo, no texto): viaja incrustada en el
// correo mismo solo para la plantilla externa (ver notifyEmail/graphMail.js
// y el call site en routes/tickets.js), ya que ese destinatario no tiene
// sesión en el panel para ir a descargarla desde ahí.
function providerSection(ticket) {
  if (!ticket.providerName) return '';
  const rows = [
    row('Proveedor', escapeHtml(ticket.providerName)),
    row('Correo', escapeHtml(ticket.providerEmail)),
    row('Teléfono', escapeHtml(ticket.providerPhone)),
    row('Datos bancarios', ticket.providerBankDetails ? `<span style="white-space:pre-wrap;">${escapeHtml(ticket.providerBankDetails)}</span>` : ''),
  ].join('');
  return `
            <div style="margin-top:22px; padding-top:20px; border-top:1px solid #eee;">
              <div style="font-family:${FONT}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin-bottom:6px;">Datos del proveedor</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${rows}
              </table>
            </div>`;
}

// "Solicitar bases de datos" (Soporte BI) — pedido explícito del usuario
// (2026-07-23): ya no genera PDF adjunto ("es muy poquita información para
// un PDF") — el detalle completo del filtro va directo en el cuerpo del
// correo. Mismos catálogos que frontend/src/components/BiDatabaseForm.jsx.
const BI_TIPO_LABELS = { ventas: 'Ventas', inventarios: 'Inventarios' };
const BI_PLATAFORMA_LABELS = {
  erp: 'ERP', amazon: 'Amazon', ml: 'ML (Mercado Libre)', tiktok: 'Tiktok',
  walmart: 'Walmart', coppel: 'Coppel', realtrends: 'RealTrends',
};
const BI_TIENDA_LABELS = {
  select_shop: 'Select Shop', nexu: 'Nexu', medical_store: 'Medical Store',
  armaf_ocenid: 'Armaf/Ocenid', signa: 'Signa', t_lab: 'T-lab',
  fontastic: 'Fontastic', creativa_integral: 'Creativa Integral',
};

// Los rangos vienen como 'YYYY-MM-DD' de un <input type="date"> — se arma
// la fecha a mano (no con `new Date(value)`) para no perder un día por el
// desfase de zona horaria al interpretarla como UTC medianoche.
function formatFechaSimple(value) {
  if (!value) return '';
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function biDatabaseSection(ticket) {
  if (ticket.ticketType !== 'soporte_bi' || ticket.biRequestKind !== 'bases_datos') return '';
  const req = ticket.biDatabaseRequest || {};
  const plataforma = req.plataforma === 'otra'
    ? (req.plataformaOtra || 'Otra')
    : (BI_PLATAFORMA_LABELS[req.plataforma] || req.plataforma);
  const rows = [
    row('Base de datos', escapeHtml(BI_TIPO_LABELS[req.tipo] || req.tipo)),
    row('Plataforma', escapeHtml(plataforma)),
    row('Tienda', escapeHtml(BI_TIENDA_LABELS[req.tienda] || req.tienda)),
    row('Periodo solicitado', escapeHtml(`${formatFechaSimple(req.startDate)} — ${formatFechaSimple(req.endDate)}`)),
  ].join('');
  return `
            <div style="margin-top:22px; padding-top:20px; border-top:1px solid #eee;">
              <div style="font-family:${FONT}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin-bottom:6px;">Detalle de la solicitud</div>
              <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
                ${rows}
              </table>
            </div>`;
}

// `ticket` ya trae `priority`/`slaCategory`/`slaLevel`/`resolutionDueAt`
// resueltos si `applySlaCategory` corrió antes de llamar a esto (ver
// routes/tickets.js) — no hace falta volver a calcularlos aquí.
function buildTicketNotificationEmail(ticket, { employeeName, otherTypeDetail, typeLabel, assetsLabel, appName, ticketsUrl }) {
  const priority = PRIORITY_LABELS[ticket.priority] || PRIORITY_LABELS.media;
  const subjectLine = escapeHtml(ticket.subject);

  const blocksWorkBanner = ticket.blocksWork ? `
    <tr>
      <td style="background:#fef2f2; border-bottom:1px solid #fecaca; padding:12px 28px; font-family:${FONT}; font-size:13px; color:#b91c1c; font-weight:bold;">
        ⚠️ Le impide trabajar a la persona que reportó — atender a la brevedad.
      </td>
    </tr>` : '';

  const slaRow = ticket.slaCategory
    ? row('Categoría de Falla', `${escapeHtml(ticket.slaCategory)}${ticket.resolutionDueAt ? ` — resolución límite ${formatDateTime(ticket.resolutionDueAt)}` : ''}`)
    : '';

  const detailRows = [
    row('Folio', `<strong>${escapeHtml(ticket.folio)}</strong>`),
    row('Fecha de reporte', formatDateTime(ticket.createdAt)),
    row('Reportado por', escapeHtml(employeeName)),
    row('Tipo de soporte', `${escapeHtml(typeLabel)}${otherTypeDetail ? `: ${escapeHtml(otherTypeDetail)}` : ''}`),
    row('Prioridad', `<span style="color:${priority.color}; font-weight:bold;">${priority.label}</span>`),
    slaRow,
    row('Equipo', assetsLabel ? escapeHtml(assetsLabel) : ''),
    row('Aplicación', appName ? escapeHtml(appName) : ''),
  ].join('');

  // Sin botón para Soporte BI — pedido explícito del usuario (2026-07-23):
  // BI no tiene acceso al sistema de tickets, así que un link al panel no
  // les sirve de nada (mismo motivo por el que "Solicitud de Proyecto"
  // manda su .docx directo adjunto en vez de solo un link).
  const ctaButton = (ticketsUrl && ticket.ticketType !== 'soporte_bi') ? `
    <div style="margin-top:26px; text-align:center;">
      <a href="${ticketsUrl}" style="background:${BRAND_COLOR}; color:#ffffff; text-decoration:none; padding:12px 26px; border-radius:6px; font-family:${FONT}; font-size:14px; font-weight:bold; display:inline-block;">
        Ver ticket en el panel
      </a>
    </div>` : '';

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #e5e5e5; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:${BRAND_COLOR}; padding:20px 28px;">
            <div style="font-family:${FONT}; font-size:18px; font-weight:bold; color:#ffffff;">Assets Manager</div>
            <div style="font-family:${FONT}; font-size:12px; color:#ffe4d9; margin-top:2px;">Sistemas IT &amp; BI — Nuevo ticket de soporte</div>
          </td>
        </tr>
        ${blocksWorkBanner}
        <tr>
          <td style="padding:28px;">
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${detailRows}
            </table>
            <div style="margin-top:22px; padding-top:20px; border-top:1px solid #eee;">
              <div style="font-family:${FONT}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin-bottom:6px;">Asunto</div>
              <div style="font-family:${FONT}; font-size:15px; color:#111; font-weight:bold;">${subjectLine}</div>
            </div>
            ${ticket.description ? `
            <div style="margin-top:16px;">
              <div style="font-family:${FONT}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin-bottom:6px;">Descripción</div>
              <div style="font-family:${FONT}; font-size:14px; color:#333; line-height:1.5; white-space:pre-wrap;">${escapeHtml(ticket.description)}</div>
            </div>` : ''}
            ${providerSection(ticket)}
            ${biDatabaseSection(ticket)}
            ${ctaButton}
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa; padding:16px 28px; border-top:1px solid #eee;">
            <div style="font-family:${FONT}; font-size:11px; color:#999;">
              Este es un aviso automático del sistema de Tickets de Assets Manager — no respondas a este correo${ticket.ticketType === 'soporte_bi' ? '.' : ', da seguimiento desde el panel.'}
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  return {
    subject: `Ticket #${ticket.folio} — ${typeLabel}${ticket.blocksWork ? ' (impide trabajar)' : ''}`,
    html,
  };
}

// Pedido explícito del usuario (2026-07-22): la plantilla de arriba está
// "PERFECTA" para Sistemas/ERP/BI (aunque el destinatario tenga correo o
// puesto de otra área, como lider.erp/analista.erp — para efectos de este
// aviso son del mismo equipo de Sistemas), pero se siente "brusca" para
// destinatarios genuinamente externos (ej. gerente.contabilidad@,
// pagos@ — reciben ciertos apartados de "Solicitud de Pagos" enrutados
// directo a ellos, sin pasar por Sistemas) — el usuario reportó que un
// correo con ese tono técnico/urgente (SLA, prioridad en rojo, aviso de
// "impide trabajar") los alarmaría sin necesidad, ya que ni siquiera tienen
// acceso al panel para darle seguimiento ahí. Esta versión quita todo lo
// técnico/urgente (SLA, prioridad, el aviso rojo de "impide trabajar", tipo
// de soporte, equipo) y el botón "Ver ticket en el panel" (no tienen sesión
// ahí) — se queda solo con lo que de verdad les sirve para identificar la
// solicitud (folio, quién la mandó, asunto, descripción) en un tono cálido.
function buildExternalTicketNotificationEmail(ticket, { employeeName, appName }) {
  const subjectLine = escapeHtml(ticket.subject);

  const detailRows = [
    row('Folio', `<strong>${escapeHtml(ticket.folio)}</strong>`),
    row('Fecha', formatDateTime(ticket.createdAt)),
    row('Solicitado por', escapeHtml(employeeName)),
    row('Aplicación', appName ? escapeHtml(appName) : ''),
  ].join('');

  const html = `
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f4f4f5; padding:24px 0;">
  <tr>
    <td align="center">
      <table role="presentation" width="600" cellpadding="0" cellspacing="0" style="background:#ffffff; border:1px solid #e5e5e5; border-radius:8px; overflow:hidden;">
        <tr>
          <td style="background:${BRAND_COLOR}; padding:20px 28px;">
            <div style="font-family:${FONT}; font-size:18px; font-weight:bold; color:#ffffff;">Select Shop MB</div>
            <div style="font-family:${FONT}; font-size:12px; color:#ffe4d9; margin-top:2px;">Hemos recibido una nueva solicitud</div>
          </td>
        </tr>
        <tr>
          <td style="padding:28px;">
            <div style="font-family:${FONT}; font-size:14px; color:#333; line-height:1.5; margin-bottom:22px;">
              Hola, te compartimos el detalle de una solicitud que acaba de llegar y que le corresponde a tu equipo:
            </div>
            <table role="presentation" width="100%" cellpadding="0" cellspacing="0">
              ${detailRows}
            </table>
            <div style="margin-top:22px; padding-top:20px; border-top:1px solid #eee;">
              <div style="font-family:${FONT}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin-bottom:6px;">Asunto</div>
              <div style="font-family:${FONT}; font-size:15px; color:#111; font-weight:bold;">${subjectLine}</div>
            </div>
            ${ticket.description ? `
            <div style="margin-top:16px;">
              <div style="font-family:${FONT}; font-size:11px; text-transform:uppercase; letter-spacing:0.05em; color:#999; margin-bottom:6px;">Descripción</div>
              <div style="font-family:${FONT}; font-size:14px; color:#333; line-height:1.5; white-space:pre-wrap;">${escapeHtml(ticket.description)}</div>
            </div>` : ''}
            ${providerSection(ticket)}
            ${ticket.providerName ? `
            <div style="margin-top:16px; font-family:${FONT}; font-size:12px; color:#666; font-style:italic;">
              📎 La Constancia de Situación Fiscal (CSF)${ticket.bankProofData ? ' y el comprobante de datos bancarios van adjuntos' : ' va adjunta'} a este correo.
            </div>` : ''}
          </td>
        </tr>
        <tr>
          <td style="background:#fafafa; padding:16px 28px; border-top:1px solid #eee;">
            <div style="font-family:${FONT}; font-size:11px; color:#999;">
              Este es un aviso automático — no hace falta que respondas este correo, solo compártelo con quien deba darle seguimiento.
            </div>
          </td>
        </tr>
      </table>
    </td>
  </tr>
</table>`;

  return {
    subject: `Nueva solicitud recibida — Folio #${ticket.folio}`,
    html,
  };
}

module.exports = { buildTicketNotificationEmail, buildExternalTicketNotificationEmail };
