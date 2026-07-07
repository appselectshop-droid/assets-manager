const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const {
  getEmpresaConfig, LOGOS_DIR,
  MARGIN, PAGE_W, CW, DARK, GRAY_LT, BORDER,
  guard, hline, sectionBand, blendWithWhite, kvRow, clauseBlock,
} = require('./pdfBranding');

const TYPE_TITLES = {
  gmail:        'SOLICITUD Y CARTA RESPONSIVA — CUENTA DE CORREO (GMAIL)',
  platform:     'SOLICITUD Y CARTA RESPONSIVA — ACCESO A PLATAFORMAS DE VENTA',
  platform_erp: 'SOLICITUD Y CARTA RESPONSIVA — ACCESO AL ERP',
};
const TYPE_PREFIX = { gmail: 'GMAIL', platform: 'PLAT', platform_erp: 'ERP' };
const ACTION_LABELS = { alta: 'Alta', modificacion: 'Modificación', baja: 'Baja' };

const PERMISSION_LABELS = {
  ventas: 'Ventas al detalle', publicaciones: 'Publicaciones', inventarios: 'Inventarios',
  envio: 'Gestión de envío (Full)', pagos: 'Pagos', facturas: 'Facturas', admin: 'Admin (total)',
};

// Fundamento legal — mismo criterio ya usado en la Responsiva de equipo físico
// (LFT arts. 110/132/134/135), adaptado a cuentas/accesos digitales: la
// obligación de confidencialidad y las causales de rescisión sin
// responsabilidad para el patrón por revelar información reservada, más
// protección de datos personales y el delito de acceso ilícito a sistemas.
const LEGAL_GROUNDS =
  'Fundamento legal: Ley Federal del Trabajo — Art. 134, Fracc. I (cumplir las disposiciones de las normas de trabajo aplicables), Fracc. IV (ejecutar el trabajo con la intensidad, cuidado y esmero apropiados) y Fracc. XIII (guardar escrupulosamente los secretos técnicos, comerciales y administrativos de la empresa cuya divulgación pueda causarle perjuicio); Art. 135, Fracc. IX (prohibición de usar los útiles, herramientas y, por extensión, las cuentas y accesos digitales suministrados por el patrón, para objeto distinto de aquél a que están destinados); Art. 47, Fracc. II y IX (son causas de rescisión de la relación de trabajo sin responsabilidad para el patrón los actos de falta de probidad u honradez y la revelación de los secretos a que se refiere el Art. 134 Fracc. XIII). Ley Federal de Protección de Datos Personales en Posesión de los Particulares y su Reglamento, respecto de los datos de clientes y colaboradores a los que se tenga acceso. Código Penal Federal, Art. 211 Bis 1 (acceso, uso, copia o modificación no autorizados de información contenida en sistemas o equipos de informática protegidos por un mecanismo de seguridad). Todo lo anterior sin perjuicio del Reglamento Interior de Trabajo vigente en la empresa.';

function drawHeader(doc, { request, folio, dateStr }) {
  const company = request.businessName || 'SELECT SHOP MB, S.A DE C.V.';
  const { color: ACCENT, logo: logoFile } = getEmpresaConfig(company);
  const logoPath = path.join(LOGOS_DIR, logoFile);
  const hasLogo = fs.existsSync(logoPath);

  let y = MARGIN;
  if (hasLogo) {
    try { doc.image(logoPath, MARGIN, y, { fit: [100, 40] }); } catch (_) {}
  }

  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(10.5)
     .text(TYPE_TITLES[request.requestType], MARGIN + (hasLogo ? 110 : 0), y + 2,
       { width: CW - (hasLogo ? 230 : 130), align: 'center' });

  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
     .text(`Folio: ${folio}`, PAGE_W - MARGIN - 130, y, { width: 130, align: 'right', lineBreak: false });
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
     .text(`Fecha de solicitud: ${dateStr}`, PAGE_W - MARGIN - 130, y + 10, { width: 130, align: 'right', lineBreak: false });
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
     .text(`Tipo: ${ACTION_LABELS[request.actionType] || 'Alta'}`, PAGE_W - MARGIN - 130, y + 20, { width: 130, align: 'right', lineBreak: false });

  y += 56;
  doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
     .text('Área de Sistemas IT & Business Intelligence', MARGIN, y, { width: CW, align: 'center', lineBreak: false });
  y += 11;
  doc.fillColor(DARK).font('Helvetica').fontSize(8.5)
     .text(company, MARGIN, y, { width: CW, align: 'center', lineBreak: false });

  y += 13;
  doc.save().rect(MARGIN, y, CW, 2.5).fill(ACCENT).restore();
  y += 8;
  return { y, ACCENT };
}

function drawApplicantSection(doc, y, ACCENT, request) {
  y = sectionBand(doc, y, '  1. DATOS DEL USUARIO SOLICITANTE', ACCENT);
  y = kvRow(doc, y,
    { label: 'Nombre completo', value: request.employeeName },
    { label: 'No. de empleado', value: request.employeeIdNum });
  y = kvRow(doc, y,
    { label: 'Puesto', value: request.position },
    { label: 'Área / Departamento', value: request.department });
  y = kvRow(doc, y,
    { label: 'Jefe directo', value: request.directManager },
    { label: 'Teléfono / Ext.', value: request.phone });
  y = kvRow(doc, y,
    { label: 'Correo actual', value: request.currentEmail },
    { label: 'Empresa / Razón social', value: request.businessName });
  y += 5;
  return y;
}

function drawGmailSection(doc, y, ACCENT, request) {
  y = sectionBand(doc, y, '  2. CUENTA DE CORREO (GMAIL)', ACCENT);
  y = kvRow(doc, y,
    { label: 'Correo solicitado', value: request.username },
    { label: 'Nombre para mostrar', value: request.gmailDisplayName });
  y = kvRow(doc, y,
    { label: 'Tipo de cuenta', value: request.gmailAccountKind },
    { label: 'Uso principal', value: request.gmailMainUse });
  y = kvRow(doc, y,
    { label: 'Teléfono de recuperación', value: request.gmailRecoveryPhone },
    { label: 'Responsable (si es compartida)', value: request.gmailSharedResponsible });
  y += 5;
  return y;
}

function drawPlatformSection(doc, y, ACCENT, request) {
  y = sectionBand(doc, y, '  2. ACCESOS A PLATAFORMAS DE VENTA', ACCENT);
  const rows = request.platforms && request.platforms.length ? request.platforms : [{}];
  rows.forEach((row) => {
    y = guard(doc, y, 26);
    y = kvRow(doc, y,
      { label: 'Plataforma', value: row.platform },
      { label: 'Tienda / Cuenta / Seller', value: row.store });
    const perms = Object.entries(PERMISSION_LABELS)
      .map(([key, label]) => `${row.permissions?.[key] ? '[X]' : '[ ]'} ${label}`)
      .join('   ');
    const permsW = CW - 82;
    doc.fillColor(GRAY_LT).font('Helvetica-Bold').fontSize(5.8)
       .text('PERMISOS', MARGIN + 3, y + 3, { width: 72, lineBreak: false });
    doc.fillColor(DARK).font('Helvetica').fontSize(6.8)
       .text(perms, MARGIN + 78, y + 2, { width: permsW });
    y += Math.max(15, doc.heightOfString(perms, { width: permsW, fontSize: 6.8 }) + 6);
    hline(doc, y, '#f0f0f0', 0.3);
    y += 4;
  });
  return y;
}

function drawErpSection(doc, y, ACCENT, request) {
  y = sectionBand(doc, y, '  2. ACCESO AL ERP', ACCENT);
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

  y = kvRow(doc, y, { label: 'Nivel de acceso', value: request.erpAccessLevel });
  y += 5;
  return y;
}

function drawJustificationSection(doc, y, ACCENT, request) {
  y = sectionBand(doc, y, '  3. JUSTIFICACIÓN Y VIGENCIA', ACCENT);
  y = kvRow(doc, y, { label: 'Justificación / Funciones', value: request.reason });
  y = kvRow(doc, y,
    { label: 'Vigencia', value: request.validity },
    { label: 'Uso en plataformas', value: request.referenceProfile });
  y += 5;
  return y;
}

const OBLIGATIONS = [
  'Las cuentas de correo, usuarios y accesos otorgados son propiedad de la empresa y se conceden únicamente para el desempeño de las funciones laborales del usuario. Queda prohibido su uso para fines personales o ajenos a la operación.',
  'Las credenciales (contraseñas, códigos de verificación, correos y teléfonos de recuperación) son personales e intransferibles y, en el caso del correo, son administradas por el área de Sistemas. El usuario se compromete a no compartirlas, prestarlas, divulgarlas ni modificarlas sin autorización expresa y por escrito del área de Sistemas.',
  'El usuario deberá limitarse a las plataformas, tiendas, módulos y permisos expresamente autorizados en el presente documento, absteniéndose de intentar acceder a funciones, cuentas o información no autorizadas. Todo cambio de permisos requiere un nuevo formato autorizado por el jefe directo.',
  'El usuario es responsable de todas las acciones realizadas con sus cuentas y accesos. Deberá cerrar sesión al terminar y no dejar equipos desatendidos con sesiones abiertas.',
  'La información a la que tenga acceso (datos de clientes, ventas, precios, costos, inventarios, información financiera, contable y fiscal) es estrictamente confidencial. El usuario se abstendrá de extraerla, copiarla, exportarla o difundirla fuera de los canales autorizados.',
  'Queda prohibido alterar, eliminar o cancelar registros, publicaciones o documentos con el propósito de ocultar información, distorsionar resultados o eludir controles internos, así como registrar operaciones inexistentes o con datos falsos.',
  'Cualquier incidente de seguridad (acceso no autorizado, pérdida de credenciales, correos de phishing, actividad sospechosa, bloqueo de cuentas) deberá reportarse de inmediato al área de Sistemas y al jefe directo.',
  'Queda prohibido modificar la configuración de las cuentas (correos y teléfonos de recuperación, métodos de pago, permisos de otros colaboradores) sin autorización del área de Sistemas, única facultada para crear cuentas, configurar perfiles y otorgar o revocar accesos.',
  'En caso de baja, cambio de puesto o término de la necesidad operativa, los accesos serán revocados y las cuentas recuperadas por el área de Sistemas.',
];

function drawObligationsSection(doc, y, ACCENT) {
  y = sectionBand(doc, y, '  4. OBLIGACIONES Y RESPONSABILIDADES DEL USUARIO', ACCENT);
  let i = 0;
  y = clauseBlock(doc, y, i++,
    'El usuario que firma electrónicamente la presente declara haber leído y aceptado las siguientes condiciones de uso de las cuentas, correos, credenciales y accesos que le sean asignados:');
  OBLIGATIONS.forEach((text) => { y = clauseBlock(doc, y, i++, `•  ${text}`); });
  y = clauseBlock(doc, y, i++,
    'El incumplimiento de las presentes obligaciones podrá derivar en la revocación inmediata de los accesos y en las medidas disciplinarias, administrativas o legales que correspondan conforme al Reglamento Interior de Trabajo, la Ley Federal del Trabajo y demás disposiciones aplicables.');
  y = clauseBlock(doc, y, i++, LEGAL_GROUNDS);
  y += 6;
  return y;
}

function drawSignatureSection(doc, y, ACCENT, request) {
  y = guard(doc, y, 70);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
     .text('5. ACEPTACIÓN ELECTRÓNICA', MARGIN, y, { width: CW, align: 'center', lineBreak: false });
  y += 14;

  const boxH = 56;
  doc.save().rect(MARGIN, y, CW, boxH).stroke(BORDER).restore();
  doc.save().rect(MARGIN, y, CW, 16).fill(blendWithWhite(ACCENT, 0.1)).restore();
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(6.5)
     .text('USUARIO RESPONSABLE — FIRMA ELECTRÓNICA', MARGIN + 6, y + 4, { width: CW - 12, lineBreak: false });

  const acceptedDate = request.acceptedAt
    ? new Date(request.acceptedAt).toLocaleString('es-MX', { dateStyle: 'long', timeStyle: 'short' })
    : '—';
  doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
     .text(`Aceptado por: ${request.employeeName}`, MARGIN + 6, y + 22, { width: CW - 12, lineBreak: false });
  doc.fillColor(DARK).font('Helvetica').fontSize(7.5)
     .text(`Fecha y hora de aceptación: ${acceptedDate}`, MARGIN + 6, y + 33, { width: CW - 12, lineBreak: false });
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
     .text('De conformidad con los Arts. 89 y 97 del Código de Comercio, este documento constituye un mensaje de datos con la misma validez que una firma autógrafa. El jefe directo autoriza la solicitud al validar que los accesos son necesarios para las funciones del puesto; el área de Sistemas crea y configura las cuentas conforme a lo aquí descrito, previa revisión y aprobación manual de esta solicitud.',
       MARGIN + 6, y + 44, { width: CW - 12 });

  y += boxH + 8;
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
     .text('Uso interno — Sistemas IT & Business Intelligence · Select Shop MB. Solicitud recibida por el formulario en línea de altas de cuentas y accesos.',
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
      size: 'A4',
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
