const PDFDocument = require('pdfkit');
const path = require('path');
const fs = require('fs');
const { MARGIN, PAGE_W, CW, getEmpresaConfig, LOGOS_DIR } = require('./pdfBranding');

// Réplica de los 3 formatos Excel que Sistemas sigue usando hoy por temas de
// RH/políticas (compartidos por el usuario: "FORMATOS - SISTEMAS DE
// COMPUTO..." y "FORMATOS - EQUIPOS DE TELEFONÍA CELULAR V2.xlsx"). Se
// replica la estructura REAL de celdas del Excel (revisado celda por celda:
// bordes, combinaciones, qué lleva caja y qué lleva solo una línea de
// subrayado) — no una interpretación libre. A propósito NO comparte código
// con la Responsiva nueva (responsiva.js) para no arriesgar romper ninguna
// de las dos al tocar la otra, y NO usa el branding de color de la app (el
// documento original es blanco y negro con líneas de cuadrícula).

const BLACK = '#000000';
const DOC_CODES = {
  equipos: 'SS-IT-P-01-F01',
  accesorios: 'SS-IT-P-01-F02',
  celular: 'SS-IT-P-02-F01',
};
const REVISION = '2';

function newDoc() {
  return new PDFDocument({
    size: 'LETTER',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    bufferPages: true,
  });
}

function box(doc, x, y, w, h) {
  doc.save().lineWidth(0.75).strokeColor(BLACK).rect(x, y, w, h).stroke().restore();
}

function centeredText(doc, text, x, y, w, h, opts = {}) {
  const fontSize = opts.fontSize || 9;
  doc.font(opts.bold ? 'Helvetica-Bold' : 'Helvetica').fontSize(fontSize).fillColor(BLACK);
  const th = doc.heightOfString(text || '', { width: w - 4, align: 'center' });
  doc.text(text || '', x + 2, y + Math.max(2, (h - th) / 2), { width: w - 4, align: 'center' });
}

// ── ENCABEZADO: 3 cajas lado a lado (logo | título | clave+revisión), con la
// razón social y la revisión en sendas cajas más chicas debajo de logo/clave
// (igual estructura de celdas que el Excel: A1:C3 + A4:C4, D1:G4, H1:J3 + H4:J4). ──
function header(doc, { title, docCode, company, dateStr }) {
  const y0 = MARGIN;
  const hTop = 30;   // A1:C3 / D1:G4(parcial) / H1:J3
  const hBottom = 12; // A4:C4 / H4:J4
  const wLogo = CW * 0.20;
  const wTitle = CW * 0.50;
  const wClave = CW - wLogo - wTitle;

  const xLogo = MARGIN;
  const xTitle = xLogo + wLogo;
  const xClave = xTitle + wTitle;

  // Caja de logo (arriba) + razón social (abajo)
  box(doc, xLogo, y0, wLogo, hTop);
  const { logo: logoFile } = getEmpresaConfig(company);
  const logoPath = path.join(LOGOS_DIR, logoFile);
  if (fs.existsSync(logoPath)) {
    try {
      doc.image(logoPath, xLogo + 3, y0 + 3, { fit: [wLogo - 6, hTop - 6], align: 'center', valign: 'center' });
    } catch (_) { /* sin logo, caja queda en blanco */ }
  }
  box(doc, xLogo, y0 + hTop, wLogo, hBottom);
  centeredText(doc, company, xLogo, y0 + hTop, wLogo, hBottom, { fontSize: 6.5, bold: true });

  // Caja de título (una sola, altura completa)
  box(doc, xTitle, y0, wTitle, hTop + hBottom);
  centeredText(doc, title, xTitle, y0, wTitle, hTop + hBottom, { fontSize: 11, bold: true });

  // Caja de clave (arriba) + no. de revisión (abajo)
  box(doc, xClave, y0, wClave, hTop);
  centeredText(doc, `CLAVE:\n${docCode}`, xClave, y0, wClave, hTop, { fontSize: 8, bold: true });
  box(doc, xClave, y0 + hTop, wClave, hBottom);
  centeredText(doc, `No. de Revisión: ${REVISION}`, xClave, y0 + hTop, wClave, hBottom, { fontSize: 7 });

  let y = y0 + hTop + hBottom + 10;
  doc.font('Helvetica').fontSize(8).fillColor(BLACK)
     .text(`Ciudad de México a, ${dateStr}`, MARGIN, y, { width: CW, align: 'right' });
  y += 16;
  return y;
}

function titleLine(doc, y, left, right) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
     .text(`${left}     ${right}`, MARGIN, y, { width: CW });
  return y + 16;
}

function companyLine(doc, y, company) {
  doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK).text(company, MARGIN, y, { width: CW });
  return y + 16;
}

function introParagraph(doc, y, text) {
  const h = doc.heightOfString(text, { width: CW, fontSize: 8.5 });
  doc.font('Helvetica').fontSize(8.5).fillColor(BLACK).text(text, MARGIN, y, { width: CW });
  return y + h + 10;
}

// Datos del empleado: SIN caja — cada renglón es "Etiqueta" (der.) + una
// línea (subrayado) bajo el valor, igual que el Excel (A12:C12 sin borde,
// E12:G12 con borde solo abajo).
function employeeInfoUnderlined(doc, y, employee) {
  const labelW = 130;
  const rows = [
    ['No. Empleado', employee.employeeId],
    ['Nombre del Empleado', employee.name],
    ['Ubicación', employee.office],
    ['Departamento', employee.department],
    ['Puesto', employee.position],
  ];
  rows.forEach(([label, rawValue]) => {
    const value = (rawValue === undefined || rawValue === null || rawValue === '') ? '' : String(rawValue);
    doc.font('Helvetica').fontSize(8.5).fillColor(BLACK)
       .text(label, MARGIN, y, { width: labelW, align: 'right' });
    doc.font('Helvetica-Bold').fontSize(8.5).fillColor(BLACK)
       .text(value, MARGIN + labelW + 8, y - 1, { width: CW - labelW - 8 });
    doc.save().moveTo(MARGIN + labelW + 8, y + 11).lineTo(PAGE_W - MARGIN, y + 11)
       .lineWidth(0.75).strokeColor(BLACK).stroke().restore();
    y += 16;
  });
  return y + 8;
}

// Tabla con cuadrícula real (bordes en todas las celdas), 4 columnas:
// CARACTERÍSTICA | DESCRIPCIÓN | SÍ | NO — igual que RESPONSIVA EQUIPOS/CELULAR.
function featuresTable(doc, y, rows) {
  const wChar = CW * 0.26;
  const wDesc = CW * 0.52;
  const wSi = CW * 0.11;
  const wNo = CW - wChar - wDesc - wSi;
  const xChar = MARGIN, xDesc = xChar + wChar, xSi = xDesc + wDesc, xNo = xSi + wSi;

  const headH = 16;
  box(doc, xChar, y, wChar, headH);
  box(doc, xDesc, y, wDesc, headH);
  box(doc, xSi, y, wSi, headH);
  box(doc, xNo, y, wNo, headH);
  centeredText(doc, 'CARACTERÍSTICAS', xChar, y, wChar, headH, { fontSize: 7.5, bold: true });
  centeredText(doc, 'DESCRIPCIÓN', xDesc, y, wDesc, headH, { fontSize: 7.5, bold: true });
  centeredText(doc, 'SÍ', xSi, y, wSi, headH, { fontSize: 7.5, bold: true });
  centeredText(doc, 'NO', xNo, y, wNo, headH, { fontSize: 7.5, bold: true });
  y += headH;

  rows.forEach(([label, value]) => {
    const val = (value === undefined || value === null || value === '') ? '—' : String(value);
    const rowH = Math.max(15, doc.heightOfString(val, { width: wDesc - 6, fontSize: 8 }) + 6);
    box(doc, xChar, y, wChar, rowH);
    box(doc, xDesc, y, wDesc, rowH);
    box(doc, xSi, y, wSi, rowH);
    box(doc, xNo, y, wNo, rowH);
    doc.font('Helvetica').fontSize(7.8).fillColor(BLACK).text(label, xChar + 4, y + 4, { width: wChar - 8, align: 'right' });
    doc.font('Helvetica').fontSize(8).fillColor(BLACK).text(val, xDesc + 3, y + 4, { width: wDesc - 6 });
    y += rowH;
  });
  return y + 8;
}

// Tabla de 2 columnas (Cantidad de Accesorios | Descripción) — RESPONSIVA ACCESORIOS.
function accessoryTable(doc, y, cantidad, descripcion) {
  const wCant = CW * 0.28;
  const wDesc = CW - wCant;
  const xCant = MARGIN, xDesc = xCant + wCant;
  const headH = 16;
  box(doc, xCant, y, wCant, headH);
  box(doc, xDesc, y, wDesc, headH);
  centeredText(doc, 'CANTIDAD DE ACCESORIOS', xCant, y, wCant, headH, { fontSize: 7, bold: true });
  centeredText(doc, 'DESCRIPCIÓN', xDesc, y, wDesc, headH, { fontSize: 7, bold: true });
  y += headH;

  const rowH = Math.max(16, doc.heightOfString(descripcion || '—', { width: wDesc - 6, fontSize: 8 }) + 6);
  box(doc, xCant, y, wCant, rowH);
  box(doc, xDesc, y, wDesc, rowH);
  centeredText(doc, String(cantidad), xCant, y, wCant, rowH, { fontSize: 8 });
  doc.font('Helvetica').fontSize(8).fillColor(BLACK).text(descripcion || '—', xDesc + 3, y + 4, { width: wDesc - 6 });
  return y + rowH + 8;
}

function legalParagraphs(doc, y, texts) {
  texts.forEach((text) => {
    const h = doc.heightOfString(text, { width: CW, fontSize: 7.8 });
    doc.font('Helvetica').fontSize(7.8).fillColor(BLACK).text(text, MARGIN, y, { width: CW });
    y += h + 8;
  });
  return y;
}

// Firmas: caja en blanco para firmar (igual que el Excel, con borde), la
// etiqueta arriba y "Nombre, fecha y firma" + rol debajo, ambos sin borde.
function signatureBoxes(doc, y, roles) {
  const colW = (CW - 20) / 3;
  const boxH = 40;
  ['Entrega', 'Recibe', 'Autoriza'].forEach((lbl, i) => {
    const x = MARGIN + i * (colW + 10);
    doc.font('Helvetica').fontSize(9).fillColor(BLACK).text(lbl, x, y, { width: colW, align: 'center' });
    box(doc, x, y + 14, colW, boxH);
    doc.font('Helvetica').fontSize(6.5).fillColor(BLACK)
       .text('Nombre, fecha y firma', x, y + 14 + boxH + 3, { width: colW, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(7).fillColor(BLACK)
       .text(roles[i], x, y + 14 + boxH + 13, { width: colW, align: 'center' });
  });
  return y + 14 + boxH + 26;
}

// ── RESPONSIVA EQUIPOS (SS-IT-P-01-F01) ─────────────────────────────────────
function buildEquiposLegacyPdf({ employee, asset, dateStr, articulo }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const company = employee.businessName || 'SELECT SHOP MB';
    let y = header(doc, { title: 'EQUIPO DE COMPUTO', docCode: DOC_CODES.equipos, company, dateStr });
    y = titleLine(doc, y, 'RESPONSIVA', articulo);
    y = companyLine(doc, y, company);
    y = introParagraph(doc, y,
      `Por medio de la presente, hago constar que recibí el equipo propiedad de la empresa ${company}, con las características que a continuación se describe, con el único fin y uso para el buen desempeño de mis funciones y actividades.`);
    y = employeeInfoUnderlined(doc, y, employee);

    const accs = [];
    if (asset.specs?.hasMonitor) accs.push('Monitor');
    if (asset.specs?.hasMouse) accs.push('Mouse');
    if (asset.specs?.hasKeyboard) accs.push('Teclado');

    y = featuresTable(doc, y, [
      ['Tipo:', articulo],
      ['Marca:', asset.brand],
      ['Modelo:', asset.model],
      ['Procesador:', asset.specs?.processor],
      ['Serie:', asset.serialNumber],
      ['Cargador (CT):', asset.specs?.hasCharger ? (asset.specs?.chargerSerial || 'SI') : 'NO'],
      ['Accesorios (Otros):', accs.length ? accs.join(', ') : 'N/A'],
    ]);

    y = legalParagraphs(doc, y, [
      'A partir de la presente fecha me hago responsable del equipo y accesorios incluidos, así como a su devolución con las condiciones normales de uso en el momento que me sea requerido por parte de la empresa y/o mi jefe inmediato.',
      'Me comprometo a cumplir con todas y cada una de las políticas establecidas, y los daños causados por mal manejo o mi imprudencia será mi responsabilidad y asumo las consecuencias de los costos que de esto se derive.',
      'Así mismo, es de mi conocimiento que no puedo instalar software adicional ni modificar la configuración del equipo que me fue otorgado por el departamento de Sistemas, en caso de hacerlo, será causa de una sanción y/o Acta Administrativa.',
    ]);
    y += 10;

    signatureBoxes(doc, y, ['IT', 'EMPLEADO', 'JEFE INMEDIATO']);
    doc.end();
  });
}

// ── RESPONSIVA ACCESORIOS (SS-IT-P-01-F02) ──────────────────────────────────
function buildAccesoriosLegacyPdf({ employee, asset, dateStr, tipoAccesorio, cantidad, descripcion }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const company = employee.businessName || 'SELECT SHOP MB';
    let y = header(doc, { title: 'ACCESORIOS DE EQUIPO', docCode: DOC_CODES.accesorios, company, dateStr });
    y = titleLine(doc, y, 'RESPONSIVA', tipoAccesorio);
    y = companyLine(doc, y, company);
    y = introParagraph(doc, y,
      `Por medio de la presente, hago constar que recibí accesorio(s) propiedad de la empresa ${company}, con las características que a continuación se describe, con el único fin y uso para el buen desempeño de mis funciones y actividades.`);
    y = employeeInfoUnderlined(doc, y, employee);
    y = accessoryTable(doc, y, cantidad, descripcion);

    y = legalParagraphs(doc, y, [
      `A partir de la presente fecha me hago responsable de ${tipoAccesorio}, así como a su devolución con las condiciones normales de uso en el momento que me sea requerido por parte de la empresa y/o mi jefe inmediato.`,
      'Me comprometo a cumplir con todas y cada una de las políticas establecidas, y los daños causados por mal manejo o mi imprudencia será mi responsabilidad y asumo las consecuencias de los costos que de esto se derive.',
    ]);
    y += 10;

    signatureBoxes(doc, y, ['IT', employee.name, 'JEFE INMEDIATO']);
    doc.end();
  });
}

// ── RESPONSIVA CELULAR (SS-IT-P-02-F01) ─────────────────────────────────────
function buildCelularLegacyPdf({ employee, asset, dateStr }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const company = employee.businessName || 'SELECT SHOP MB';
    let y = header(doc, { title: 'EQUIPO DE TELEFONÍA CELULAR', docCode: DOC_CODES.celular, company, dateStr });
    doc.font('Helvetica-Bold').fontSize(11).fillColor(BLACK)
       .text('RESPONSIVA DE DISPOSITIVO CELULAR', MARGIN, y, { width: CW });
    y += 16;
    y = companyLine(doc, y, company);
    y = introParagraph(doc, y,
      `Por medio de la presente, hago constar que recibí el equipo propiedad de la empresa ${company}, que a continuación se describe, con el único fin y uso para el buen desempeño de mis funciones y actividades.`);
    y = employeeInfoUnderlined(doc, y, employee);

    y = featuresTable(doc, y, [
      ['Marca:', asset.brand],
      ['Modelo:', asset.model],
      ['Cargador:', asset.specs?.hasCharger ? 'SI' : 'NO'],
      ['Audífonos:', '—'],
      ['Otros:', asset.notes || 'N/A'],
      ['IMEI:', asset.specs?.imei],
      ['Número De Marcación Completo:', asset.specs?.lineNumber],
      ['Numero De Marcación Corto:', '—'],
      ['Costo Del Equipo Celular:', '—'],
      ['Correo De Cuenta Gmail:', asset.specs?.gmailAccount],
    ]);

    y = legalParagraphs(doc, y, [
      'A partir de la presente fecha me hago responsable del equipo y accesorios incluidos, así como a su devolución con las condiciones normales de uso en el momento que me sea requerido por parte de la empresa y/o mi jefe inmediato.',
      'Me comprometo a cumplir con todas y cada una de las políticas establecidas.\nLos daños causados por mal manejo o mi imprudencia será mi responsabilidad y asumo las consecuencias de los costos que de esto se derive.',
    ]);
    y += 10;

    signatureBoxes(doc, y, ['IT', 'EMPLEADO', 'JEFE DIRECTO']);
    doc.end();
  });
}

module.exports = {
  DOC_CODES,
  buildEquiposLegacyPdf,
  buildAccesoriosLegacyPdf,
  buildCelularLegacyPdf,
};
