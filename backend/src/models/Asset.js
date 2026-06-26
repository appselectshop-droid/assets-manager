const mongoose = require('mongoose');

const ASSET_TYPES = [
  'laptop', 'escritorio', 'all_in_one',
  'monitor', 'mouse', 'teclado', 'cargador_laptop',
  'celular', 'tablet', 'cargador_celular',
  'cable', 'consumible', 'kit_perifericos', 'audifonos',
  'impresora', 'escaner', 'herramienta', 'webcam', 'hub_usb',
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
  notes: { type: String, default: '' },
  specs: { type: mongoose.Schema.Types.Mixed, default: {} },
  lastModifiedBy: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Asset', assetSchema);
