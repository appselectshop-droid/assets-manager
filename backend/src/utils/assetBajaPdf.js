const PDFDocument = require('pdfkit');
const {
  MARGIN, PAGE_W, CW, DARK, GRAY, GRAY_LT, BORDER,
  guard, sectionBand, kvRow,
} = require('./pdfBranding');
const { formatMx } = require('./dateFormat');

// Mismo naranja de marca que shipmentPdf.js — es un movimiento interno de
// Sistemas (baja de inventario), no ligado a la razón social de un
// empleado en particular, así que no se resuelve por `getEmpresaConfig`.
const ACCENT = '#E8431A';

const BUYER_TYPE_LABEL = { empleado: 'Empleado de SelectShop', externo: 'Externo / tercero' };

function box(doc, x, y, w, h) {
  doc.save().lineWidth(0.75).strokeColor(BORDER).rect(x, y, w, h).stroke().restore();
}

function toBuffer(doc, draw) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);
    draw();
    doc.end();
  });
}

// Fila de cajas de firma — mismo patrón que shipmentPdf.js (signatureRow):
// el nombre ya capturado se imprime arriba de la línea para que la firma en
// papel solo lo ratifique. `boxes` varía en longitud según el motivo de
// baja (2 firmas si no hay venta, 3 si sí hay comprador) — con 1 o 2 no se
// estira a todo el ancho de la hoja, se ve desproporcionado.
function signatureRow(doc, y, boxes) {
  y = guard(doc, y, 90);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
     .text('FIRMAS Y AUTORIZACIONES', MARGIN, y, { width: CW, align: 'center' });
  y += 14;
  const gap = 10;
  const rowW = boxes.length >= 3 ? CW : CW * (0.42 * boxes.length);
  const rowX = MARGIN + (CW - rowW) / 2;
  const sigW = (rowW - gap * (boxes.length - 1)) / boxes.length;
  const sigH = 60;
  boxes.forEach(({ label, name }, i) => {
    const sx = rowX + i * (sigW + gap);
    box(doc, sx, y, sigW, sigH);
    if (name) {
      doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7)
         .text(name, sx + 4, y + 8, { width: sigW - 8, align: 'center' });
    }
    doc.save().strokeColor(BORDER).lineWidth(0.7)
       .moveTo(sx + 8, y + sigH - 22).lineTo(sx + sigW - 8, y + sigH - 22).stroke().restore();
    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6.5)
       .text('Nombre y firma', sx, y + sigH - 18, { width: sigW, align: 'center' });
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(7)
       .text(label, sx, y + sigH - 8, { width: sigW, align: 'center' });
  });
  return y + sigH + 10;
}

function footer(doc, y) {
  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(6)
     .text('SELECTSHOP MB  |  Sistemas IT & BI  |  Uso Interno', MARGIN, y, { width: CW, align: 'center' });
}

// `authorizedByName`: nombre de quien tenga hoy el correo de Gerente de
// Sistemas (resuelto por la ruta, ver GET /:id/pdf) — nunca se guarda en el
// registro de baja, ver comentario en AssetBaja.js.
function buildAssetBajaPdf(baja, authorizedByName) {
  const doc = new PDFDocument({
    size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: true, bufferPages: true,
  });
  const isVenta = baja.reason === 'Venta';
  const a = baja.assetSnapshot || {};

  return toBuffer(doc, () => {
    let y = MARGIN;
    doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13)
       .text('FORMATO DE SALIDA POR BAJA DE ACTIVO', MARGIN, y, { width: CW, align: 'center' });
    y += 16;
    doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
       .text('Baja de inventario — SelectShop MB SA de CV — Sistemas IT & BI', MARGIN, y, { width: CW, align: 'center' });
    y += 14;
    doc.save().rect(MARGIN, y, CW, 1.5).fill(ACCENT).restore();
    y += 8;

    doc.fillColor(GRAY_LT).font('Helvetica').fontSize(7.5)
       .text(`FOLIO: ${baja.folio}`, MARGIN, y, { width: CW / 2 })
       .text(`FECHA: ${formatMx(baja.createdAt, { day: 'numeric', month: 'long', year: 'numeric' })}`, MARGIN + CW / 2, y, { width: CW / 2, align: 'right' });
    y += 16;

    y = sectionBand(doc, y, '  DATOS DEL ACTIVO', ACCENT);
    y = kvRow(doc, y, { label: 'Tipo', value: a.type }, { label: 'Marca / Modelo', value: `${a.brand || ''} ${a.model || ''}`.trim() });
    y = kvRow(doc, y, { label: 'No. de serie', value: a.serialNumber }, { label: 'No. de inventario', value: a.inventoryTag });
    y = kvRow(doc, y, { label: 'Sucursal / resguardo', value: a.location }, { label: 'Condición', value: baja.condition });
    if (baja.conditionNotes) {
      y = kvRow(doc, y, { label: 'Observaciones', value: baja.conditionNotes }, null);
    }
    y = kvRow(doc, y, { label: 'Datos corporativos borrados', value: baja.dataWiped ? 'Sí' : 'No' }, null);
    y += 6;

    y = guard(doc, y, 30);
    y = sectionBand(doc, y, '  MOTIVO DE BAJA', ACCENT);
    doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text(
      `[X] ${baja.reason}${baja.reason === 'Otro' && baja.reasonOther ? ': ' + baja.reasonOther : ''}`,
      MARGIN, y, { width: CW }
    );
    y += 16;
    doc.fillColor(GRAY).font('Helvetica').fontSize(8).text(
      'Se da de baja del inventario de activos de SelectShop MB SA de CV el equipo descrito arriba, a partir de la fecha indicada en este documento.',
      MARGIN, y, { width: CW }
    );
    y += doc.heightOfString('Se da de baja del inventario de activos de SelectShop MB SA de CV el equipo descrito arriba, a partir de la fecha indicada en este documento.', { width: CW, fontSize: 8 }) + 8;

    if (isVenta) {
      y = guard(doc, y, 40);
      y = sectionBand(doc, y, '  DATOS DEL COMPRADOR', ACCENT);
      y = kvRow(doc, y, { label: 'Tipo de comprador', value: BUYER_TYPE_LABEL[baja.buyerType] }, { label: 'Nombre completo', value: baja.buyerName });
      if (baja.buyerType === 'empleado') {
        y = kvRow(doc, y, { label: 'Puesto', value: baja.buyerEmployee?.position }, { label: 'Sucursal', value: baja.buyerEmployee?.office });
      } else {
        y = kvRow(doc, y, { label: 'Identificación oficial', value: baja.buyerIdNumber }, { label: 'Teléfono', value: baja.buyerPhone });
        if (baja.buyerAddress) y = kvRow(doc, y, { label: 'Domicilio', value: baja.buyerAddress }, null);
      }
      y += 6;

      y = guard(doc, y, 40);
      y = sectionBand(doc, y, '  DATOS DE LA VENTA', ACCENT);
      y = kvRow(doc, y,
        { label: 'Monto de venta', value: baja.saleAmount != null ? `$${Number(baja.saleAmount).toLocaleString('es-MX', { minimumFractionDigits: 2 })}` : null },
        { label: 'Forma de pago', value: baja.paymentMethod === 'Otro' && baja.paymentMethodOther ? baja.paymentMethodOther : baja.paymentMethod });
      y = kvRow(doc, y,
        { label: 'Fecha de pago', value: baja.paymentDate ? formatMx(baja.paymentDate, { day: 'numeric', month: 'numeric', year: 'numeric' }) : null },
        { label: 'Referencia', value: baja.saleReference });
      y += 6;

      y = guard(doc, y, 40);
      const clause = 'El comprador declara haber revisado el activo descrito en este documento y acepta recibirlo en el estado físico y funcional en que se encuentra a la fecha de esta venta ("tal cual"), sin garantía de ningún tipo por parte de SelectShop MB SA de CV. A partir de la firma de este documento, el activo deja de formar parte del inventario y del resguardo de la empresa, y toda responsabilidad por su uso, mantenimiento o reparación posterior corresponde exclusivamente al comprador.';
      doc.fillColor(GRAY).font('Helvetica-Oblique').fontSize(7.5).text(clause, MARGIN, y, { width: CW });
      y += doc.heightOfString(clause, { width: CW, fontSize: 7.5 }) + 8;
    }

    const boxes = [
      { label: 'Entrega — IT', name: baja.deliveredByName },
      { label: 'Autoriza — Gerente de Sistemas', name: authorizedByName },
    ];
    if (isVenta) boxes.push({ label: 'Compra — recibí el activo de conformidad', name: baja.buyerName });
    y = signatureRow(doc, y, boxes);

    footer(doc, y);
  });
}

module.exports = { buildAssetBajaPdf };
