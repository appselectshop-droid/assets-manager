// Herramientas del conector MCP de Assets Manager — TODAS de solo lectura
// (decisión explícita del usuario, 2026-11-23). Ninguna herramienta escribe en
// la base de datos: solo find/countDocuments/aggregate con campos en lista
// blanca. Nunca se exponen contraseñas, firmas, adjuntos binarios, datos
// bancarios de proveedores ni datos personales del comprador de un activo.
//
// Cada herramienta pertenece a un módulo; una llave solo ve las herramientas
// de los módulos que tenga autorizados (ver models/McpKey.js).
const Asset = require('../models/Asset');
const Assignment = require('../models/Assignment');
const AssetBaja = require('../models/AssetBaja');
const Employee = require('../models/Employee');
const Ticket = require('../models/Ticket');
const AccountRequest = require('../models/AccountRequest');
const ResourceRequest = require('../models/ResourceRequest');
const OnboardingRequest = require('../models/OnboardingRequest');
const OffboardingRequest = require('../models/OffboardingRequest');
const PaymentService = require('../models/PaymentService');
const PaymentCycle = require('../models/PaymentCycle');
require('../models/User'); // populate('assignedTo') de Ticket

const MAX = 100;
const lim = (n, def = 25) => Math.min(Math.max(parseInt(n, 10) || def, 1), MAX);
const rx = (s) => new RegExp(String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
const day = (d) => (d ? new Date(d).toISOString().slice(0, 10) : null);

const ASSET_FIELDS = 'category type brand model serialNumber inventoryTag status purchaseDate cost stockTotal location notes specs companyOwned serials.serialNumber serials.location createdAt updatedAt';
const EMP_FIELDS = 'employeeId name businessName office position area department phone corporateEmails active isSharedAccount';
const TICKET_LIST_FIELDS = 'folio employeeName ticketType subject status priority slaCategory assignedTo createdAt resolvedAt resolvedByName escalated blocksWork';

const str = (description) => ({ type: 'string', description });
const num = (description) => ({ type: 'integer', description });

function assetView(a) {
  return {
    id: String(a._id), categoria: a.category, tipo: a.type, marca: a.brand, modelo: a.model,
    serie: a.serialNumber, etiqueta: a.inventoryTag, estado: a.status, ubicacion: a.location,
    costo: a.cost, stockTotal: a.stockTotal, compra: day(a.purchaseDate), propiedadEmpresa: a.companyOwned,
    specs: a.specs, notas: a.notes,
    piezas: (a.serials || []).length ? a.serials.map((s) => ({ serie: s.serialNumber, ubicacion: s.location })) : undefined,
  };
}

const TOOLS = [
  // ───────────── Activos y asignaciones ─────────────
  {
    module: 'activos',
    name: 'buscar_activos',
    description: 'Busca activos de TI (equipos y accesorios) por texto libre (marca, modelo, serie, etiqueta, tipo, ubicación) y filtros. Devuelve también a quién está asignado.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: str('Texto a buscar en marca/modelo/serie/etiqueta/tipo/ubicación'),
        categoria: { type: 'string', enum: ['equipo', 'accesorio'] },
        estado: { type: 'string', enum: ['disponible', 'asignado', 'baja'] },
        limite: num('Máximo de resultados (1-100, default 25)'),
      },
    },
    async run({ texto, categoria, estado, limite }) {
      const q = {};
      if (categoria) q.category = categoria;
      if (estado) q.status = estado;
      if (texto) {
        const r = rx(texto);
        q.$or = [{ brand: r }, { model: r }, { serialNumber: r }, { inventoryTag: r }, { type: r }, { location: r }, { 'serials.serialNumber': r }];
      }
      const [total, assets] = await Promise.all([
        Asset.countDocuments(q),
        Asset.find(q).select(ASSET_FIELDS).sort({ updatedAt: -1 }).limit(lim(limite)).lean(),
      ]);
      const asg = await Assignment.find({ asset: { $in: assets.map((a) => a._id) }, active: true })
        .populate('employee', 'name employeeId').lean();
      const byAsset = new Map();
      asg.forEach((x) => {
        const k = String(x.asset);
        if (!byAsset.has(k)) byAsset.set(k, []);
        byAsset.get(k).push({ empleado: x.employee?.name, noEmpleado: x.employee?.employeeId, desde: day(x.assignedDate), cantidad: x.quantity });
      });
      return { total, mostrando: assets.length, activos: assets.map((a) => ({ ...assetView(a), asignadoA: byAsset.get(String(a._id)) || [] })) };
    },
  },
  {
    module: 'activos',
    name: 'ver_activo',
    description: 'Detalle de un activo (por id, número de serie o etiqueta de inventario) con su historial completo de asignaciones.',
    inputSchema: {
      type: 'object',
      properties: { id: str('Id del activo'), serie: str('Número de serie'), etiqueta: str('Etiqueta de inventario') },
    },
    async run({ id, serie, etiqueta }) {
      let a = null;
      if (id && /^[a-f0-9]{24}$/i.test(id)) a = await Asset.findById(id).select(ASSET_FIELDS).lean();
      else if (serie) a = await Asset.findOne({ $or: [{ serialNumber: rx(serie) }, { 'serials.serialNumber': rx(serie) }] }).select(ASSET_FIELDS).lean();
      else if (etiqueta) a = await Asset.findOne({ inventoryTag: rx(etiqueta) }).select(ASSET_FIELDS).lean();
      if (!a) return { error: 'No se encontró el activo' };
      const hist = await Assignment.find({ asset: a._id }).populate('employee', 'name employeeId').sort({ assignedDate: -1 }).lean();
      return {
        ...assetView(a),
        asignaciones: hist.map((h) => ({
          empleado: h.employee?.name, noEmpleado: h.employee?.employeeId, desde: day(h.assignedDate),
          hasta: day(h.returnDate), activa: h.active, cantidad: h.quantity, series: h.serialNumbers, notas: h.notes,
        })),
      };
    },
  },
  {
    module: 'activos',
    name: 'resumen_inventario',
    description: 'Conteo del inventario por categoría, tipo y estado, con el costo total registrado.',
    inputSchema: { type: 'object', properties: {} },
    async run() {
      const rows = await Asset.aggregate([
        { $group: { _id: { categoria: '$category', tipo: '$type', estado: '$status' }, cantidad: { $sum: 1 }, costo: { $sum: { $ifNull: ['$cost', 0] } } } },
        { $sort: { '_id.categoria': 1, '_id.tipo': 1, '_id.estado': 1 } },
      ]);
      return { filas: rows.map((r) => ({ ...r._id, cantidad: r.cantidad, costoTotal: r.costo })) };
    },
  },
  {
    module: 'activos',
    name: 'bajas_de_activos',
    description: 'Activos dados de baja (venta, donación, desecho): motivo, condición, monto y fecha.',
    inputSchema: { type: 'object', properties: { desde: str('Fecha inicial YYYY-MM-DD'), limite: num('Máximo (1-100)') } },
    async run({ desde, limite }) {
      const q = desde ? { createdAt: { $gte: new Date(desde) } } : {};
      const rows = await AssetBaja.find(q)
        .select('folio assetSnapshot condition reason reasonOther buyerType buyerName saleAmount paymentMethod paymentDate deliveredByName createdByName createdAt')
        .sort({ createdAt: -1 }).limit(lim(limite)).lean();
      return {
        bajas: rows.map((b) => ({
          folio: b.folio, fecha: day(b.createdAt), activo: b.assetSnapshot && {
            tipo: b.assetSnapshot.type, marca: b.assetSnapshot.brand, modelo: b.assetSnapshot.model, serie: b.assetSnapshot.serialNumber,
          },
          condicion: b.condition, motivo: b.reasonOther ? `${b.reason}: ${b.reasonOther}` : b.reason,
          tipoComprador: b.buyerType, comprador: b.buyerName, monto: b.saleAmount,
          metodoPago: b.paymentMethod, fechaPago: day(b.paymentDate), registro: b.createdByName,
        })),
      };
    },
  },

  // ───────────── Empleados ─────────────
  {
    module: 'empleados',
    name: 'buscar_empleados',
    description: 'Busca empleados por nombre, número de empleado, puesto, área, sucursal o correo.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: str('Texto a buscar'),
        activos: { type: 'boolean', description: 'true = solo activos (default), false = solo dados de baja' },
        limite: num('Máximo (1-100, default 25)'),
      },
    },
    async run({ texto, activos = true, limite }) {
      const q = { active: activos !== false };
      if (texto) {
        const r = rx(texto);
        q.$or = [{ name: r }, { employeeId: r }, { position: r }, { area: r }, { department: r }, { office: r }, { corporateEmails: r }, { businessName: r }];
      }
      const [total, rows] = await Promise.all([
        Employee.countDocuments(q),
        Employee.find(q).select(EMP_FIELDS).sort({ name: 1 }).limit(lim(limite)).lean(),
      ]);
      return { total, empleados: rows.map(({ _id, ...e }) => ({ id: String(_id), ...e })) };
    },
  },
  {
    module: 'empleados',
    name: 'ver_empleado',
    description: 'Ficha de un empleado (por id, número de empleado o nombre exacto). Si la llave también tiene el módulo de activos, incluye el equipo que tiene asignado.',
    inputSchema: { type: 'object', properties: { id: str('Id'), noEmpleado: str('Número de empleado'), nombre: str('Nombre') } },
    async run({ id, noEmpleado, nombre }, ctx) {
      let e = null;
      if (id && /^[a-f0-9]{24}$/i.test(id)) e = await Employee.findById(id).select(EMP_FIELDS).lean();
      else if (noEmpleado) e = await Employee.findOne({ employeeId: noEmpleado }).select(EMP_FIELDS).lean();
      else if (nombre) e = await Employee.findOne({ name: rx(nombre) }).select(EMP_FIELDS).lean();
      if (!e) return { error: 'No se encontró el empleado' };
      const out = { id: String(e._id), ...e, _id: undefined };
      if (ctx.modules.includes('activos')) {
        const asg = await Assignment.find({ employee: e._id, active: true }).populate('asset', ASSET_FIELDS).lean();
        out.equipoAsignado = asg.filter((x) => x.asset).map((x) => ({ ...assetView(x.asset), desde: day(x.assignedDate), cantidad: x.quantity }));
      }
      return out;
    },
  },

  // ───────────── Tickets y solicitudes ─────────────
  {
    module: 'tickets',
    name: 'buscar_tickets',
    description: 'Busca tickets de Mesa de Ayuda por texto (folio, asunto, empleado, descripción), estado, tipo, prioridad y rango de fechas.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: str('Texto a buscar'),
        estado: { type: 'string', enum: ['abierto', 'en_proceso', 'resuelto', 'cerrado'] },
        prioridad: { type: 'string', enum: ['baja', 'media', 'alta', 'critica'] },
        tipo: str('ticketType, ej. hardware_pc, software_pc, red_pc, impresora, cuenta_acceso, erp, soporte_bi'),
        desde: str('Creados desde YYYY-MM-DD'),
        hasta: str('Creados hasta YYYY-MM-DD'),
        limite: num('Máximo (1-100, default 25)'),
      },
    },
    async run({ texto, estado, prioridad, tipo, desde, hasta, limite }) {
      const q = {};
      if (estado) q.status = estado;
      if (prioridad) q.priority = prioridad;
      if (tipo) q.ticketType = tipo;
      if (desde || hasta) q.createdAt = { ...(desde && { $gte: new Date(desde) }), ...(hasta && { $lte: new Date(`${hasta}T23:59:59`) }) };
      if (texto) { const r = rx(texto); q.$or = [{ folio: r }, { subject: r }, { employeeName: r }, { description: r }]; }
      const [total, rows] = await Promise.all([
        Ticket.countDocuments(q),
        Ticket.find(q).select(TICKET_LIST_FIELDS).populate('assignedTo', 'name').sort({ createdAt: -1 }).limit(lim(limite)).lean(),
      ]);
      return {
        total,
        tickets: rows.map((t) => ({
          folio: t.folio, empleado: t.employeeName, tipo: t.ticketType, asunto: t.subject, estado: t.status, prioridad: t.priority,
          categoriaSla: t.slaCategory, asignadoA: t.assignedTo?.name, creado: t.createdAt, resuelto: t.resolvedAt,
          resolvio: t.resolvedByName, escalado: t.escalated, bloqueaTrabajo: t.blocksWork,
        })),
      };
    },
  },
  {
    module: 'tickets',
    name: 'ver_ticket',
    description: 'Detalle de un ticket por folio: descripción, estado, SLA, resolución y la conversación con el empleado (solo texto, sin adjuntos).',
    inputSchema: { type: 'object', properties: { folio: str('Folio del ticket') }, required: ['folio'] },
    async run({ folio }) {
      const t = await Ticket.findOne({ folio: rx(`${folio}`) })
        .select(`${TICKET_LIST_FIELDS} description otherTypeDetail erpSystem responseDueAt resolutionDueAt resolution resolutionNotes satisfactionRating escalationType escalatedToArea escalationReason messages.from messages.authorName messages.text messages.createdAt messages.deleted`)
        .populate('assignedTo', 'name').lean();
      if (!t) return { error: 'No se encontró el ticket' };
      return {
        folio: t.folio, empleado: t.employeeName, tipo: t.ticketType, detalleTipo: t.otherTypeDetail, erp: t.erpSystem,
        asunto: t.subject, descripcion: t.description, estado: t.status, prioridad: t.priority, categoriaSla: t.slaCategory,
        asignadoA: t.assignedTo?.name, creado: t.createdAt, venceRespuesta: t.responseDueAt, venceResolucion: t.resolutionDueAt,
        resuelto: t.resolvedAt, resolvio: t.resolvedByName, resolucion: t.resolution, notasResolucion: t.resolutionNotes,
        calificacion: t.satisfactionRating, escalado: t.escalated && { tipo: t.escalationType, area: t.escalatedToArea, motivo: t.escalationReason },
        conversacion: (t.messages || []).filter((m) => !m.deleted && m.text).map((m) => ({ de: m.from, autor: m.authorName, texto: m.text, fecha: m.createdAt })),
      };
    },
  },
  {
    module: 'tickets',
    name: 'resumen_tickets',
    description: 'Conteo de tickets por estado y por tipo en un rango de fechas (default: últimos 30 días).',
    inputSchema: { type: 'object', properties: { desde: str('YYYY-MM-DD'), hasta: str('YYYY-MM-DD') } },
    async run({ desde, hasta }) {
      const from = desde ? new Date(desde) : new Date(Date.now() - 30 * 864e5);
      const to = hasta ? new Date(`${hasta}T23:59:59`) : new Date();
      const match = { createdAt: { $gte: from, $lte: to } };
      const [porEstado, porTipo, abiertosTotal] = await Promise.all([
        Ticket.aggregate([{ $match: match }, { $group: { _id: '$status', n: { $sum: 1 } } }]),
        Ticket.aggregate([{ $match: match }, { $group: { _id: '$ticketType', n: { $sum: 1 } } }, { $sort: { n: -1 } }]),
        Ticket.countDocuments({ status: { $in: ['abierto', 'en_proceso'] } }),
      ]);
      return {
        rango: { desde: day(from), hasta: day(to) },
        porEstado: Object.fromEntries(porEstado.map((r) => [r._id, r.n])),
        porTipo: Object.fromEntries(porTipo.map((r) => [r._id, r.n])),
        abiertosHoyEnTotal: abiertosTotal,
      };
    },
  },
  {
    module: 'tickets',
    name: 'solicitudes',
    description: 'Solicitudes de Mesa de Ayuda: cuentas/licencias, recursos (equipo/accesorios), ingresos de personal y bajas de personal. Por default solo las pendientes.',
    inputSchema: {
      type: 'object',
      properties: {
        tipo: { type: 'string', enum: ['cuentas', 'recursos', 'ingresos', 'bajas', 'todas'], description: 'default todas' },
        estado: str('Estado a filtrar (default pendiente; "todas" para cualquiera)'),
        limite: num('Máximo por tipo (1-100, default 25)'),
      },
    },
    async run({ tipo = 'todas', estado = 'pendiente', limite }) {
      const st = estado === 'todas' ? {} : { status: estado };
      const L = lim(limite);
      const want = (t) => tipo === 'todas' || tipo === t;
      const out = {};
      if (want('cuentas')) {
        out.cuentas = (await AccountRequest.find(st).select('requestType employeeName platform username licenses erpSystems status reason createdAt reviewedByName').sort({ createdAt: -1 }).limit(L).lean())
          .map((r) => ({ id: String(r._id), tipo: r.requestType, empleado: r.employeeName, plataforma: r.platform, usuario: r.username, estado: r.status, motivo: r.reason, fecha: day(r.createdAt), reviso: r.reviewedByName }));
      }
      if (want('recursos')) {
        out.recursos = (await ResourceRequest.find(st).select('employeeName department resourceItems licenseDetail otherDetail justification status createdAt reviewedByName').sort({ createdAt: -1 }).limit(L).lean())
          .map((r) => ({ id: String(r._id), empleado: r.employeeName, area: r.department, articulos: r.resourceItems, licencia: r.licenseDetail, otro: r.otherDetail, justificacion: r.justification, estado: r.status, fecha: day(r.createdAt), reviso: r.reviewedByName }));
      }
      if (want('ingresos')) {
        out.ingresos = (await OnboardingRequest.find(st).select('employeeName position department area office startDate needsEmail needsComputer needsPhone status createdAt requestedByName').sort({ createdAt: -1 }).limit(L).lean())
          .map((r) => ({ id: String(r._id), empleado: r.employeeName, puesto: r.position, area: r.area || r.department, sucursal: r.office, ingreso: day(r.startDate), correo: r.needsEmail, computadora: r.needsComputer, celular: r.needsPhone, estado: r.status, fecha: day(r.createdAt), solicito: r.requestedByName }));
      }
      if (want('bajas')) {
        out.bajas = (await OffboardingRequest.find(st).select('employeeName employeePosition employeeArea employeeOffice reasons bajaDate status createdAt requestedByName').sort({ createdAt: -1 }).limit(L).lean())
          .map((r) => ({ id: String(r._id), empleado: r.employeeName, puesto: r.employeePosition, area: r.employeeArea, sucursal: r.employeeOffice, motivos: r.reasons, fechaBaja: day(r.bajaDate), estado: r.status, fecha: day(r.createdAt), solicito: r.requestedByName }));
      }
      return out;
    },
  },

  // ───────────── Pagos recurrentes ─────────────
  {
    module: 'pagos',
    name: 'pagos_catalogo',
    description: 'Catálogo de pagos recurrentes de TI (servicios por CxP y cargos a tarjeta): proveedor, cuenta, motivo, monto estimado, frecuencia y día de vencimiento.',
    inputSchema: {
      type: 'object',
      properties: {
        texto: str('Proveedor, cuenta o motivo'),
        metodo: { type: 'string', enum: ['cxp', 'tarjeta'] },
        incluirInactivos: { type: 'boolean' },
      },
    },
    async run({ texto, metodo, incluirInactivos }) {
      const q = incluirInactivos ? {} : { activo: { $ne: false } };
      if (metodo === 'tarjeta') q.metodo = 'tarjeta';
      if (metodo === 'cxp') q.metodo = { $ne: 'tarjeta' };
      if (texto) { const r = rx(texto); q.$or = [{ proveedor: r }, { cuenta: r }, { motivo: r }]; }
      const rows = await PaymentService.find(q).select('proveedor cuenta motivo compania sucursal centroCostos montoEstimado moneda frecuencia diaVencimiento mesVencimiento metodo activo').sort({ proveedor: 1 }).limit(300).lean();
      return { total: rows.length, servicios: rows.map(({ _id, ...s }) => ({ id: String(_id), ...s, metodo: s.metodo || 'cxp' })) };
    },
  },
  {
    module: 'pagos',
    name: 'pagos_vencimientos',
    description: 'Pagos (ciclos) por rango de fecha límite: estado (pendiente, factura_recibida, metido, pagado, omitido), folio de CxP, monto real y facturas adjuntas. Default: de hoy a 30 días.',
    inputSchema: {
      type: 'object',
      properties: {
        desde: str('Fecha límite desde YYYY-MM-DD'),
        hasta: str('Fecha límite hasta YYYY-MM-DD'),
        estado: str('Filtrar por estado'),
        texto: str('Proveedor, cuenta o motivo'),
        metodo: { type: 'string', enum: ['cxp', 'tarjeta'] },
      },
    },
    async run({ desde, hasta, estado, texto, metodo }) {
      const today = new Date().toISOString().slice(0, 10);
      const from = desde || today;
      const to = hasta || new Date(Date.now() + 30 * 864e5).toISOString().slice(0, 10);
      const sq = {};
      if (metodo === 'tarjeta') sq.metodo = 'tarjeta';
      if (metodo === 'cxp') sq.metodo = { $ne: 'tarjeta' };
      if (texto) { const r = rx(texto); sq.$or = [{ proveedor: r }, { cuenta: r }, { motivo: r }]; }
      const q = { fechaLimite: { $gte: from, $lte: to } };
      if (estado) q.estado = estado;
      if (Object.keys(sq).length) q.service = { $in: (await PaymentService.find(sq).select('_id').lean()).map((s) => s._id) };
      const rows = await PaymentCycle.find(q)
        .select('service periodo fechaLimite fechaMeter fechaPago semana estado folioCxp montoReal notas facturas.filename facturas.cfdi.total facturas.cfdi.folio archivosCxp.filename')
        .populate('service', 'proveedor cuenta motivo montoEstimado moneda metodo')
        .sort({ fechaLimite: 1 }).limit(300).lean();
      return {
        rango: { desde: from, hasta: to },
        total: rows.length,
        pagos: rows.filter((c) => c.service).map((c) => ({
          id: String(c._id), proveedor: c.service.proveedor, cuenta: c.service.cuenta, motivo: c.service.motivo,
          metodo: c.service.metodo || 'cxp', periodo: c.periodo, fechaLimite: c.fechaLimite, fechaMeter: c.fechaMeter,
          fechaPago: c.fechaPago, semana: c.semana, estado: c.estado, folioCxp: c.folioCxp,
          montoEstimado: c.service.montoEstimado, montoReal: c.montoReal, moneda: c.service.moneda, notas: c.notas,
          facturas: (c.facturas || []).map((f) => ({ archivo: f.filename, folio: f.cfdi?.folio, total: f.cfdi?.total })),
          archivosCxp: (c.archivosCxp || []).map((f) => f.filename),
        })),
      };
    },
  },
];

module.exports = { TOOLS };
