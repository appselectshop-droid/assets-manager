const mongoose = require('mongoose');

// Catálogo reutilizable de etiquetas para el Kanban de Proyectos BI —
// pedido explícito del usuario (2026-08-04), estilo Trello: se crea una
// etiqueta una sola vez (nombre + color de una paleta fija) y se asigna/
// quita de cualquier tarjeta (ver Ticket.projectLabelIds y
// PUT /tickets/:id/project-labels). Solo aplica a biRequestKind
// 'proyecto' — Bases de Datos no usa esto.
const PROJECT_LABEL_COLORS = [
  '#E8651A', // naranja (marca BI, mismo color del Word de Solicitud de Proyecto)
  '#dc2626', // rojo
  '#16a34a', // verde
  '#2563eb', // azul
  '#7c3aed', // morado
  '#d97706', // ámbar
  '#0d9488', // teal
  '#6b7280', // gris
];

const projectLabelSchema = new mongoose.Schema({
  name:  { type: String, required: true, unique: true, trim: true },
  color: { type: String, enum: PROJECT_LABEL_COLORS, required: true },
}, { timestamps: true });

const ProjectLabel = mongoose.model('ProjectLabel', projectLabelSchema);
module.exports = ProjectLabel;
module.exports.PROJECT_LABEL_COLORS = PROJECT_LABEL_COLORS;
