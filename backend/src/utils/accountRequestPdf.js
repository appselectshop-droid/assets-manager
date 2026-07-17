const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const {
  getEmpresaConfig, LOGOS_DIR,
  MARGIN, PAGE_W, CW, DARK, GRAY, GRAY_LT,
  guard, hline, kvRow,
} = require('./pdfBranding');

// A propósito usa la misma colorimetría (acento/logo por empresa) que la
// Responsiva, pero con un layout más ligero y menos formal — es solo la
// SOLICITUD, no el documento legal final. La Responsiva (con firmas físicas
// y el fundamento legal completo) se genera aparte al aprobarse la cuenta
// (ver responsiva.js / GET '/:id/responsiva' en gmailAccounts.js,
// platformAccounts.js y platformAccountsErp.js) — no se toca aquí.
const TYPE_TITLES = {
  gmail:        'Cuenta de correo (Gmail)',
  platform:     'Acceso a plataformas de venta',
  platform_erp: 'Acceso al ERP',
};
const TYPE_PREFIX = { gmail: 'GMAIL', platform: 'PLAT', platform_erp: 'ERP' };
const ACTION_LABELS = { alta: 'Alta', modificacion: 'Modificación', baja: 'Baja' };

const PERMISSION_LABELS = {
  ventas: 'Ventas al detalle', publicaciones: 'Publicaciones', inventarios: 'Inventarios',
  envio: 'Gestión de envío (Full)', pagos: 'Pagos', facturas: 'Facturas', admin: 'Admin (total)',
};

// Mercado Libre no usa PERMISSION_LABELS — tiene sus propios roles fijos
// (mismas claves que ML_ROLE_KEYS en routes/accountRequests.js y
// ML_ROLE_FIELDS en frontend/src/pages/SolicitarCuenta.jsx).
const ML_ROLE_LABELS = {
  KAM: 'KAM / Comercial', AC: 'Atención al Cliente', ALM: 'Operación / Almacén', BI: 'Business Intelligence',
  CyC: 'Crédito y Cobranza / Finanzas', MKT: 'Marketing / Contenido', AUD: 'Auditoría', BO: 'Back Office',
};
const MERCADO_LIBRE = 'Mercado Libre';

// Encabezado de sección "ligero" — texto en color de acento + una línea
// delgada debajo, sin el fondo de color sólido que usa la Responsiva
// (sectionBand en pdfBranding.js) — misma paleta, menos peso visual.
function lightHeading(doc, y, label, accent) {
  y = guard(doc, y, 20);
  doc.fillColor(accent).font('Helvetica-Bold').fontSize(8)
     .text(label, MARGIN, y, { width: CW, lineBreak: false });
  y += 12;
  hline(doc, y, accent, 0.75);
  return y + 6;
}

function drawHeader(doc, { request, folio, dateStr }) {
  const company = request.businessName || 'SELECT SHOP MB, S.A DE C.V.';
  const { color: ACCENT, logo: logoFile } = getEmpresaConfig(company);
  const logoPath = path.join(LOGOS_DIR, logoFile);
  const hasLogo = fs.existsSync(logoPath);

  let y = MARGIN;
  if (hasLogo) {
    try { doc.image(logoPath, MARGIN, y, { fit: [90, 36] }); } catch (_) {}
  }

  const textX = MARGIN + (hasLogo ? 100 : 0);
  const textW = CW - (hasLogo ? 100 : 0) - 130;

  // Badge "SOLICITUD" — contorno, no relleno sólido, para que no se lea
  // como el encabezado de la Responsiva.
  const badgeW = 72, badgeH = 15;
  doc.save().roundedRect(textX, y, badgeW, badgeH, 3).stroke(ACCENT).restore();
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(7)
     .text('SOLICITUD', textX, y + 4, { width: badgeW, align: 'center', lineBreak: false });

  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(11.5)
     .text(TYPE_TITLES[request.requestType], textX, y + badgeH + 6, { width: textW });

  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
     .text(`Folio: ${folio}`, PAGE_W - MARGIN - 130, y, { width: 130, align: 'right', lineBreak: false });
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
     .text(`Fecha: ${dateStr}`, PAGE_W - MARGIN - 130, y + 10, { width: 130, align: 'right', lineBreak: false });
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
     .text(`Tipo: ${ACTION_LABELS[request.actionType] || 'Alta'}`, PAGE_W - MARGIN - 130, y + 20, { width: 130, align: 'right', lineBreak: false });

  y += 48;
  doc.fillColor(GRAY).font('Helvetica').fontSize(7)
     .text(`${company} · Área de Sistemas`, MARGIN, y, { width: CW, lineBreak: false });
  y += 11;
  hline(doc, y, ACCENT, 0.75);
  y += 3;
  doc.fillColor(GRAY_LT).font('Helvetica-Oblique').fontSize(6.5)
     .text('Pendiente de revisión — la Responsiva correspondiente (con el detalle legal completo) se genera y firma al aprobarse esta solicitud.',
       MARGIN, y, { width: CW, lineBreak: false });
  y += 12;
  return { y, ACCENT };
}

function drawApplicantSection(doc, y, ACCENT, request) {
  y = lightHeading(doc, y, '1. Datos del solicitante', ACCENT);
  y = kvRow(doc, y,
    { label: 'Nombre completo', value: request.employeeName },
    { label: 'No. de empleado', value: request.employeeIdNum });
  y = kvRow(doc, y,
    { label: 'Puesto', value: request.position },
    { label: 'Área / Departamento', value: request.department });
  y = kvRow(doc, y,
    { label: 'Jefe directo', value: request.directManager },
    { label: 'Correo actual', value: request.currentEmail });
  y = kvRow(doc, y,
    { label: 'Empresa / Razón social', value: request.businessName });
  y += 5;
  return y;
}

function drawGmailSection(doc, y, ACCENT, request) {
  y = lightHeading(doc, y, '2. Cuenta de correo (Gmail)', ACCENT);
  y = kvRow(doc, y,
    { label: 'Correo solicitado', value: request.username },
    { label: 'Nombre para mostrar', value: request.gmailDisplayName });
  y = kvRow(doc, y,
    { label: 'Tipo de cuenta', value: request.gmailAccountKind },
    { label: 'Uso principal', value: request.gmailMainUse });
  y = kvRow(doc, y,
    { label: 'Responsable (si es compartida)', value: request.gmailSharedResponsible });
  y += 5;
  return y;
}

function drawPlatformSection(doc, y, ACCENT, request) {
  y = lightHeading(doc, y, '2. Accesos a plataformas de venta', ACCENT);
  const rows = request.platforms && request.platforms.length ? request.platforms : [{}];
  rows.forEach((row) => {
    y = guard(doc, y, 26);
    y = kvRow(doc, y,
      { label: 'Plataforma', value: row.platform },
      { label: 'Tienda / Cuenta / Seller', value: row.store });
    y = kvRow(doc, y, { label: 'Usuario / correo deseado', value: row.username });
    const isMercadoLibre = row.platform === MERCADO_LIBRE;
    const labels = isMercadoLibre ? ML_ROLE_LABELS : PERMISSION_LABELS;
    const selected = isMercadoLibre ? (row.roles || []) : null;
    const perms = Object.entries(labels)
      .map(([key, label]) => `${(isMercadoLibre ? selected.includes(key) : row.permissions?.[key]) ? '[X]' : '[ ]'} ${label}`)
      .join('   ');
    const permsW = CW - 82;
    doc.fillColor(GRAY_LT).font('Helvetica-Bold').fontSize(5.8)
       .text(isMercadoLibre ? 'ROLES' : 'PERMISOS', MARGIN + 3, y + 3, { width: 72, lineBreak: false });
    doc.fillColor(DARK).font('Helvetica').fontSize(6.8)
       .text(perms, MARGIN + 78, y + 2, { width: permsW });
    y += Math.max(15, doc.heightOfString(perms, { width: permsW, fontSize: 6.8 }) + 6);
    hline(doc, y, '#f0f0f0', 0.3);
    y += 4;
  });
  return y;
}

function drawErpSection(doc, y, ACCENT, request) {
  y = lightHeading(doc, y, '2. Acceso al ERP', ACCENT);
  y = kvRow(doc, y,
    { label: 'Sistema / ERP', value: request.platform },
    { label: 'Empresa(s) del grupo con acceso', value: request.erpGroupCompanies });

  y = guard(doc, y, 24);
  const modules = [...(request.erpModules || [])];
  if (request.erpModuleOther) modules.push(`Otro: ${request.erpModuleOther}`);
  const modulesLine = modules.length ? modules.join('   ·   ') : '—';
  doc.fillColor(GRAY_LT).font('Helvetica-Bold').fontSize(5.8)
     .text('MÓDULOS', MARGIN + 3, y + 3, { width: 72, lineBreak: false });
  const modulesW = CW - 82;
  doc.fillColor(DARK).font('Helvetica').fontSize(7)
     .text(modulesLine, MARGIN + 78, y + 2, { width: modulesW });
  y += Math.max(15, doc.heightOfString(modulesLine, { width: modulesW, fontSize: 7 }) + 6);
  hline(doc, y, '#f0f0f0', 0.3);

  y = kvRow(doc, y,
    { label: 'Usuario / correo deseado', value: request.username },
    { label: 'Nivel de acceso', value: request.erpAccessLevel });
  y += 5;
  return y;
}

function drawJustificationSection(doc, y, ACCENT, request) {
  y = lightHeading(doc, y, '3. Justificación y vigencia', ACCENT);
  y = kvRow(doc, y, { label: 'Justificación / Funciones', value: request.reason });
  y = kvRow(doc, y,
    { label: 'Vigencia', value: request.validity },
    { label: 'Uso en plataformas', value: request.referenceProfile });
  y += 5;
  return y;
}

// A diferencia de la Responsiva (que detalla cada obligación como cláusula
// numerada, con su propio fundamento legal artículo por artículo), aquí solo
// se resume sin ese énfasis — el usuario pidió que la Solicitud mencione las
// mismas obligaciones y el mismo fundamento legal, pero sin la formalidad
// que sí debe tener la Responsiva que se firma al aprobar la cuenta.
function drawObligationsSection(doc, y, ACCENT) {
  y = lightHeading(doc, y, '4. Obligaciones y responsabilidades (resumen)', ACCENT);
  const summary = 'Al enviar esta solicitud, el usuario reconoce que las cuentas y accesos que pide son propiedad de la empresa, de uso estrictamente laboral, con credenciales personales e intransferibles, y sujetas a confidencialidad sobre la información a la que tenga acceso. El detalle completo de estas obligaciones, así como el fundamento legal aplicable (Ley Federal del Trabajo Arts. 134, 135 y 47; Ley Federal de Protección de Datos Personales en Posesión de los Particulares; Código Penal Federal Art. 211 Bis 1), se establece formalmente en la Responsiva que se genera y firma al aprobarse esta solicitud y crearse la cuenta.';
  const w = CW;
  doc.fillColor(GRAY).font('Helvetica').fontSize(7)
     .text(summary, MARGIN, y, { width: w });
  y += doc.heightOfString(summary, { width: w, fontSize: 7 }) + 8;
  return y;
}

function drawSignatureSection(doc, y, ACCENT, request) {
  y = guard(doc, y, 50);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7.5)
     .text('5. Aceptación electrónica', MARGIN, y, { width: CW, lineBreak: false });
  y += 12;

  const acceptedDate = request.acceptedAt
    ? new Date(request.acceptedAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })
    : '—';
  doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
     .text(`Aceptado por: ${request.employeeName}  ·  ${acceptedDate}`, MARGIN, y, { width: CW, lineBreak: false });
  y += 12;
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
     .text('Mensaje de datos con validez conforme a los Arts. 89 y 97 del Código de Comercio (equivalente a firma autógrafa). Sujeto a revisión y aprobación manual del área de Sistemas antes de crear la cuenta.',
       MARGIN, y, { width: CW });
  y += doc.heightOfString('x', { fontSize: 6 }) + 18;

  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
     .text('Uso interno — Sistemas · Select Shop MB. Solicitud recibida por el formulario en línea de altas de cuentas y accesos.',
       MARGIN, y, { width: CW, lineBreak: false });
  return y;
}

const SECTION_DRAWERS = {
  gmail: drawGmailSection,
  platform: drawPlatformSection,
  platform_erp: drawErpSection,
};

// Genera el PDF de una solicitud YA AISLADA por tipo (un AccountRequest =
// un tipo de cuenta) — nunca mezcla datos de otros tipos de la misma
// solicitud unificada, aunque hayan venido del mismo llenado del formulario.
function buildAccountRequestPdf(request) {
  return new Promise((resolve, reject) => {
    const folio = `${TYPE_PREFIX[request.requestType]}-${String(request._id).slice(-6).toUpperCase()}`;
    const dateStr = new Date(request.createdAt || Date.now())
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

    const { y: y0, ACCENT } = drawHeader(doc, { request, folio, dateStr });
    let y = drawApplicantSection(doc, y0, ACCENT, request);
    y = SECTION_DRAWERS[request.requestType](doc, y, ACCENT, request);
    y = drawJustificationSection(doc, y, ACCENT, request);
    y = drawObligationsSection(doc, y, ACCENT);
    drawSignatureSection(doc, y, ACCENT, request);

    doc.end();
  });
}

module.exports = { buildAccountRequestPdf };
