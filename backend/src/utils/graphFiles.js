// Fotos de activos/productos en OneDrive en vez de Mongo — pedido explícito
// del usuario (2026-09-08), después de que un pico real de memoria tumbó a
// MongoDB (ver CHANGELOG "EC2 sin memoria mató a MongoDB"): 767 de 773
// activos ya traían su foto como Buffer embebido en el documento, inflando
// el tamaño de la colección y la memoria de trabajo de Mongo en un EC2 ya
// justo de RAM. Sacar los binarios de Mongo hacia OneDrive (usando el mismo
// App Registration de Azure que ya manda correo, ver graphAuth.js/
// graphMail.js — requirió agregar el permiso de aplicación
// Files.ReadWrite.All con consentimiento de administrador) resuelve eso de
// raíz: Mongo solo guarda un ID de archivo, nunca el binario.
const { getAccessToken } = require('./graphAuth');

const ONEDRIVE_USER = process.env.ONEDRIVE_PHOTOS_USER || 'sistemasP@selectshop.com.mx';
const ONEDRIVE_FOLDER = 'Fotos de Activos';

function driveBase() {
  return `https://graph.microsoft.com/v1.0/users/${encodeURIComponent(ONEDRIVE_USER)}/drive`;
}

// Sube un archivo (nombre ya debe venir único — ver buildUniqueFileName en
// routes/assets.js) y devuelve el driveItem completo (se guarda solo el
// `id` en Mongo). `folder` (2026-09-10, adjuntos de la Bitácora de
// becarios) deja subir a una carpeta distinta de la de fotos de activos —
// por default se queda igual que siempre.
async function uploadFile(fileName, buffer, mimeType, folder = ONEDRIVE_FOLDER) {
  const token = await getAccessToken();
  const path = `${folder}/${fileName}`;
  const res = await fetch(`${driveBase()}/root:/${encodeURIComponent(path)}:/content`, {
    method: 'PUT',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': mimeType || 'application/octet-stream' },
    body: buffer,
  });
  if (!res.ok) throw new Error(`OneDrive upload error: ${res.status} ${await res.text()}`);
  return res.json();
}

// URL de descarga directa — temporal (~1h, la emite Microsoft), por eso
// nunca se guarda: se pide fresca cada vez que se sirve la foto (ver
// GET /:id/photo en routes/assets.js, que redirige aquí en vez de servir un
// binario propio).
async function getDownloadUrl(driveItemId) {
  const token = await getAccessToken();
  const res = await fetch(`${driveBase()}/items/${driveItemId}?select=id,@microsoft.graph.downloadUrl`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`OneDrive download-url error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  return data['@microsoft.graph.downloadUrl'];
}

// No se usa todavía (no hay flujo que borre fotos) pero se deja lista para
// cuando se necesite — ej. reemplazar una foto debería borrar la anterior
// de OneDrive, no solo dejarla huérfana ahí.
async function deleteFile(driveItemId) {
  const token = await getAccessToken();
  const res = await fetch(`${driveBase()}/items/${driveItemId}`, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok && res.status !== 404) throw new Error(`OneDrive delete error: ${res.status} ${await res.text()}`);
}

module.exports = { uploadFile, getDownloadUrl, deleteFile };
