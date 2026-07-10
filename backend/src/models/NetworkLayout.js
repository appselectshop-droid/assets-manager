const mongoose = require('mongoose');

// Un dispositivo que una herramienta de descubrimiento de red (ej. SADP de
// Hikvision, ConfigTool de Dahua) ya reportó con su IP/MAC/modelo/serie SIN
// necesitar credenciales del NVR — se importa en lote y queda como "pool" a
// la espera de que alguien identifique físicamente a qué pin del plano le
// toca cada uno (ej. apagando puertos PoE uno a uno y viendo cuál MAC
// desaparece), sin tener que trepar a revisar la etiqueta de cada cámara.
const discoveredDeviceSchema = new mongoose.Schema({
  ip:           { type: String, default: '' },
  mac:          { type: String, required: true },
  model:        { type: String, default: '' },
  serialNumber: { type: String, default: '' },
}, { timestamps: { createdAt: 'addedAt', updatedAt: false } });

// Plano/layout de una sucursal (imagen subida por el equipo de Infra) sobre
// el que se colocan los dispositivos de red (ver LayoutDevice) — la imagen
// se guarda en Mongo, no en disco, porque Render no persiste el filesystem
// entre despliegues (mismo criterio que PDFs/adjuntos de Tickets).
const networkLayoutSchema = new mongoose.Schema({
  name:   { type: String, required: true }, // ej. "Polanco - Piso 2"
  office: { type: String, default: '' },    // opcional, para agrupar/filtrar por sucursal

  imageData:     { type: Buffer, required: true },
  imageMimeType: { type: String, required: true },
  imageFileName: { type: String, default: '' },

  discoveredDevices: { type: [discoveredDeviceSchema], default: [] },

  createdByName: { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('NetworkLayout', networkLayoutSchema);
