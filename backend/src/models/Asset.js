const mongoose = require('mongoose');

const ASSET_TYPES = [
  'laptop', 'escritorio', 'all_in_one',
  'monitor', 'mouse', 'teclado', 'cargador_laptop',
  'celular', 'tablet', 'cargador_celular',
  'cable', 'consumible', 'kit_perifericos', 'audifonos',
  'impresora', 'escaner', 'herramienta', 'webcam', 'hub_usb',
  'disco_duro', 'adaptador', 'base_laptop',
  'router', 'switch', 'access_point', 'camara_ip', 'nvr', 'poe_injector', 'ups', 'insumo_red',
  // Equipo especial de ciertas sucursales (ej. tienda "Fantástico") — pedido
  // explícito de la junta de Finanzas del 10 jul, no encajaban en ningún tipo
  // existente (a diferencia de "escaner", que es de oficina/impresión).
  'microscopio', 'equipo_fiscal', 'escaner_diagnostico',
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

  // Equipo que el empleado trae por su cuenta (ej. herramienta que compró un
  // técnico) — se registra para que quede en el resguardo del área, pero sin
  // contar como activo propio en los conteos de inventario (ver Indicadores).
  companyOwned: { type: Boolean, default: true },

  // Equipos de telemetría con acceso hoy concentrado en una sola persona —
  // marcarlo aquí oculta el activo de los listados generales para quien no
  // tenga el permiso `canViewTelemetryAssets` (ver User.js y routes/assets.js).
  // La carta de confidencialidad firmada es un proceso de RH/legal fuera del
  // sistema; esto solo aplica el gate técnico.
  isTelemetry: { type: Boolean, default: false },
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
