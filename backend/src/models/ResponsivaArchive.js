const mongoose = require('mongoose');

const responsivaArchiveSchema = new mongoose.Schema({
  type:            { type: String, enum: ['activo', 'cuenta_plataforma'], required: true },
  employee:        { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeName:    { type: String, required: true },
  employeeIdNum:   { type: String, default: '' },
  relatedLabel:    { type: String, default: '' }, // ej. "Computadora Laptop" o "Amazon — correo@gmail.com"
  fileName:        { type: String, required: true },
  pdfData:         { type: Buffer, required: true },
  generatedByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('ResponsivaArchive', responsivaArchiveSchema);
