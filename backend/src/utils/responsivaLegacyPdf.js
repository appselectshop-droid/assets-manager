const PDFDocument = require('pdfkit');
const { MARGIN, PAGE_W, CW } = require('./pdfBranding');

// Réplica fiel de los 3 formatos Excel que Sistemas sigue usando hoy por
// temas de RH/políticas (compartidos por el usuario: "FORMATOS - SISTEMAS DE
// COMPUTO..." y "FORMATOS - EQUIPOS DE TELEFONÍA CELULAR V2.xlsx") — mismo
// texto legal, mismos campos, mismo orden y mismas claves de documento que
// el Excel original. A propósito NO usa el branding de color de la app (la
// idea es reproducir el documento oficial tal cual, no restilizarlo) y NO
// comparte código con la Responsiva nueva (responsiva.js) para no arriesgar
// romper ninguna de las dos al tocar la otra.

const BLACK = '#000000';
const GRAY = '#444444';
const DOC_CODES = {
  equipos: 'SS-IT-P-01-F01',
  accesorios: 'SS-IT-P-01-F02',
  celular: 'SS-IT-P-02-F01',
};
const REVISION = '2';

function newDoc() {
  return new PDFDocument({
    size: 'A4',
    margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: true,
    bufferPages: true,
  });
}

function header(doc, { title, docCode, company, dateStr }) {
  let y = MARGIN;
  doc.fillColor(BLACK).font('Helvetica-Bold').fontSize(12)
     .text(title, MARGIN, y, { width: CW - 150 });
  doc.font('Helvetica').fontSize(7.5)
     .text(`CLAVE: ${docCode}`, PAGE_W - MARGIN - 150, y, { width: 150, align: 'right' });
  doc.text(`No. de Revisión: ${REVISION}`, PAGE_W - MARGIN - 150, y + 11, { width: 150, align: 'right' });
  y += 30;
  doc.font('Helvetica-Bold').fontSize(9).text(company, MARGIN, y, { width: CW, align: 'center' });
  y += 15;
  doc.font('Helvetica').fontSize(8)
     .text(`Ciudad de México a, ${dateStr}`, MARGIN, y, { width: CW, align: 'right' });
  y += 14;
  doc.save().moveTo(MARGIN, y).lineTo(PAGE_W - MARGIN, y).lineWidth(1).strokeColor(BLACK).stroke().restore();
  y += 10;
  return y;
}

function fieldTable(doc, y, rows) {
  // rows: [[label, value], ...] — una etiqueta/valor por renglón, ancho completo,
  // con borde simple para imitar la tabla del Excel.
  const labelW = 150;
  rows.forEach(([label, rawValue]) => {
    const value = (rawValue === undefined || rawValue === null || rawValue === '') ? '—' : rawValue;
    const h = Math.max(16, doc.heightOfString(String(value), { width: CW - labelW - 8, fontSize: 8 }) + 6);
    doc.rect(MARGIN, y, labelW, h).stroke(BLACK);
    doc.rect(MARGIN + labelW, y, CW - labelW, h).stroke(BLACK);
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLACK).text(label, MARGIN + 4, y + 4, { width: labelW - 8 });
    doc.font('Helvetica').fontSize(8).fillColor(BLACK).text(value, MARGIN + labelW + 4, y + 4, { width: CW - labelW - 8 });
    y += h;
  });
  return y;
}

function employeeDataBlock(doc, y, employee) {
  return fieldTable(doc, y, [
    ['No. Empleado', employee.employeeId],
    ['Nombre del Empleado', employee.name],
    ['Ubicación', employee.office],
    ['Departamento', employee.department],
    ['Puesto', employee.position],
  ]) + 6;
}

function paragraph(doc, y, text, opts = {}) {
  const h = doc.heightOfString(text, { width: CW, fontSize: opts.fontSize || 8 });
  doc.font('Helvetica').fontSize(opts.fontSize || 8).fillColor(opts.color || GRAY)
     .text(text, MARGIN, y, { width: CW });
  return y + h + (opts.gap ?? 10);
}

function signatureBlock(doc, y, roles) {
  // roles: [{ label, role, name }] — 3 columnas: Entrega/Recibe/Autoriza.
  const colW = (CW - 20) / 3;
  const h = 60;
  ['Entrega', 'Recibe', 'Autoriza'].forEach((lbl, i) => {
    const x = MARGIN + i * (colW + 10);
    doc.font('Helvetica-Bold').fontSize(8).fillColor(BLACK)
       .text(lbl, x, y, { width: colW, align: 'center' });
    doc.save().moveTo(x + 6, y + h - 24).lineTo(x + colW - 6, y + h - 24).strokeColor(BLACK).lineWidth(0.7).stroke().restore();
    doc.font('Helvetica').fontSize(7).fillColor(GRAY)
       .text('Nombre, fecha y firma', x, y + h - 20, { width: colW, align: 'center' });
    doc.font('Helvetica-Bold').fontSize(7.5).fillColor(BLACK)
       .text(roles[i], x, y + h - 10, { width: colW, align: 'center' });
  });
  return y + h;
}

// ── RESPONSIVA EQUIPOS (SS-IT-P-01-F01) — laptop / escritorio / all_in_one / tablet ──
function buildEquiposLegacyPdf({ employee, asset, dateStr, articulo }) {
  return new Promise((resolve, reject) => {
    const doc = newDoc();
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const company = employee.businessName || 'SELECT SHOP MB';
    let y = header(doc, { title: 'EQUIPO DE COMPUTO', docCode: DOC_CODES.equipos, company, dateStr });

    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
       .text(`RESPONSIVA — ${articulo}`, MARGIN, y, { width: CW });
    y += 16;

    y = paragraph(doc, y,
      `Por medio de la presente, hago constar que recibí el equipo propiedad de la empresa ${company}, con las características que a continuación se describe, con el único fin y uso para el buen desempeño de mis funciones y actividades.`);

    y = employeeDataBlock(doc, y, employee);

    const accs = [];
    if (asset.specs?.hasMonitor) accs.push('Monitor');
    if (asset.specs?.hasMouse) accs.push('Mouse');
    if (asset.specs?.hasKeyboard) accs.push('Teclado');

    y = fieldTable(doc, y, [
      ['Tipo:', articulo],
      ['Marca:', asset.brand],
      ['Modelo:', asset.model],
      ['Procesador:', asset.specs?.processor],
      ['Serie:', asset.serialNumber],
      ['Cargador (CT):', asset.specs?.hasCharger ? (asset.specs?.chargerSerial || 'SI') : 'NO'],
      ['Accesorios (Otros):', accs.length ? accs.join(', ') : 'N/A'],
    ]);
    y += 6;

    y = paragraph(doc, y,
      'A partir de la presente fecha me hago responsable del equipo y accesorios incluidos, así como a su devolución con las condiciones normales de uso en el momento que me sea requerido por parte de la empresa y/o mi jefe inmediato.');
    y = paragraph(doc, y,
      'Me comprometo a cumplir con todas y cada una de las políticas establecidas, y los daños causados por mal manejo o mi imprudencia será mi responsabilidad y asumo las consecuencias de los costos que de esto se derive.');
    y = paragraph(doc, y,
      'Así mismo, es de mi conocimiento que no puedo instalar software adicional ni modificar la configuración del equipo que me fue otorgado por el departamento de Sistemas, en caso de hacerlo, será causa de una sanción y/o Acta Administrativa.', { gap: 20 });

    signatureBlock(doc, y, ['IT', 'EMPLEADO', 'JEFE INMEDIATO']);

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

    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
       .text(`RESPONSIVA — ${tipoAccesorio}`, MARGIN, y, { width: CW });
    y += 16;

    y = paragraph(doc, y,
      `Por medio de la presente, hago constar que recibí accesorio(s) propiedad de la empresa ${company}, con las características que a continuación se describe, con el único fin y uso para el buen desempeño de mis funciones y actividades.`);

    y = employeeDataBlock(doc, y, employee);

    y = fieldTable(doc, y, [
      ['Cantidad de Accesorios', String(cantidad)],
      ['Descripción', descripcion],
    ]);
    y += 6;

    y = paragraph(doc, y,
      `A partir de la presente fecha me hago responsable de ${tipoAccesorio}, así como a su devolución con las condiciones normales de uso en el momento que me sea requerido por parte de la empresa y/o mi jefe inmediato.`);
    y = paragraph(doc, y,
      'Me comprometo a cumplir con todas y cada una de las políticas establecidas, y los daños causados por mal manejo o mi imprudencia será mi responsabilidad y asumo las consecuencias de los costos que de esto se derive.', { gap: 20 });

    signatureBlock(doc, y, ['IT', employee.name, 'JEFE INMEDIATO']);

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

    doc.font('Helvetica-Bold').fontSize(9).fillColor(BLACK)
       .text('RESPONSIVA DE DISPOSITIVO CELULAR', MARGIN, y, { width: CW });
    y += 16;

    y = paragraph(doc, y,
      `Por medio de la presente, hago constar que recibí el equipo propiedad de la empresa ${company}, que a continuación se describe, con el único fin y uso para el buen desempeño de mis funciones y actividades.`);

    y = employeeDataBlock(doc, y, employee);

    y = fieldTable(doc, y, [
      ['Marca:', asset.brand],
      ['Modelo:', asset.model],
      ['Cargador:', asset.specs?.hasCharger ? 'SI' : 'NO'],
      ['Audífonos:', '—'], // no se captura en el sistema — Sistemas lo llena a mano si aplica
      ['Otros:', asset.notes || 'N/A'],
      ['IMEI:', asset.specs?.imei],
      ['Número De Marcación Completo:', asset.specs?.lineNumber],
      ['Numero De Marcación Corto:', asset.specs?.shortLineNumber || '—'],
      ['Costo Del Equipo Celular:', asset.specs?.deviceCost || '—'],
      ['Correo De Cuenta Gmail:', asset.specs?.gmailAccount],
    ]);
    y += 6;

    y = paragraph(doc, y,
      'A partir de la presente fecha me hago responsable del equipo y accesorios incluidos, así como a su devolución con las condiciones normales de uso en el momento que me sea requerido por parte de la empresa y/o mi jefe inmediato.');
    y = paragraph(doc, y,
      'Me comprometo a cumplir con todas y cada una de las políticas establecidas.\nLos daños causados por mal manejo o mi imprudencia será mi responsabilidad y asumo las consecuencias de los costos que de esto se derive.', { gap: 20 });

    signatureBlock(doc, y, ['IT', 'EMPLEADO', 'JEFE DIRECTO']);

    doc.end();
  });
}

module.exports = {
  DOC_CODES,
  buildEquiposLegacyPdf,
  buildAccesoriosLegacyPdf,
  buildCelularLegacyPdf,
};
