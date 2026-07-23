const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const {
  DEFAULT_CONFIG, LOGOS_DIR,
  MARGIN, PAGE_W, CW, DARK, GRAY, GRAY_LT,
  guard, hline, kvRow,
} = require('./pdfBranding');

// BI no tiene acceso al sistema de tickets (pedido explícito del usuario,
// 2026-07-23) — así que "Solicitar bases de datos" necesita, igual que las
// Solicitudes de Cuenta, un documento que se manda por correo con todo el
// detalle, en vez de solo un link al panel que BI no puede abrir. A
// diferencia de la Solicitud de Proyecto (que rellena el .docx oficial
// existente, ver biProjectDocx.js), aquí no hay ningún documento previo que
// replicar — es un PDF nuevo, con el mismo look & feel que
// accountRequestPdf.js (mismos colores/helpers de pdfBranding.js), pero de
// una sola sección porque los datos ya son un filtro simple.
const TIPO_LABELS = { ventas: 'Ventas', inventarios: 'Inventarios' };

const PLATAFORMA_LABELS = {
  erp: 'ERP',
  amazon: 'Amazon',
  ml: 'ML (Mercado Libre)',
  tiktok: 'Tiktok',
  walmart: 'Walmart',
  coppel: 'Coppel',
  realtrends: 'RealTrends',
};

const TIENDA_LABELS = {
  select_shop: 'Select Shop',
  nexu: 'Nexu',
  medical_store: 'Medical Store',
  armaf_ocenid: 'Armaf/Ocenid',
  signa: 'Signa',
  t_lab: 'T-lab',
  fontastic: 'Fontastic',
  creativa_integral: 'Creativa Integral',
};

function platformLabel(req) {
  if (req.plataforma === 'otra') return req.plataformaOtra || 'Otra';
  return PLATAFORMA_LABELS[req.plataforma] || req.plataforma;
}

function formatFecha(value) {
  if (!value) return '—';
  // Los rangos vienen como 'YYYY-MM-DD' de un <input type="date"> — se
  // arma la fecha a mano (no con `new Date(value)`) para no perder un día
  // por el desfase de zona horaria al interpretarla como UTC medianoche.
  const [y, m, d] = value.split('-');
  return `${d}/${m}/${y}`;
}

function drawHeader(doc, { folio, dateStr }) {
  const { color: ACCENT, logo: logoFile } = DEFAULT_CONFIG;
  const logoPath = path.join(LOGOS_DIR, logoFile);
  const hasLogo = fs.existsSync(logoPath);

  let y = MARGIN;
  if (hasLogo) {
    try { doc.image(logoPath, MARGIN, y, { fit: [90, 36] }); } catch (_) {}
  }

  const textX = MARGIN + (hasLogo ? 100 : 0);
  const textW = CW - (hasLogo ? 100 : 0) - 130;

  const badgeW = 72, badgeH = 15;
  doc.save().roundedRect(textX, y, badgeW, badgeH, 3).stroke(ACCENT).restore();
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7)
     .text('SOLICITUD', textX, y + 4, { width: badgeW, align: 'center', lineBreak: false });

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11.5)
     .text('Solicitud de Base de Datos — Soporte BI', textX, y + badgeH + 6, { width: textW });

  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
     .text(`Folio: ${folio}`, PAGE_W - MARGIN - 130, y, { width: 130, align: 'right', lineBreak: false });
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
     .text(`Fecha: ${dateStr}`, PAGE_W - MARGIN - 130, y + 10, { width: 130, align: 'right', lineBreak: false });

  y += 48;
  doc.fillColor(GRAY).font('Helvetica').fontSize(7)
     .text('Select Shop MB · Sistemas — enviado a Soporte BI', MARGIN, y, { width: CW, lineBreak: false });
  y += 11;
  hline(doc, y, ACCENT, 0.75);
  y += 6;
  return { y, ACCENT };
}

function drawRequestSection(doc, y, ACCENT, ticket, req) {
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(8)
     .text('Detalle de la solicitud', MARGIN, y, { width: CW, lineBreak: false });
  y += 12;
  hline(doc, y, ACCENT, 0.75);
  y += 6;

  y = kvRow(doc, y,
    { label: 'Solicitante', value: ticket.employeeName },
    { label: 'Base de datos', value: TIPO_LABELS[req.tipo] || req.tipo });
  y = kvRow(doc, y,
    { label: 'Plataforma', value: platformLabel(req) },
    { label: 'Tienda', value: TIENDA_LABELS[req.tienda] || req.tienda });
  y = kvRow(doc, y,
    { label: 'Periodo — desde', value: formatFecha(req.startDate) },
    { label: 'Periodo — hasta', value: formatFecha(req.endDate) });
  y += 5;
  return y;
}

function drawFooter(doc, y) {
  y = guard(doc, y, 30);
  doc.fillColor(GRAY_LT).font('Helvetica-Oblique').fontSize(6.5)
     .text('Generado automáticamente por el sistema de tickets al enviar la solicitud — Soporte BI no tiene acceso al panel, por eso se adjunta este documento en el correo.',
       MARGIN, y, { width: CW });
}

function buildBiDatabaseRequestPdf(ticket) {
  return new Promise((resolve, reject) => {
    const req = ticket.biDatabaseRequest || {};
    const folio = ticket.folio;
    const dateStr = new Date(ticket.createdAt || Date.now())
      .toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });

    const doc = new PDFDocument({
      size: 'LETTER',
      margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
      autoFirstPage: true,
      bufferPages: true,
    });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const { y: y0, ACCENT } = drawHeader(doc, { folio, dateStr });
    const y = drawRequestSection(doc, y0, ACCENT, ticket, req);
    drawFooter(doc, y);

    doc.end();
  });
}

module.exports = { buildBiDatabaseRequestPdf };
