const mongoose = require('mongoose');

// Bitácora de becarios — pedido explícito del usuario (2026-09-05): dos
// becarios nuevos (Mariano Chavez, Italo Correa) necesitan retroalimentarse
// constantemente en actividades/pendientes. Se descartó un tablero tipo
// Kanban con tarjetas ("no me gusta que sean tarjetas") a favor de un feed
// de bitácora/diario — cada entrada es "qué hice / qué me falta", puede
// traer archivos de evidencia, y la retroalimentación se da en comentarios
// y reacciones rápidas debajo de cada entrada.
const attachmentSchema = new mongoose.Schema({
  data:     { type: Buffer, required: true },
  mimeType: { type: String, required: true },
  fileName: { type: String, default: '' },
}, { _id: true, timestamps: false });

const commentSchema = new mongoose.Schema({
  authorName:  { type: String, required: true },
  authorEmail: { type: String, required: true },
  text:        { type: String, required: true },
}, { timestamps: true });

// Reacción rápida sin tener que escribir un comentario — un mismo autor solo
// puede tener una reacción activa por entrada (ver toggle en routes/becarios.js).
const reactionSchema = new mongoose.Schema({
  emoji:       { type: String, required: true },
  authorName:  { type: String, required: true },
  authorEmail: { type: String, required: true },
}, { _id: false, timestamps: false });

const becarioEntrySchema = new mongoose.Schema({
  authorName:  { type: String, required: true },
  authorEmail: { type: String, required: true },
  body:        { type: String, required: true },
  attachments: [attachmentSchema],
  comments:    [commentSchema],
  reactions:   [reactionSchema],
}, { timestamps: true });

module.exports = mongoose.model('BecarioEntry', becarioEntrySchema);
