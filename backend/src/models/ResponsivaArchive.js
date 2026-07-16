const mongoose = require('mongoose');

const responsivaArchiveSchema = new mongoose.Schema({
  type:            { type: String, enum: ['activo', 'cuenta_plataforma', 'cuenta_plataforma_erp', 'cuenta_gmail'], required: true },
  employee:        { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  employeeName:    { type: String, required: true },
  employeeIdNum:   { type: String, default: '' },
  relatedLabel:    { type: String, default: '' }, // ej. "Computadora Laptop" o "Amazon — correo@gmail.com"
  fileName:        { type: String, required: true },
  pdfData:         { type: Buffer, required: true },
  generatedByName: { type: String, default: '' },
  generatedBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // para filtrar "solo lo mío" en usuarios no admin

  // Cuenta (GmailAccount/PlatformAccount) de la que salió esta responsiva —
  // permite reencontrarla y regenerarla si la cuenta se edita después.
  sourceId:        { type: mongoose.Schema.Types.ObjectId },
  // Datos del formulario puntual (tienda, jefe directo, vigencia, etc.) que no
  // se guardan en la cuenta — se conservan aquí para poder reconstruir el PDF
  // fielmente si hace falta regenerarlo.
  requestData:     { type: mongoose.Schema.Types.Mixed, default: {} },

  // Copia ya firmada (foto o PDF escaneado) que alguien sube después de
  // imprimir y firmar en papel el documento generado arriba.
  signedFileData:     { type: Buffer },
  signedFileName:     { type: String, default: '' },
  signedFileMimeType: { type: String, default: '' },
  signedAt:           { type: Date },
  signedByName:       { type: String, default: '' },
  signedBy:           { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
}, { timestamps: true });

module.exports = mongoose.model('ResponsivaArchive', responsivaArchiveSchema);
