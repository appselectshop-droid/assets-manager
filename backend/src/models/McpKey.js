const mongoose = require('mongoose');

// Llaves de acceso al conector MCP de Assets Manager (2026-11-23, pedido
// explícito del usuario: "crea la opción para conectar un MCP a Claude de
// esta aplicación... un panel en el engrane para gestionar los accesos").
//
// El MCP es SOLO LECTURA (decisión del usuario). Cada llave se limita a los
// módulos que se le marquen al crearla. La llave en claro solo se muestra una
// vez al crearla; aquí se guarda únicamente su hash SHA-256 (igual que una
// contraseña, pero sin bcrypt porque es un token aleatorio de 32 bytes, no
// algo adivinable) y un prefijo visible para reconocerla en el panel.
const MODULES = ['activos', 'empleados', 'tickets', 'pagos'];

const mcpKeySchema = new mongoose.Schema({
  name:      { type: String, required: true, trim: true },
  prefix:    { type: String, required: true },          // ej. "amk_3f9a1c" — solo para mostrar
  keyHash:   { type: String, required: true, unique: true },
  modules:   { type: [{ type: String, enum: MODULES }], default: [] },
  expiresAt: { type: Date, default: null },             // null = no vence
  revokedAt: { type: Date, default: null },
  revokedByName: { type: String, default: '' },
  createdBy:     { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdByName: { type: String, default: '' },

  // Uso — para que el panel muestre si la llave se está usando y en qué.
  lastUsedAt: { type: Date, default: null },
  lastUsedIp: { type: String, default: '' },
  useCount:   { type: Number, default: 0 },
  // Últimas llamadas a herramientas (las 25 más recientes).
  recentCalls: [{
    _id: false,
    tool: String,
    at:   { type: Date, default: Date.now },
    ok:   { type: Boolean, default: true },
  }],
}, { timestamps: true });

mcpKeySchema.statics.MODULES = MODULES;

module.exports = mongoose.model('McpKey', mcpKeySchema);
