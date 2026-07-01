const mongoose = require('mongoose');

const gmailAccountSchema = new mongoose.Schema({
  employee:           { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true }, // por ahora Gmail no es reciclable, ver PlatformAccount
  email:              { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordEncrypted:  { type: String, required: true },
  passwordManuallySet:{ type: Boolean, default: false }, // true tras usar la corrección manual de contraseña (solo una vez)
  status:             { type: String, enum: ['activa', 'inactiva'], default: 'activa' },
  notes:              { type: String, default: '' },
  createdByName:      { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('GmailAccount', gmailAccountSchema);
