const mongoose = require('mongoose');

const ASSET_TYPES = [
  'laptop', 'escritorio', 'all_in_one',
  'monitor', 'mouse', 'teclado', 'cargador_laptop',
  'celular', 'tablet', 'cargador_celular',
  'cable', 'consumible', 'kit_perifericos', 'audifonos',
  'impresora', 'escaner', 'herramienta', 'webcam', 'hub_usb',
  'disco_duro', 'adaptador', 'base_laptop',
  'router', 'switch', 'access_point', 'camara_ip', 'nvr', 'poe_injector', 'ups', 'insumo_red',
  'accesorio', 'otro',
];

const assetSchema = new mongoose.Schema({
  category: { type: String, enum: ['equipo', 'accesorio'], default: 'equipo' },
  type: { type: String, enum: ASSET_TYPES, required: true },
  brand: { type: String, default: '' },
  model: { type: String, default: '' },
  serialNumber: { type: String, default: '' },
  inventoryTag: { type: String, default: '' },
  status: {
    type: String,
    enum: ['disponible', 'asignado', 'baja'],
    default: 'disponible',
  },
  purchaseDate: { type: Date },
  stockTotal: { type: Number, default: null },
  location: { type: String, default: '' },
  notes: { type: String, default: '' },
  specs: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastModifiedBy: { type: String, default: '' },
  // Se llena cuando el activo queda disponible por dar de baja al empleado que
  // lo tenía (ver PUT /employees/:id) — para poder verlo aparte en Disponibilidad
  // en vez de mezclado con el stock normal. Se limpia al volver a asignarse.
  freedFromEmployee: {
    type: {
      name: String,
      position: String,
      office: String,
      date: Date,
    },
    default: undefined,
  },
}, { timestamps: true });

module.exports = mongoose.model('Asset', assetSchema);
