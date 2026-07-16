const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  name: { type: String, required: true },
  email: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['admin', 'viewer'], default: 'viewer' },
  office: { type: String, default: '' },
  canManageGmailAccounts: { type: Boolean, default: false },
  canManagePlatformAccounts: { type: Boolean, default: false },
  canManagePlatformAccountsErp: { type: Boolean, default: false },
  // Acceso a equipos de telemetría marcados como sensibles (ver
  // Asset.isTelemetry) — ni siquiera el rol admin lo trae implícito, mismo
  // criterio que los 3 permisos de arriba: hay que otorgarlo explícitamente.
  canViewTelemetryAssets: { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
