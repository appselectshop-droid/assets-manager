const ResponsivaArchive = require('../models/ResponsivaArchive');

// Recolecta el PDF que arma `doc` (pdfkit), lo guarda en el archivo histórico
// (Mongo, no disco — en Render el disco no persiste entre despliegues) y luego
// responde la descarga. Si el guardado falla, la descarga igual se completa:
// archivar nunca debe romper la generación del documento.
function archiveAndRespond(doc, res, meta) {
  const chunks = [];
  doc.on('data', (chunk) => chunks.push(chunk));
  doc.on('end', async () => {
    const pdfBuffer = Buffer.concat(chunks);
    try {
      await ResponsivaArchive.create({ ...meta, pdfData: pdfBuffer });
    } catch (err) {
      console.error('Error archivando responsiva:', err);
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${meta.fileName}"`);
    res.end(pdfBuffer);
  });
}

module.exports = { archiveAndRespond };
