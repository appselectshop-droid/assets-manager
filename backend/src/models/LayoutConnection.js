const mongoose = require('mongoose');

// Un "cable" dibujado entre dos pines (LayoutDevice) de un mismo plano — ej.
// cámara→switch, switch→router (uplink), AP→switch. El trazo es una lista de
// puntos en PORCENTAJE (igual que la posición de los pines), no una línea
// recta, para poder simular el recorrido real del cable sobre el plano.
// A propósito NO guarda un "tipo de conexión": se infiere en el frontend a
// partir del deviceType de fromDevice/toDevice (ver CONNECTION_COLORS en
// NetworkLayoutDetail.jsx) — así el color siempre refleja lo que realmente
// conecta, sin un campo aparte que se pueda desincronizar.
const pointSchema = new mongoose.Schema({
  x: { type: Number, required: true, min: 0, max: 100 },
  y: { type: Number, required: true, min: 0, max: 100 },
}, { _id: false });

const layoutConnectionSchema = new mongoose.Schema({
  layout: { type: mongoose.Schema.Types.ObjectId, ref: 'NetworkLayout', required: true },

  fromDevice: { type: mongoose.Schema.Types.ObjectId, ref: 'LayoutDevice', required: true },
  toDevice:   { type: mongoose.Schema.Types.ObjectId, ref: 'LayoutDevice', required: true },

  path: {
    type: [pointSchema],
    required: true,
    validate: { validator: (p) => Array.isArray(p) && p.length >= 2, message: 'El trazo necesita al menos 2 puntos' },
  },

  notes: { type: String, default: '' },
  createdByName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('LayoutConnection', layoutConnectionSchema);
