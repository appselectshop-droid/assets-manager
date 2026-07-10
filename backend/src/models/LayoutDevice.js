const mongoose = require('mongoose');

// Un "pin" colocado sobre un NetworkLayout — representa una cámara/NVR/AP/
// switch/router físico y dónde está en el plano. A propósito NO obliga a
// que ya exista como Activo real: Infra normalmente ya tiene su propio
// inventario de IP/MAC/serie de cámaras que aún no ha dado de alta como
// Activo (ej. porque no tiene acceso al NVR todavía) — así que `assetRef`
// es opcional; si se liga, es solo para referencia cruzada, los datos
// (IP/MAC/serie) siempre se guardan aquí mismo para no depender de que el
// Activo exista o esté actualizado.
const DEVICE_TYPES = ['camara_ip', 'nvr', 'poe_injector', 'router', 'switch', 'access_point', 'otro'];
const DEVICE_TYPE_LABELS = {
  camara_ip: 'Cámara IP', nvr: 'NVR', poe_injector: 'Inyector PoE',
  router: 'Router', switch: 'Switch', access_point: 'Access Point (AP)', otro: 'Otro',
};

const layoutDeviceSchema = new mongoose.Schema({
  layout: { type: mongoose.Schema.Types.ObjectId, ref: 'NetworkLayout', required: true },

  // Posición en PORCENTAJE (0-100) sobre la imagen, no en píxeles — así el
  // pin queda en el mismo lugar relativo sin importar a qué tamaño se
  // muestre el plano (celular, monitor grande, etc.).
  x: { type: Number, required: true, min: 0, max: 100 },
  y: { type: Number, required: true, min: 0, max: 100 },

  deviceType: { type: String, enum: DEVICE_TYPES, required: true },
  label:      { type: String, default: '' }, // ej. "Cámara Entrada Principal"

  assetRef: { type: mongoose.Schema.Types.ObjectId, ref: 'Asset' }, // opcional

  ipAddress:    { type: String, default: '' },
  macAddress:   { type: String, default: '' },
  serialNumber: { type: String, default: '' },

  status: { type: String, enum: ['activo', 'inactivo', 'mantenimiento'], default: 'activo' },
  notes:  { type: String, default: '' },
}, { timestamps: true });

const LayoutDevice = mongoose.model('LayoutDevice', layoutDeviceSchema);
LayoutDevice.DEVICE_TYPES = DEVICE_TYPES;
LayoutDevice.DEVICE_TYPE_LABELS = DEVICE_TYPE_LABELS;

module.exports = LayoutDevice;
