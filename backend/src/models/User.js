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

  // Panel Gerencial (Tickets → Equipo) — pedido explícito del usuario
  // (2026-07-30) para dar de alta a gerente.sistemas: vista de supervisión
  // del equipo (carga de tickets, tiempos de resolución, calificaciones
  // CSAT por persona). El usuario decidió que solo el gerente lo vea, no
  // el resto de Sistemas — por eso es un permiso aparte y no algo que
  // venga implícito con el rol admin.
  canViewManagerDashboard: { type: Boolean, default: false },

  // Notificaciones push del panel admin — pedido explícito del usuario
  // (2026-07-24): que le llegue un aviso cuando el empleado responde un
  // ticket que tiene asignado, mismo mecanismo que ya existe del lado
  // empleado (ver Employee.pushSubscriptions y utils/webPush.js).
  pushSubscriptions: [{
    endpoint: { type: String, required: true },
    keys: {
      p256dh: { type: String, required: true },
      auth:   { type: String, required: true },
    },
    createdAt: { type: Date, default: Date.now },
  }],
}, { timestamps: true });

module.exports = mongoose.model('User', userSchema);
