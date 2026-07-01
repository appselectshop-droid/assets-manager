const mongoose = require('mongoose');

const platformAccountSchema = new mongoose.Schema({
  employee:          { type: mongoose.Schema.Types.ObjectId, ref: 'Employee', required: true },
  platform:          { type: String, required: true, trim: true }, // Microsoft, Amazon, Netflix, Otra...
  username:          { type: String, required: true, trim: true }, // correo o usuario de la cuenta en esa plataforma
  passwordEncrypted: { type: String, required: true },
  status:            { type: String, enum: ['activa', 'inactiva'], default: 'activa' },
  notes:             { type: String, default: '' },
  createdByName:     { type: String, default: '' },
}, { timestamps: true });

platformAccountSchema.index({ platform: 1, username: 1 }, { unique: true });

module.exports = mongoose.model('PlatformAccount', platformAccountSchema);
