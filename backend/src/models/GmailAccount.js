const mongoose = require('mongoose');

const gmailAccountSchema = new mongoose.Schema({
  employee:          { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  email:             { type: String, required: true, unique: true, lowercase: true, trim: true },
  passwordEncrypted: { type: String, required: true },
  status:            { type: String, enum: ['activa', 'inactiva'], default: 'activa' },
  notes:             { type: String, default: '' },
  createdByName:     { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('GmailAccount', gmailAccountSchema);
