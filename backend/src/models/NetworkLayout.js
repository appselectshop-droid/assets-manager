const mongoose = require('mongoose');

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

  createdByName: { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('NetworkLayout', networkLayoutSchema);
