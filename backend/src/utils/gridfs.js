const mongoose = require('mongoose');

// Adjuntos de Notas internas (imagen/video) — pedido explícito del usuario
// (2026-07-24): a diferencia de TODOS los demás adjuntos del proyecto
// (Buffer embebido directo en el documento Ticket), un video de celular
// fácilmente rebasa el límite de 16MB por documento de MongoDB — y ese
// límite aplica al Ticket COMPLETO (mensajes, notas, adjuntos ya
// existentes juntos), no solo al campo del adjunto. GridFS parte el
// archivo en chunks en su propia colección (`noteAttachments.files` /
// `noteAttachments.chunks`), sin ese límite — sigue siendo el mismo
// MongoDB Atlas que ya se usa, sin pagar un storage externo nuevo.
let bucket;
function getBucket() {
  if (!bucket) bucket = new mongoose.mongo.GridFSBucket(mongoose.connection.db, { bucketName: 'noteAttachments' });
  return bucket;
}

function uploadBuffer(buffer, filename, contentType) {
  return new Promise((resolve, reject) => {
    const uploadStream = getBucket().openUploadStream(filename, { contentType });
    uploadStream.on('finish', () => resolve(uploadStream.id));
    uploadStream.on('error', reject);
    uploadStream.end(buffer);
  });
}

function downloadStream(id) {
  return getBucket().openDownloadStream(id);
}

// Best-effort — nunca debe tronar el flujo principal (ej. borrar un ticket)
// si el archivo ya no existe o el borrado falla.
async function deleteFile(id) {
  try {
    await getBucket().delete(id);
  } catch { /* ya no existía o falló — no bloquea al que llama */ }
}

module.exports = { uploadBuffer, downloadStream, deleteFile };
