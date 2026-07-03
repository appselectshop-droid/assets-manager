import { ASSET_TYPE_LABELS } from './assetFields';

/* normaliza string para comparar columnas */
export const norm = (s) =>
  String(s ?? '').toLowerCase().trim()
    .normalize('NFD').replace(/[̀-ͯ]/g, '');

/* convierte valores booleanos del Excel */
export const parseBool = (v) => {
  const s = norm(v);
  return ['si', 'sí', 'yes', '1', 'true', 'x'].includes(s);
};

const TYPE_MAP = {
  'laptop': 'laptop', 'portatil': 'laptop', 'computadora portatil': 'laptop',
  'escritorio': 'escritorio', 'desktop': 'escritorio', 'computadora de escritorio': 'escritorio',
  'all in one': 'all_in_one', 'all-in-one': 'all_in_one', 'aio': 'all_in_one',
  'monitor': 'monitor', 'pantalla': 'monitor',
  'mouse': 'mouse', 'raton': 'mouse',
  'teclado': 'teclado', 'keyboard': 'teclado',
  'cargador laptop': 'cargador_laptop', 'cargador de laptop': 'cargador_laptop',
  'celular': 'celular', 'telefono': 'celular', 'smartphone': 'celular',
  'tablet': 'tablet', 'tableta': 'tablet', 'ipad': 'tablet',
  'cargador celular': 'cargador_celular', 'cargador de celular': 'cargador_celular',
  'disco duro': 'disco_duro', 'ssd': 'disco_duro', 'disco': 'disco_duro',
  'adaptador': 'adaptador', 'adaptador usb': 'adaptador',
  'router': 'router', 'ruteador': 'router',
  'switch': 'switch',
  'camara ip': 'camara_ip', 'camara': 'camara_ip',
  'nvr': 'nvr',
  'poe injector': 'poe_injector', 'inyector poe': 'poe_injector',
  'ups': 'ups', 'no break': 'ups',
  'insumo red': 'insumo_red', 'insumos de red': 'insumo_red',
  'accesorio': 'accesorio', 'otro': 'otro',
};

export const STATUS_MAP = {
  'disponible': 'disponible', 'available': 'disponible', 'libre': 'disponible',
  'asignado': 'asignado', 'assigned': 'asignado', 'en uso': 'asignado',
  'baja': 'baja', 'dado de baja': 'baja', 'obsoleto': 'baja',
};

/* ── helpers comunes ─────────────────────────────── */
const commonCols = {
  'tipo': 'type', 'marca': 'brand', 'modelo': 'model',
  'no serie': 'serialNumber', 'no. serie': 'serialNumber',
  'numero de serie': 'serialNumber', 'serie': 'serialNumber', 'sn': 'serialNumber',
  'etiqueta': 'inventoryTag', 'etiqueta inventario': 'inventoryTag', 'inv': 'inventoryTag',
  'estado': 'status',
  'fecha compra': 'purchaseDate', 'fecha de compra': 'purchaseDate',
  'notas': 'notes', 'observaciones': 'notes',
  'color': 's:color',
};

/* ── CATEGORÍAS ──────────────────────────────────── */
export const IMPORT_CATEGORIES = {
  computo: {
    label: 'Equipo de cómputo',
    icon: '💻',
    category: 'equipo',
    types: ['laptop', 'escritorio', 'all_in_one'],
    typeHint: 'laptop · escritorio · all in one',
    columns: {
      ...commonCols,
      'procesador': 's:processor', 'cpu': 's:processor', 'processor': 's:processor',
      'ram': 's:ram', 'memoria': 's:ram', 'memoria ram': 's:ram',
      'almacenamiento': 's:storage', 'disco': 's:storage', 'hdd': 's:storage', 'ssd': 's:storage',
      'sistema operativo': 's:os', 'so': 's:os', 'os': 's:os',
      'cargador': 's:hasCharger', 'incluye cargador': 's:hasCharger',
      'monitor': 's:hasMonitor', 'incluye monitor': 's:hasMonitor',
      'mouse': 's:hasMouse', 'incluye mouse': 's:hasMouse',
      'teclado': 's:hasKeyboard', 'incluye teclado': 's:hasKeyboard',
      'tamano pantalla': 's:screenSize', 'pantalla': 's:screenSize',
      'propiedad': 's:ownership', 'tipo propiedad': 's:ownership',
      'arrendamiento': 's:ownership', 'propia': 's:ownership',
      'numero de contrato': 's:contractNumber', 'no contrato': 's:contractNumber',
      'no. contrato': 's:contractNumber', 'contrato': 's:contractNumber',
      'anydesk': 's:anydesk', 'anydesk id': 's:anydesk', 'id anydesk': 's:anydesk',
    },
    boolSpecs: ['hasCharger', 'hasMonitor', 'hasMouse', 'hasKeyboard'],
    template: {
      name: 'plantilla_equipo_computo.xlsx',
      headers: [
        'Tipo *', 'Marca', 'Modelo', 'No. Serie', 'Etiqueta', 'Estado', 'Color',
        'Propiedad', 'No. Contrato', 'AnyDesk ID',
        'Procesador', 'RAM', 'Almacenamiento', 'Sistema Operativo',
        'Cargador', 'Monitor', 'Mouse', 'Teclado', 'Fecha Compra', 'Notas',
      ],
      sample: [
        ['laptop', 'Dell', 'Latitude 5540', 'SN123456', 'INV-001', 'disponible', 'Negro',
         'Arrendamiento', 'CONT-2024-001', '123 456 789',
         'Intel Core i7-1255U', '16 GB DDR4', '512 GB SSD', 'Windows 11 Pro',
         'Sí', 'No', 'No', 'No', '2024-01-15', ''],
        ['escritorio', 'HP', 'ProDesk 400 G9', 'SN789012', 'INV-002', 'disponible', 'Negro',
         'Arrendamiento', 'CONT-2024-001', '987 654 321',
         'Intel Core i5-12400', '8 GB DDR4', '1 TB HDD', 'Windows 11 Pro',
         'No', 'Sí', 'Sí', 'Sí', '2024-02-01', ''],
        ['all in one', 'Apple', 'iMac 24"', 'SN345678', 'INV-003', 'disponible', 'Plata',
         'Propia', '', '',
         'Apple M3', '8 GB', '256 GB SSD', 'macOS Sonoma',
         'Sí', 'No', 'Sí', 'Sí', '2024-03-01', ''],
      ],
    },
    previewCols: ['Tipo', 'Marca / Modelo', 'No. Serie', 'Estado', 'Procesador', 'RAM', 'SO'],
    previewExtract: (r) => [
      ASSET_TYPE_LABELS[r.type] || r.type,
      `${r.brand} ${r.model}`,
      r.serialNumber || '—',
      r.status || 'disponible',
      r.specs?.processor || '—',
      r.specs?.ram || '—',
      r.specs?.os || '—',
    ],
  },

  celulares: {
    label: 'Celulares',
    icon: '📱',
    category: 'equipo',
    types: ['celular', 'tablet'],
    typeHint: 'celular · tablet',
    columns: {
      ...commonCols,
      'imei': 's:imei', 'imei 1': 's:imei', 'imei1': 's:imei',
      'imei 2': 's:imei2', 'imei2': 's:imei2',
      'linea': 's:lineNumber', 'numero de linea': 's:lineNumber',
      'no linea': 's:lineNumber', 'numero linea': 's:lineNumber', 'telefono': 's:lineNumber',
      'operadora': 's:carrier', 'carrier': 's:carrier', 'compania': 's:carrier',
      'costo del plan': 's:planCost', 'costo plan': 's:planCost', 'plan': 's:planCost',
      'almacenamiento': 's:storage', 'storage': 's:storage',
      'ram': 's:ram', 'memoria': 's:ram',
      'sistema operativo': 's:os', 'so': 's:os', 'os': 's:os',
      'cargador': 's:hasCharger', 'incluye cargador': 's:hasCharger',
      'sim bloqueada': 's:simLock', 'bloqueado': 's:simLock', 'bloqueada': 's:simLock',
      'tamano pantalla': 's:screenSize', 'pantalla': 's:screenSize',
      'numero de contrato': 's:contractNumber', 'no contrato': 's:contractNumber',
      'no. contrato': 's:contractNumber', 'contrato': 's:contractNumber',
      'razon social': 's:businessName', 'razón social': 's:businessName',
      'empresa': 's:businessName', 'compania': 's:businessName',
      'gmail': 's:gmailAccount', 'correo gmail': 's:gmailAccount',
      'cuenta gmail': 's:gmailAccount', 'google': 's:gmailAccount',
    },
    boolSpecs: ['hasCharger', 'simLock'],
    template: {
      name: 'plantilla_celulares.xlsx',
      headers: [
        'Tipo *', 'Marca', 'Modelo', 'No. Serie', 'Etiqueta', 'Estado', 'Color',
        'No. Contrato', 'Razón Social', 'Correo Gmail',
        'IMEI 1', 'IMEI 2', 'Línea', 'Operadora', 'Costo del Plan',
        'Almacenamiento', 'RAM', 'Sistema Operativo',
        'Cargador', 'SIM Bloqueada', 'Fecha Compra', 'Notas',
      ],
      sample: [
        ['celular', 'Samsung', 'Galaxy S23', 'SN111222', 'INV-010', 'disponible', 'Negro',
         'CONT-2024-010', 'Mi Empresa S.A. de C.V.', 'usuario@gmail.com',
         '123456789012345', '', '55 1234 5678', 'Telcel', '$299/mes',
         '128 GB', '8 GB', 'Android', 'No', 'No', '2024-03-01', ''],
        ['celular', 'Apple', 'iPhone 15 Pro', 'SN333444', 'INV-011', 'disponible', 'Titanio negro',
         'CONT-2024-010', 'Mi Empresa S.A. de C.V.', 'otro@gmail.com',
         '987654321098765', '', '55 9876 5432', 'AT&T', '$499/mes',
         '256 GB', '8 GB', 'iOS', 'No', 'No', '2024-03-15', ''],
        ['tablet', 'Apple', 'iPad Air M2', 'SN555666', 'INV-012', 'disponible', 'Gris espacial',
         '', '', '',
         '', '', '', '', '',
         '256 GB', '8 GB', 'iPadOS', 'Sí', 'No', '2024-04-01', ''],
      ],
    },
    previewCols: ['Tipo', 'Marca / Modelo', 'IMEI 1', 'Línea', 'Operadora', 'Almacenamiento', 'Estado'],
    previewExtract: (r) => [
      ASSET_TYPE_LABELS[r.type] || r.type,
      `${r.brand} ${r.model}`,
      r.specs?.imei || '—',
      r.specs?.lineNumber || '—',
      r.specs?.carrier || '—',
      r.specs?.storage || '—',
      r.status || 'disponible',
    ],
  },

  perifericos: {
    label: 'Periféricos',
    icon: '🖱️',
    category: 'accesorio',
    types: ['monitor', 'mouse', 'teclado', 'cargador_laptop', 'cargador_celular'],
    typeHint: 'monitor · mouse · teclado · cargador laptop · cargador celular',
    columns: {
      ...commonCols,
      'tipo conexion': 's:connectionType', 'tipo de conexion': 's:connectionType', 'conexion': 's:connectionType',
      'pulgadas': 's:screenSize', 'tamano': 's:screenSize', 'tamano pantalla': 's:screenSize',
      'resolucion': 's:resolution',
      'panel': 's:panelType', 'tipo panel': 's:panelType',
      'hz': 's:refreshRate', 'frecuencia': 's:refreshRate', 'frecuencia hz': 's:refreshRate',
      'watts': 's:watts', 'potencia': 's:watts', 'w': 's:watts',
      'conector': 's:connectorType', 'tipo conector': 's:connectorType',
      'compatible con': 's:compatibleModel', 'modelo compatible': 's:compatibleModel',
      'distribucion': 's:layout', 'layout': 's:layout', 'idioma': 's:layout',
      'tipo teclas': 's:keyType', 'teclas': 's:keyType',
    },
    boolSpecs: [],
    template: {
      name: 'plantilla_perifericos.xlsx',
      headers: [
        'Tipo *', 'Marca', 'Modelo', 'No. Serie', 'Etiqueta', 'Estado', 'Color',
        'Tipo Conexión', 'Pulgadas', 'Resolución', 'Tipo Panel', 'Hz',
        'Watts', 'Tipo Conector', 'Compatible con',
        'Distribución', 'Tipo Teclas', 'Fecha Compra', 'Notas',
      ],
      sample: [
        ['monitor', 'LG', '24MP400', 'SN001', 'INV-020', 'disponible', 'Negro',
         'HDMI, VGA', '24', '1920x1080 Full HD', 'IPS', '75',
         '', '', '', '', '', '2024-01-10', ''],
        ['mouse', 'Logitech', 'MX Master 3', 'SN002', 'INV-021', 'disponible', 'Grafito',
         'Bluetooth', '', '', '', '',
         '', '', '', '', '', '2024-01-10', ''],
        ['teclado', 'Logitech', 'MX Keys', 'SN003', 'INV-022', 'disponible', 'Grafito',
         'Bluetooth', '', '', '', '',
         '', '', '', 'Español (LATAM)', 'Membrana', '2024-01-10', ''],
        ['cargador laptop', 'Dell', 'PA-1650', 'SN004', 'INV-023', 'disponible', 'Negro',
         '', '', '', '', '',
         '65', 'Barrel 4.5mm', 'Latitude 5540', '', '', '2024-01-10', ''],
        ['cargador celular', 'Apple', '20W USB-C', 'SN005', 'INV-024', 'disponible', 'Blanco',
         '', '', '', '', '',
         '20', 'USB-C', 'iPhone', '', '', '2024-01-10', ''],
      ],
    },
    previewCols: ['Tipo', 'Marca / Modelo', 'No. Serie', 'Conexión', 'Resolución / Watts', 'Estado'],
    previewExtract: (r) => [
      ASSET_TYPE_LABELS[r.type] || r.type,
      `${r.brand} ${r.model}`,
      r.serialNumber || '—',
      r.specs?.connectionType || r.specs?.connectorType || '—',
      r.specs?.resolution || r.specs?.watts || '—',
      r.status || 'disponible',
    ],
  },

  almacenamiento: {
    label: 'Almacenamiento',
    icon: '💾',
    category: 'accesorio',
    types: ['disco_duro'],
    typeHint: 'disco duro',
    columns: {
      ...commonCols,
      'tipo almacenamiento': 's:storageType', 'hdd o ssd': 's:storageType',
      'capacidad': 's:capacity',
      'interfaz': 's:interfaceType', 'conexion': 's:interfaceType',
      'descripcion': 's:description', 'observaciones': 's:description',
    },
    boolSpecs: [],
    template: {
      name: 'plantilla_almacenamiento.xlsx',
      headers: ['Tipo *', 'Marca', 'Modelo', 'No. Serie', 'Etiqueta', 'Estado', 'Tipo Almacenamiento', 'Capacidad', 'Interfaz', 'Fecha Compra', 'Notas'],
      sample: [
        ['disco duro', 'Seagate', 'Barracuda', 'SN200', 'INV-040', 'disponible', 'HDD', '500 GB', 'SATA', '2024-01-01', ''],
        ['disco duro', 'Sandisk', 'SSD Z400S', 'SN201', 'INV-041', 'disponible', 'SSD', '256 GB', 'SATA III', '2024-01-01', ''],
      ],
    },
    previewCols: ['Tipo', 'Marca / Modelo', 'No. Serie', 'Capacidad', 'Interfaz', 'Estado'],
    previewExtract: (r) => [
      ASSET_TYPE_LABELS[r.type] || r.type,
      `${r.brand} ${r.model}`,
      r.serialNumber || '—',
      r.specs?.capacity || '—',
      r.specs?.interfaceType || '—',
      r.status || 'disponible',
    ],
  },

  adaptadores: {
    label: 'Adaptadores',
    icon: '🔄',
    category: 'accesorio',
    types: ['adaptador'],
    typeHint: 'adaptador',
    columns: {
      ...commonCols,
      'tipo adaptador': 's:adapterType', 'subtipo': 's:adapterType',
      'tipo conexion': 's:connectionType', 'conexion': 's:connectionType',
      'marca compatible': 's:compatibleBrand', 'compatible con': 's:compatibleBrand',
    },
    boolSpecs: [],
    template: {
      name: 'plantilla_adaptadores.xlsx',
      headers: ['Tipo *', 'Tipo Adaptador', 'Marca', 'Modelo', 'No. Serie', 'Etiqueta', 'Estado', 'Color', 'Fecha Compra', 'Notas'],
      sample: [
        ['adaptador', 'USB-C a HDMI', 'StarTech.com', 'Adaptador Multipuerto USB-C', 'SN300', 'INV-050', 'disponible', 'Negro', '2024-01-01', ''],
      ],
    },
    previewCols: ['Tipo', 'Tipo Adaptador', 'Marca / Modelo', 'No. Serie', 'Estado'],
    previewExtract: (r) => [
      ASSET_TYPE_LABELS[r.type] || r.type,
      r.specs?.adapterType || '—',
      `${r.brand} ${r.model}`.trim() || '—',
      r.serialNumber || '—',
      r.status || 'disponible',
    ],
  },

  infraestructura: {
    label: 'Infraestructura',
    icon: '🌐',
    category: 'equipo',
    types: ['router', 'switch', 'camara_ip', 'nvr', 'poe_injector', 'ups', 'insumo_red'],
    typeHint: 'router · switch · camara ip · nvr · poe injector · ups · insumo red',
    columns: {
      ...commonCols,
      'puertos': 's:ports', 'numero de puertos': 's:ports',
      'ip': 's:ipAddress', 'direccion ip': 's:ipAddress',
      'canales': 's:channels', 'numero de canales': 's:channels',
      'capacidad': 's:capacityVA', 'watts': 's:watts', 'potencia': 's:watts',
      'cantidad': 's:quantity',
      'descripcion': 's:description', 'observaciones': 's:description',
    },
    boolSpecs: [],
    template: {
      name: 'plantilla_infraestructura.xlsx',
      headers: ['Tipo *', 'Marca', 'Modelo', 'No. Serie', 'Etiqueta', 'Estado', 'Puertos', 'IP', 'Fecha Compra', 'Notas'],
      sample: [
        ['switch', 'TP-Link', 'TL-SG1008D', 'SN400', 'INV-060', 'disponible', '8', '', '2024-01-01', ''],
        ['router', 'Fiberhome', 'SR1041E', 'SN401', 'INV-061', 'disponible', '4', '192.168.1.1', '2024-01-01', ''],
        ['camara ip', 'Dahua', 'DH-IPC-HFW1431T1N', 'SN402', 'INV-062', 'disponible', '', '192.168.1.50', '2024-01-01', ''],
      ],
    },
    previewCols: ['Tipo', 'Marca / Modelo', 'No. Serie', 'Puertos / IP', 'Estado'],
    previewExtract: (r) => [
      ASSET_TYPE_LABELS[r.type] || r.type,
      `${r.brand} ${r.model}`,
      r.serialNumber || '—',
      r.specs?.ports || r.specs?.ipAddress || '—',
      r.status || 'disponible',
    ],
  },

  accesorios: {
    label: 'Accesorios / Otros',
    icon: '📦',
    category: 'accesorio',
    types: ['accesorio', 'otro'],
    typeHint: 'accesorio · otro',
    columns: {
      ...commonCols,
      'tipo accesorio': 's:accessoryType', 'subtipo': 's:accessoryType', 'accesorio': 's:accessoryType',
      'tipo conexion': 's:connectionType', 'conexion': 's:connectionType',
      'descripcion': 's:description', 'description': 's:description', 'detalle': 's:description',
      'categoria': 's:category', 'categoria activo': 's:category',
    },
    boolSpecs: [],
    template: {
      name: 'plantilla_accesorios.xlsx',
      headers: [
        'Tipo *', 'Tipo Accesorio', 'Marca', 'Modelo', 'No. Serie', 'Etiqueta',
        'Estado', 'Color', 'Tipo Conexión', 'Descripción', 'Fecha Compra', 'Notas',
      ],
      sample: [
        ['accesorio', 'Webcam', 'Logitech', 'C920', 'SN100', 'INV-030',
         'disponible', 'Negro', 'USB', 'Full HD 1080p 30fps', '2024-02-01', ''],
        ['accesorio', 'Audífonos', 'Sony', 'WH-1000XM5', 'SN101', 'INV-031',
         'disponible', 'Negro', 'Bluetooth / 3.5mm', 'Cancelación de ruido activa', '2024-02-01', ''],
        ['accesorio', 'Hub USB', 'Anker', 'A8342', 'SN102', 'INV-032',
         'disponible', 'Gris', 'USB-C', '7 puertos USB-A 3.0', '2024-02-01', ''],
        ['otro', 'Silla', '', 'Ejecutiva', '', 'INV-033',
         'disponible', 'Negro', '', 'Silla ergonómica con apoyabrazos', '2023-12-01', ''],
      ],
    },
    previewCols: ['Tipo', 'Tipo Accesorio', 'Marca / Modelo', 'No. Serie', 'Conexión', 'Estado'],
    previewExtract: (r) => [
      ASSET_TYPE_LABELS[r.type] || r.type,
      r.specs?.accessoryType || '—',
      `${r.brand} ${r.model}`.trim() || '—',
      r.serialNumber || '—',
      r.specs?.connectionType || '—',
      r.status || 'disponible',
    ],
  },
};

/* ── mapear filas crudas a objetos ───────────────── */
export function mapAssetRows(rawRows, category, defaultType = null) {
  if (!rawRows.length) return [];

  return rawRows.map((raw) => {
    // Sin esto, `category` se quedaba en el default del esquema ('equipo') sin
    // importar qué categoría de importación se haya elegido — así se colaron
    // varios accesorios como si fueran equipo de cómputo y viceversa.
    const obj = { specs: {}, category: category.category || 'equipo' };
    let hasData = false;

    for (const [col, val] of Object.entries(raw)) {
      const key = category.columns[norm(col)];
      if (!key || val === '' || val == null) continue;
      hasData = true;

      if (key === 'type') {
        obj.type = TYPE_MAP[norm(val)] || norm(val);
      } else if (key === 'status') {
        obj.status = STATUS_MAP[norm(val)] || 'disponible';
      } else if (key.startsWith('s:')) {
        const specKey = key.slice(2);
        if (category.boolSpecs?.includes(specKey)) {
          obj.specs[specKey] = parseBool(val);
        } else {
          obj.specs[specKey] = String(val).trim();
        }
      } else {
        obj[key] = String(val).trim();
      }
    }

    if (!hasData) return null;

    // Si no se detectó tipo en el Excel, usar el tipo por defecto seleccionado
    if (!obj.type && defaultType) obj.type = defaultType;

    if (!obj.type) {
      obj.__error = 'Falta el tipo de activo';
    } else if (!category.types.includes(obj.type)) {
      obj.__error = `Tipo "${obj.type}" no válido. Usa: ${category.typeHint}`;
    }

    return obj;
  }).filter(Boolean);
}

/* ── mapear filas de empleados ───────────────────── */
const EMP_MAP = {
  'no empleado': 'employeeId', 'num empleado': 'employeeId',
  'numero empleado': 'employeeId', 'numero de empleado': 'employeeId',
  'no. empleado': 'employeeId', 'id empleado': 'employeeId',
  'empleado': 'employeeId', 'clave': 'employeeId', 'clave empleado': 'employeeId',
  'nombre': 'name', 'nombre completo': 'name', 'name': 'name',
  'departamento': 'department', 'depto': 'department', 'area': 'department',
  'puesto': 'position', 'cargo': 'position', 'posicion': 'position',
  'correo': 'email', 'email': 'email', 'correo electronico': 'email',
};

export function mapEmployeeRows(rawRows) {
  return rawRows.map((raw) => {
    const obj = {};
    for (const [col, val] of Object.entries(raw)) {
      const key = EMP_MAP[norm(col)];
      if (key && val !== '' && val != null) obj[key] = String(val).trim();
    }
    if (!obj.employeeId) obj.__error = 'Falta el No. de empleado';
    else if (!obj.name) obj.__error = 'Falta el nombre';
    return obj;
  }).filter((r) => Object.keys(r).length > 0);
}

export const EMPLOYEE_TEMPLATE = {
  name: 'plantilla_empleados.xlsx',
  headers: ['No. Empleado *', 'Nombre *', 'Departamento', 'Puesto', 'Correo'],
  sample: [
    ['EMP001', 'Juan Pérez', 'TI', 'Desarrollador', 'juan@empresa.com'],
    ['EMP002', 'María García', 'RRHH', 'Coordinadora', 'maria@empresa.com'],
  ],
  previewCols: ['No. Empleado', 'Nombre', 'Departamento', 'Puesto', 'Correo'],
  previewExtract: (r) => [r.employeeId, r.name, r.department || '—', r.position || '—', r.email || '—'],
};
