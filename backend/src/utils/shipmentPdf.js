const PDFDocument = require('pdfkit');
const {
  MARGIN, PAGE_W, CW, DARK, GRAY, GRAY_LT, BORDER, BG_STRIPE,
  guard, sectionBand, kvRow, blendWithWhite,
} = require('./pdfBranding');

const ACCENT = '#E8431A'; // movimiento interno de IT, no ligado a la razón social de un empleado en particular

function box(doc, x, y, w, h) {
  doc.save().lineWidth(0.75).strokeColor(BORDER).rect(x, y, w, h).stroke().restore();
}

// Dibuja el cuerpo común a los dos formatos (título/folio, datos del
// solicitante, tabla de equipos, motivo, estatus) — cada formato solo agrega
// su propia sección de firmas al final, según quién debe firmar cada uno:
// el MENSAJERO firma la salida (se lleva el equipo bajo su resguardo para
// transportarlo), y quien RECIBE firma la recepción — son dos momentos y dos
// responsables distintos, por eso son dos documentos separados.
function renderShipmentBody(doc, shipment, title, subtitle, itemsLabel) {
  const createdStr = new Date(shipment.createdAt).toLocaleDateString('es-MX', { day: 'numeric', month: 'long', year: 'numeric' });
  const createdTime = new Date(shipment.createdAt).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' });

  let y = MARGIN;
  doc.fillColor(ACCENT).font('Helvetica-Bold').fontSize(13)
     .text(title, MARGIN, y, { width: CW, align: 'center' });
  y += 16;
  doc.fillColor(GRAY).font('Helvetica').fontSize(8.5)
     .text(subtitle, MARGIN, y, { width: CW, align: 'center' });
  y += 14;
  doc.save().rect(MARGIN, y, CW, 1.5).fill(ACCENT).restore();
  y += 8;

  doc.fillColor(GRAY_LT).font('Helvetica').fontSize(7.5)
     .text(`FOLIO: ${shipment.folio}`, MARGIN, y, { width: CW / 2 })
     .text(`FECHA: ${createdStr}   HORA: ${createdTime}`, MARGIN + CW / 2, y, { width: CW / 2, align: 'right' });
  y += 16;

  y = sectionBand(doc, y, '  DATOS DEL SOLICITANTE', ACCENT);
  y = kvRow(doc, y, { label: 'Nombre', value: shipment.requesterName },
                     { label: 'Departamento', value: shipment.requesterDepartment });
  y = kvRow(doc, y, { label: 'Puesto', value: shipment.requesterPosition },
                     { label: 'Sucursal origen', value: shipment.originOffice });
  y = kvRow(doc, y, { label: 'Destino', value: shipment.destinationOffice },
                     { label: 'Destinatario', value: shipment.recipientName });
  y += 6;

  y = guard(doc, y, 20 + shipment.items.length * 16);
  y = sectionBand(doc, y, `  ${itemsLabel}`, ACCENT);
  const cols = [
    { key: 'type', label: 'Tipo', w: CW * 0.16 },
    { key: 'description', label: 'Descripción / Modelo', w: CW * 0.34 },
    { key: 'serialOrImei', label: 'No. Serie / IMEI', w: CW * 0.24 },
    { key: 'condition', label: 'Condición', w: CW * 0.13 },
    { key: 'itemStatus', label: 'Estado', w: CW * 0.13 },
  ];
  let x = MARGIN;
  const headH = 14;
  cols.forEach((c) => { box(doc, x, y, c.w, headH); doc.fillColor(DARK).font('Helvetica-Bold').fontSize(6.5).text(c.label, x + 3, y + 4, { width: c.w - 6 }); x += c.w; });
  y += headH;
  // La altura de cada fila se mide en vez de asumir 15pt fijos — una
  // descripción larga envolvía a una segunda línea que se encimaba con la
  // fila de abajo (bug real: "la información está sobrepuesta").
  shipment.items.forEach((item, i) => {
    x = MARGIN;
    const rowH = Math.max(15, ...cols.map((c) => doc.heightOfString(item[c.key] || '—', { width: c.w - 6, fontSize: 7 }) + 8));
    y = guard(doc, y, rowH);
    if (i % 2 === 0) doc.save().rect(MARGIN, y, CW, rowH).fill(BG_STRIPE).restore();
    cols.forEach((c) => {
      box(doc, x, y, c.w, rowH);
      doc.fillColor(DARK).font('Helvetica').fontSize(7).text(item[c.key] || '—', x + 3, y + 4, { width: c.w - 6 });
      x += c.w;
    });
    y += rowH;
  });
  y += 6;

  y = guard(doc, y, 30);
  y = sectionBand(doc, y, '  MOTIVO DE SALIDA', ACCENT);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8).text(
    `[X] ${shipment.reason}${shipment.reason === 'Otro' && shipment.reasonOther ? ': ' + shipment.reasonOther : ''}`,
    MARGIN, y, { width: CW }
  );
  y += 16;

  if (shipment.notes) {
    doc.fillColor(GRAY).font('Helvetica-Bold').fontSize(7.5).text('Observaciones:', MARGIN, y);
    y += 10;
    const h = doc.heightOfString(shipment.notes, { width: CW, fontSize: 8 });
    doc.fillColor(DARK).font('Helvetica').fontSize(8).text(shipment.notes, MARGIN, y, { width: CW });
    y += h + 8;
  }
  if (shipment.returnDate) {
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
       .text(`Fecha de retorno esperada: ${new Date(shipment.returnDate).toLocaleDateString('es-MX')}`, MARGIN, y);
    y += 14;
  }

  y = guard(doc, y, 24);
  const STATUS_LABEL = { enviado: 'ENVIADO', en_transito: 'EN TRÁNSITO', recibido: 'RECIBIDO' };
  const STATUS_COLOR = { enviado: '#d97706', en_transito: '#2563eb', recibido: '#16a34a' };
  doc.save().rect(MARGIN, y, CW, 20).fill(blendWithWhite(STATUS_COLOR[shipment.status], 0.12)).restore();
  doc.fillColor(STATUS_COLOR[shipment.status]).font('Helvetica-Bold').fontSize(9)
     .text(`ESTATUS: ${STATUS_LABEL[shipment.status]}`, MARGIN, y + 5, { width: CW, align: 'center' });
  y += 28;
  // El mensajero confirma "en tránsito" escaneando el link público desde su
  // teléfono — antes esa confirmación solo se veía en la caja de firma (sin
  // fecha); pedido explícito de que su nombre (y cuándo escaneó) se vea
  // claro en el cuerpo del documento, igual que ya pasa con "Recibido por".
  if (shipment.transitByName) {
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
       .text(`En tránsito por: ${shipment.transitByName}${shipment.transitAt ? ' — ' + new Date(shipment.transitAt).toLocaleString('es-MX') : ''}`, MARGIN, y, { width: CW, align: 'center' });
    y += 14;
  }
  if (shipment.status === 'recibido') {
    doc.fillColor(GRAY).font('Helvetica').fontSize(7.5)
       .text(`Recibido por: ${shipment.receivedByName} — ${new Date(shipment.receivedAt).toLocaleString('es-MX')}`, MARGIN, y, { width: CW, align: 'center' });
    y += 14;
  }
  y += 6;

  return y;
}

// Dibuja una fila de cajas de firma — cada una con el nombre ya capturado
// digitalmente (si existe) impreso arriba de la línea, para que la firma en
// papel solo confirme/ratifique lo que el sistema ya registró, en vez de
// dejarlo en blanco y depender de que alguien escriba bien el nombre a mano.
// `image` (opcional, Buffer): firma real escaneada de quien recibe — si
// existe, se dibuja arriba de la línea en vez del nombre impreso (pedido
// explícito, por ahora solo para Felipe — ver GET /:id/reception-pdf).
function signatureRow(doc, y, boxes) {
  y = guard(doc, y, 90);
  doc.fillColor(DARK).font('Helvetica-Bold').fontSize(8)
     .text('FIRMAS Y AUTORIZACIONES', MARGIN, y, { width: CW, align: 'center' });
  y += 14;
  const gap = 10;
  // Con una sola firma no se estira a todo el ancho de la hoja (se vería
  // desproporcionado) — se limita a una caja de tamaño normal y se centra.
  const rowW = boxes.length === 1 ? CW * 0.42 : CW;
  const rowX = MARGIN + (CW - rowW) / 2;
  const sigW = (rowW - gap * (boxes.length - 1)) / boxes.length;
  const sigH = 60;
  boxes.forEach(({ label, name, image }, i) => {
    const sx = rowX + i * (sigW + gap);
    box(doc, sx, y, sigW, sigH);
    if (image) {
      try {
        doc.image(image, sx + 6, y + 4, { fit: [sigW - 12, sigH - 30], align: 'center', valign: 'center' });
      } catch (err) {
        // Imagen corrupta o en un formato que pdfkit no soporta (ver
        // ALLOWED mimes en routes/shipments.js) — no debe tronar el PDF
        // completo, solo se omite y la caja queda vacía arriba de la línea.
      }
    } else if (name) {
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

// FORMATO DE SALIDA — lo firman el MENSAJERO (se lleva el equipo bajo su
// resguardo para transportarlo) y el GERENTE DE SISTEMAS (autoriza la
// salida). Pedido explícito: dejar claro que el mensajero firma ESTE
// documento, no el de recepción (fuente de una confusión real con uno).
function buildShipmentPdf(shipment, gerenteSistemasName) {
  const doc = new PDFDocument({
    size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: true, bufferPages: true,
  });
  return toBuffer(doc, () => {
    let y = renderShipmentBody(doc, shipment, 'FORMATO DE SALIDA DE EQUIPOS', 'Cómputo y Celulares — Sistemas IT & BI', 'EQUIPOS EN SALIDA');
    y = signatureRow(doc, y, [
      { label: 'Mensajero', name: shipment.transitByName },
      { label: 'Gerente de Sistemas', name: gerenteSistemasName },
    ]);
    footer(doc, y);
  });
}

// FORMATO DE RECEPCIÓN — lo firma únicamente el DESTINATARIO, confirmando
// que le llegó el equipo completo y en las condiciones descritas. Antes solo
// existía el formato de salida y se prestaba a confusión sobre quién
// firmaba qué; este es el documento correcto para quien recibe.
// `recipientSignatureImage` (opcional, Buffer): firma real escaneada del
// destinatario — hoy solo aplica a Felipe (ver routes/shipments.js), quien
// la subió una vez y de ahí en adelante se reutiliza en todos sus envíos.
function buildShipmentReceptionPdf(shipment, recipientSignatureImage) {
  const doc = new PDFDocument({
    size: 'LETTER', margins: { top: MARGIN, bottom: MARGIN, left: MARGIN, right: MARGIN },
    autoFirstPage: true, bufferPages: true,
  });
  return toBuffer(doc, () => {
    let y = renderShipmentBody(doc, shipment, 'FORMATO DE RECEPCIÓN DE EQUIPOS', 'Confirmación de entrega en destino — Sistemas IT & BI', 'EQUIPOS RECIBIDOS');
    y = signatureRow(doc, y, [
      { label: 'Destinatario — recibí de conformidad', name: shipment.receivedByName || shipment.recipientName, image: recipientSignatureImage },
    ]);
    footer(doc, y);
  });
}

module.exports = { buildShipmentPdf, buildShipmentReceptionPdf };
