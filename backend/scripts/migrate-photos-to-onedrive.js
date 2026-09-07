// Migra las fotos de Activos/Accesorios de Mongo (photoData Buffer) a
// OneDrive — pedido explícito del usuario (2026-09-08), después del
// incidente real de OOM que tumbó a MongoDB (ver CHANGELOG). Por cada
// documento: sube la foto a OneDrive, CONFIRMA que quedó accesible (pide el
// link de descarga), y SOLO entonces borra `photoData` de Mongo — nunca se
// borra el binario sin haber confirmado la subida primero. Si un documento
// falla, se salta y sigue con los demás (se reporta al final para
// reintentar) — un solo error de red no debe dejar la migración a medias.
//
// Uso:
//   node scripts/migrate-photos-to-onedrive.js --dry-run        (no sube ni borra nada, solo lista)
//   node scripts/migrate-photos-to-onedrive.js --limit=3         (prueba real con 3 documentos)
//   node scripts/migrate-photos-to-onedrive.js                   (corre con todos los pendientes)
require('dotenv').config();
const mongoose = require('mongoose');
const Asset = require('../src/models/Asset');
const graphFiles = require('../src/utils/graphFiles');

const args = process.argv.slice(2);
const limitArg = args.find((a) => a.startsWith('--limit='));
const LIMIT = limitArg ? parseInt(limitArg.split('=')[1], 10) : 0; // 0 = sin límite
const DRY_RUN = args.includes('--dry-run');

function buildUniquePath(assetId, originalName) {
  const safeName = (originalName || 'foto').replace(/[^\w.\-]+/g, '_');
  return `${assetId}-${Date.now()}-${safeName}`;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Conectado a Mongo.');

  const query = {
    photoData: { $exists: true, $ne: null },
    $or: [{ photoDriveItemId: { $exists: false } }, { photoDriveItemId: '' }],
  };
  const total = await Asset.countDocuments(query);
  console.log(`Encontrados ${total} activos con foto pendiente de migrar. Límite esta corrida: ${LIMIT || 'sin límite'}${DRY_RUN ? ' (DRY RUN)' : ''}`);

  const cursor = (LIMIT ? Asset.find(query).limit(LIMIT) : Asset.find(query)).cursor();
  let ok = 0;
  let fail = 0;
  const failures = [];

  for await (const asset of cursor) {
    try {
      if (!asset.photoData || asset.photoData.length === 0) {
        console.log(`SALTADO ${asset._id}: photoData vacío`);
        continue;
      }
      if (DRY_RUN) {
        console.log(`[dry-run] subiría ${asset._id} (${asset.photoFileName || 'sin nombre'}, ${asset.photoData.length} bytes)`);
        ok += 1;
        continue;
      }
      const path = buildUniquePath(asset._id, asset.photoFileName);
      const driveItem = await graphFiles.uploadFile(path, asset.photoData, asset.photoMimeType || 'application/octet-stream');
      // Confirmar que quedó accesible en OneDrive ANTES de tocar Mongo.
      await graphFiles.getDownloadUrl(driveItem.id);
      await Asset.updateOne({ _id: asset._id }, { $set: { photoDriveItemId: driveItem.id }, $unset: { photoData: '' } });
      ok += 1;
      console.log(`OK ${asset._id} -> driveItemId ${driveItem.id}`);
      await sleep(150); // ritmo conservador, no saturar la API de Graph
    } catch (err) {
      fail += 1;
      failures.push({ id: asset._id.toString(), error: err.message });
      console.error(`FALLO ${asset._id}: ${err.message}`);
    }
  }

  console.log('--- resumen ---');
  console.log(`OK: ${ok}, FALLOS: ${fail}`);
  if (failures.length) console.log(JSON.stringify(failures, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error('Error fatal:', err);
  process.exit(1);
});
