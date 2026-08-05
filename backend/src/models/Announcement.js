const mongoose = require('mongoose');

// Avisos del carrusel de Mesa de Ayuda (2026-08-05) — pedido explícito del
// usuario: el panel de "Sistema de tickets" en la página de inicio del
// portal debe rotar también con avisos que Sistemas suba. Cada aviso es
// una imagen ya diseñada (Canva/PowerPoint, con el logo/estilo de la
// empresa) — no se intenta reconstruir ese diseño con campos sueltos, sería
// menos flexible. La imagen vive en GridFS (bucket 'announcements', ver
// utils/gridfs.js), igual que otros adjuntos grandes del proyecto.
const announcementSchema = new mongoose.Schema({
  title: { type: String, default: '' },
  imageId: { type: mongoose.Schema.Types.ObjectId, required: true },
  imageMimeType: { type: String, required: true },
  imageFileName: { type: String, default: '' },
  active: { type: Boolean, default: true },
  order: { type: Number, default: 0 },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Announcement', announcementSchema);
