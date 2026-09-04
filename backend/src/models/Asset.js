const mongoose = require('mongoose');

const ASSET_TYPES = [
  'laptop', 'escritorio', 'all_in_one',
  'monitor', 'mouse', 'teclado', 'cargador_laptop',
  // linea_telefonica (2026-08-04) — un número puede estar en uso por
  // alguien sin que el aparato físico que trae la SIM sea suyo (pedido
  // explícito del usuario); antes línea y celular vivían forzosamente en
  // el mismo registro, sin forma de asignar solo la línea.
  'celular', 'linea_telefonica', 'tablet', 'cargador_celular',
  'cable', 'consumible', 'kit_perifericos', 'audifonos',
  'impresora', 'escaner', 'herramienta', 'webcam', 'hub_usb',
  'disco_duro', 'adaptador', 'base_laptop',
  // Distinto de "escaner" (escáner de documentos/impresión) — pedido
  // explícito del usuario (2026-09-04) al revisar "Otros" en Accesorios:
  // había 7 lectores de código de barras/QR metidos ahí sin categoría
  // propia, suficiente volumen para justificar una subcategoría.
  'lector_codigos',
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
  // Normalizado a MAYÚSCULAS al guardar — pedido explícito del usuario
  // (2026-09-04): "tengo samsung, SAMSUNG, Samsung y lo toma como
  // diferente". El `set` corre en cualquier asignación (Asset.create,
  // doc.brand = ..., findOneAndUpdate con este doc), así que cubre alta,
  // edición e importación por Excel sin tener que tocar cada ruta.
  brand: { type: String, default: '', set: (v) => (typeof v === 'string' ? v.trim().toUpperCase() : v) },
  model: { type: String, default: '' },
  serialNumber: { type: String, default: '' },
  inventoryTag: { type: String, default: '' },
  status: {
    type: String,
    enum: ['disponible', 'asignado', 'baja'],
    default: 'disponible',
  },
  purchaseDate: { type: Date },
  // Costo de adquisición — pedido explícito del usuario (2026-08-10): todo
  // activo y accesorio debe tener registrado su costo, para poder valuar
  // el inventario en conjunto (ver Assets.jsx/Accessories.jsx).
  cost: { type: Number, default: null },
  stockTotal: { type: Number, default: null },
  // Piezas que integran un lote, cada una con su propia sucursal — pedido
  // explícito del usuario (2026-09-04): las compras siempre entran por
  // Polanco (razón social única, SelectShop MB) y de ahí se van repartiendo
  // pieza por pieza a otras sucursales conforme se asignan — el modelo en
  // conjunto no debe partirse en un documento por sucursal, la sucursal es
  // un dato de cada pieza individual, no del lote completo. `location` (más
  // abajo) queda como la sucursal de compra/default; la ubicación real de
  // cada pieza vive aquí. Solo aplica junto con stockTotal != null;
  // serialNumber se deja vacío en ese caso (la fuente de verdad pasa a ser
  // este arreglo).
  serials: {
    type: [{
      serialNumber: { type: String, required: true },
      location: { type: String, default: '' },
    }],
    default: [],
  },
  // Sucursal de compra (donde entra todo primero, ej. Polanco) — para un
  // lote con `serials` cargado, esto ya NO representa dónde está cada
  // pieza hoy (eso vive en serials[].location); para todo lo demás
  // (activo único, o lote sin trackear serie por pieza) sigue siendo la
  // única fuente de verdad de la ubicación, como siempre.
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

  // Foto del activo o lote — pedido explícito del usuario (2026-09-03) para
  // agilizar el registro de inventario. Mismo patrón que Ticket.attachmentData:
  // el binario se guarda en Mongo, no en disco (no hay filesystem persistente
  // entre despliegues). Se sube/lee aparte (POST/GET /:id/photo) para no
  // pesar el listado general (ver LIST_EXCLUDE_FIELDS en routes/assets.js).
  photoData:     { type: Buffer },
  photoMimeType: { type: String, default: '' },
  photoFileName: { type: String, default: '' },
}, { timestamps: true });

module.exports = mongoose.model('Asset', assetSchema);
