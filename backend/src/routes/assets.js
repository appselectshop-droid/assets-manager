const router = require('express').Router();
const multer = require('multer');
const Asset = require('../models/Asset');
const Assignment = require('../models/Assignment');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

const SERIAL_CHECK_TYPES = ['laptop', 'escritorio', 'all_in_one', 'celular', 'tablet'];
// linea_telefonica (2026-08-04) no entra a SERIAL_CHECK_TYPES — no tiene
// número de serie, solo línea — pero sí a PHONE_TYPES para que su
// lineNumber se revise contra duplicados junto con celular/tablet.
const PHONE_TYPES = ['celular', 'linea_telefonica', 'tablet'];

// La foto no se necesita en ningún listado — mismo criterio que
// LIST_EXCLUDE_FIELDS en tickets.js (ahí la misma exclusión bajó una query de
// 58s a 1.1s): el frontend solo usa photoMimeType/photoFileName para saber si
// hay foto que mostrar, y pide el binario aparte con GET /:id/photo.
const LIST_EXCLUDE_FIELDS = '-photoData';

const ALLOWED_PHOTO_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB — de sobra para una foto de celular
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_PHOTO_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan imágenes JPG, PNG, HEIC o WEBP'));
    }
    cb(null, true);
  },
});

router.get('/', auth, async (req, res) => {
  try {
    const { status, type } = req.query;
    const filter = {};
    if (status) filter.status = status;
    if (type) filter.type = type;
    // Equipos de telemetría marcados como sensibles no aparecen en el
    // listado general de nadie que no tenga el permiso explícito — ni
    // siquiera el rol admin lo trae implícito (ver User.canViewTelemetryAssets).
    if (!req.user.canViewTelemetryAssets) filter.isTelemetry = { $ne: true };
    const assets = await Asset.find(filter).select(LIST_EXCLUDE_FIELDS).sort({ createdAt: -1 });
    res.json(assets);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { serialNumber, type, specs } = req.body;
    if (serialNumber && serialNumber.trim() && SERIAL_CHECK_TYPES.includes(type)) {
      const existing = await Asset.findOne({ serialNumber: serialNumber.trim(), type: { $in: SERIAL_CHECK_TYPES } });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de serie "${serialNumber.trim()}" (${existing.brand} ${existing.model}).`,
        });
      }
    }
    if (PHONE_TYPES.includes(type) && specs?.lineNumber?.trim()) {
      const ln = specs.lineNumber.trim();
      const existing = await Asset.findOne({ type: { $in: PHONE_TYPES }, 'specs.lineNumber': ln });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de línea "${ln}" (${existing.brand} ${existing.model}).`,
        });
      }
    }
    const asset = await Asset.create({ ...req.body, lastModifiedBy: req.user.name });
    const name = `${asset.brand} ${asset.model}`.trim() || asset.type;
    logAction(req.user, 'crear', 'activo', asset._id, name, `Registró ${name}`);
    res.status(201).json(asset);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Alta rápida en modo "único por número de serie" cuando son varias unidades
// del mismo tipo/modelo — pedido explícito del usuario (2026-09-03): evitar
// registrar un activo a la vez cuando llegan N unidades idénticas. El
// frontend arma un array `serialNumbers` (tabla alimentada por lector de
// código de barras) y aquí se crea UN Asset real por cada serie, porque cada
// serie sí es un activo físico distinto — a diferencia del modo "por
// cantidad/lote", que es un solo registro con stockTotal.
router.post('/batch', auth, async (req, res) => {
  try {
    const { serialNumbers, type, specs, ...common } = req.body;
    const serials = Array.isArray(serialNumbers)
      ? [...new Set(serialNumbers.map((s) => String(s).trim()).filter(Boolean))]
      : [];
    if (serials.length === 0) {
      return res.status(400).json({ message: 'No se recibió ningún número de serie.' });
    }

    if (SERIAL_CHECK_TYPES.includes(type)) {
      const existing = await Asset.find({ serialNumber: { $in: serials }, type: { $in: SERIAL_CHECK_TYPES } });
      if (existing.length > 0) {
        const list = existing.map((a) => a.serialNumber).join(', ');
        return res.status(409).json({ message: `Ya existen activos con estos números de serie: ${list}` });
      }
    }

    const created = [];
    for (const serialNumber of serials) {
      const asset = await Asset.create({ ...common, type, specs, serialNumber, lastModifiedBy: req.user.name });
      created.push(asset);
      const name = `${asset.brand} ${asset.model}`.trim() || asset.type;
      logAction(req.user, 'crear', 'activo', asset._id, name, `Registró ${name} (alta por lote de series, ${serials.length} unidad${serials.length !== 1 ? 'es' : ''})`);
    }

    res.status(201).json(created);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id', auth, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id).select(LIST_EXCLUDE_FIELDS);
    if (!asset || (asset.isTelemetry && !req.user.canViewTelemetryAssets)) {
      return res.status(404).json({ message: 'No encontrado' });
    }
    res.json(asset);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { serialNumber, type, specs } = req.body;

    const asset = await Asset.findById(req.params.id).select(LIST_EXCLUDE_FIELDS);
    if (!asset || (asset.isTelemetry && !req.user.canViewTelemetryAssets)) {
      return res.status(404).json({ message: 'Activo no encontrado' });
    }

    // Only block on duplicate serial if the serial number actually changed
    if (serialNumber && serialNumber.trim() && SERIAL_CHECK_TYPES.includes(type)
        && serialNumber.trim() !== asset.serialNumber) {
      const existing = await Asset.findOne({ serialNumber: serialNumber.trim(), type: { $in: SERIAL_CHECK_TYPES }, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de serie "${serialNumber.trim()}" (${existing.brand} ${existing.model}).`,
        });
      }
    }
    // Only block on duplicate line number if the line number actually changed
    if (PHONE_TYPES.includes(type) && specs?.lineNumber?.trim()
        && specs.lineNumber.trim() !== asset.specs?.lineNumber) {
      const ln = specs.lineNumber.trim();
      const existing = await Asset.findOne({ type: { $in: PHONE_TYPES }, 'specs.lineNumber': ln, _id: { $ne: req.params.id } });
      if (existing) {
        return res.status(409).json({
          message: `Ya existe un activo con el número de línea "${ln}" (${existing.brand} ${existing.model}).`,
        });
      }
    }

    asset.category       = req.body.category     ?? asset.category;
    asset.type           = req.body.type         ?? asset.type;
    asset.brand          = req.body.brand        ?? asset.brand;
    asset.model          = req.body.model        ?? asset.model;
    asset.serialNumber   = req.body.serialNumber ?? asset.serialNumber;
    asset.inventoryTag   = req.body.inventoryTag ?? asset.inventoryTag;
    asset.status         = req.body.status       ?? asset.status;
    asset.notes          = req.body.notes        ?? asset.notes;
    // Solo se limpia la etiqueta de "liberado por baja de personal" si de
    // verdad existe una asignación activa a un empleado nuevo — no basta con
    // que alguien haya cambiado el campo "Estado" a mano sin asignarlo a
    // nadie (eso no es una reasignación real, y borrar el dato ahí perdería
    // el origen sin ganar nada).
    if (asset.freedFromEmployee) {
      const hasActiveAssignment = await Assignment.exists({ asset: asset._id, active: true });
      if (hasActiveAssignment) {
        asset.freedFromEmployee = undefined;
      }
    }
    asset.cost           = req.body.cost !== undefined ? (req.body.cost || null) : asset.cost;
    asset.stockTotal     = req.body.stockTotal !== undefined ? (req.body.stockTotal || null) : asset.stockTotal;
    // Lista de series dentro de un lote — pedido explícito del usuario
    // (2026-09-04), al consolidar accesorios que se habían dado de alta uno
    // por uno con la misma marca/modelo en vez de como un solo registro con
    // cantidad. Solo se toca si el body de verdad manda el campo.
    if (req.body.serials !== undefined) {
      asset.serials = Array.isArray(req.body.serials) ? req.body.serials : asset.serials;
    }
    asset.location       = req.body.location     ?? asset.location;
    asset.purchaseDate   = req.body.purchaseDate !== undefined ? (req.body.purchaseDate || null) : asset.purchaseDate;
    asset.lastModifiedBy = req.user.name;

    if (req.body.specs !== undefined) {
      asset.specs = req.body.specs;
      asset.markModified('specs');
    }

    await asset.save({ validateBeforeSave: false });

    const name = `${asset.brand} ${asset.model}`.trim() || asset.type;
    logAction(req.user, 'editar', 'activo', asset._id, name, `Editó ${name}`);

    res.json(asset);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Separar la línea telefónica de un celular que la trae embebida en el
// mismo registro (formato viejo, de antes de que existiera el tipo
// linea_telefonica) — pedido explícito del usuario (2026-08-10): poder
// asignar el aparato y la línea a personas distintas sin depender de un
// ajuste manual en la base de datos cada vez que se libera un celular así
// (mismo molde que la separación manual ya hecha para el Honor de Mario
// Villegas el 2026-08-04, pero como acción repetible desde la UI).
router.put('/:id/split-line', auth, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id).select(LIST_EXCLUDE_FIELDS);
    if (!asset || (asset.isTelemetry && !req.user.canViewTelemetryAssets)) {
      return res.status(404).json({ message: 'Activo no encontrado' });
    }
    if (asset.type !== 'celular') {
      return res.status(400).json({ message: 'Solo aplica a celulares.' });
    }
    if (asset.status !== 'disponible') {
      return res.status(400).json({ message: 'Solo se puede separar la línea de un equipo disponible (no asignado).' });
    }
    const lineNumber = asset.specs?.lineNumber?.trim();
    if (!lineNumber) {
      return res.status(400).json({ message: 'Este equipo no tiene número de línea registrado.' });
    }

    const name = `${asset.brand} ${asset.model}`.trim() || asset.type;

    const lineAsset = await Asset.create({
      category: 'equipo',
      type: 'linea_telefonica',
      status: 'disponible',
      location: asset.location,
      notes: `Separada del ${name} (serie ${asset.serialNumber || 's/n'}) al separar línea y aparato.`,
      specs: {
        contractNumber: asset.specs?.contractNumber || '',
        businessName: asset.specs?.businessName || '',
        gmailAccount: asset.specs?.gmailAccount || '',
        lineNumber,
        carrier: asset.specs?.carrier || '',
        planCost: asset.specs?.planCost || '',
        simLock: asset.specs?.simLock || false,
      },
      freedFromEmployee: asset.freedFromEmployee,
      companyOwned: asset.companyOwned,
      isTelemetry: false,
      lastModifiedBy: req.user.name,
    });

    // Solo se limpian los campos propios de la línea — contractNumber,
    // businessName y gmailAccount se conservan también en el aparato (no
    // son exclusivos de uno u otro, ver mismo criterio en el Honor de Mario).
    asset.specs.lineNumber = '';
    asset.specs.carrier = '';
    asset.specs.planCost = '';
    asset.markModified('specs');
    asset.lastModifiedBy = req.user.name;
    await asset.save({ validateBeforeSave: false });

    logAction(req.user, 'editar', 'activo', asset._id, name, `Separó la línea ${lineNumber} del aparato ${name}`);
    logAction(req.user, 'crear', 'activo', lineAsset._id, `Línea ${lineNumber}`, `Línea separada de ${name}`);

    res.json({ asset, lineAsset });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Transferir entre sucursales sin eliminar y volver a dar de alta — pedido
// explícito del usuario (2026-09-03). Activo único: solo mueve `location`.
// Lote (stockTotal != null) con transferencia parcial: se "parte" el
// registro — resta del origen y crea (o suma a uno ya existente) un gemelo
// en la sucursal destino, mismo criterio que split-line (un activo puede
// convertirse en dos registros sin perder historial).
router.put('/:id/transfer', auth, async (req, res) => {
  try {
    const { location, quantity } = req.body;
    if (!location || !location.trim()) {
      return res.status(400).json({ message: 'Selecciona la sucursal destino.' });
    }
    const asset = await Asset.findById(req.params.id).select(LIST_EXCLUDE_FIELDS);
    if (!asset || (asset.isTelemetry && !req.user.canViewTelemetryAssets)) {
      return res.status(404).json({ message: 'Activo no encontrado' });
    }
    const dest = location.trim();
    if (dest === asset.location) {
      return res.status(400).json({ message: 'El activo ya está en esa sucursal.' });
    }
    const fromLocation = asset.location || 'sin sucursal';
    const name = `${asset.brand} ${asset.model}`.trim() || asset.type;

    // ── Activo único: solo mueve el registro ──────────────────────────
    if (asset.stockTotal == null) {
      asset.location = dest;
      asset.lastModifiedBy = req.user.name;
      await asset.save({ validateBeforeSave: false });
      logAction(req.user, 'editar', 'activo', asset._id, name, `Transfirió ${name} de ${fromLocation} a ${dest}`);
      return res.json({ asset });
    }

    // ── Lote: valida contra lo disponible (igual que POST /assignments) ──
    const qty = Number(quantity);
    if (!qty || qty <= 0) {
      return res.status(400).json({ message: 'Indica una cantidad válida a transferir.' });
    }
    const activeAssigns = await Assignment.find({ asset: asset._id, active: true });
    const assignedTotal = activeAssigns.reduce((sum, a) => sum + (a.quantity || 1), 0);
    const available = asset.stockTotal - assignedTotal;
    if (qty > available) {
      return res.status(400).json({ message: `Solo hay ${available} unidades disponibles para transferir.` });
    }

    if (qty === asset.stockTotal) {
      // Se mueve el lote completo (solo puede pasar si no hay nada asignado,
      // porque si lo hubiera `available` sería menor a stockTotal) — no hace
      // falta partirlo en dos registros.
      asset.location = dest;
      asset.lastModifiedBy = req.user.name;
      await asset.save({ validateBeforeSave: false });
      logAction(req.user, 'editar', 'activo', asset._id, name, `Transfirió ${qty} uds. de ${name} de ${fromLocation} a ${dest} (lote completo)`);
      return res.json({ asset });
    }

    // Transferencia parcial: resta del origen, busca o crea el gemelo en destino.
    asset.stockTotal -= qty;
    asset.lastModifiedBy = req.user.name;
    await asset.save({ validateBeforeSave: false });

    let twin = await Asset.findOne({
      type: asset.type, brand: asset.brand, model: asset.model,
      location: dest, stockTotal: { $ne: null },
    });
    if (twin) {
      twin.stockTotal += qty;
      twin.lastModifiedBy = req.user.name;
      await twin.save({ validateBeforeSave: false });
    } else {
      twin = await Asset.create({
        category: asset.category,
        type: asset.type,
        brand: asset.brand,
        model: asset.model,
        inventoryTag: asset.inventoryTag,
        status: 'disponible',
        purchaseDate: asset.purchaseDate,
        cost: asset.cost,
        stockTotal: qty,
        location: dest,
        notes: asset.notes,
        specs: asset.specs,
        companyOwned: asset.companyOwned,
        isTelemetry: asset.isTelemetry,
        lastModifiedBy: req.user.name,
      });
    }

    logAction(req.user, 'editar', 'activo', asset._id, name, `Transfirió ${qty} uds. de ${name} de ${fromLocation} a ${dest}`);
    logAction(req.user, 'crear', 'activo', twin._id, name, `Recibió ${qty} uds. de ${name} desde ${fromLocation}`);

    res.json({ asset, twin });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Foto del activo o lote — pedido explícito del usuario (2026-09-03) para
// agilizar el registro de inventario. Se sube aparte del alta/edición (igual
// que las evidencias de Tickets): el modal registra primero el activo (o el
// lote/serie) y, si el usuario tomó/eligió una foto, la sube justo después
// con el _id ya generado.
router.post('/:id/photo', auth, uploadPhoto.single('photo'), async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset || (asset.isTelemetry && !req.user.canViewTelemetryAssets)) {
      return res.status(404).json({ message: 'Activo no encontrado' });
    }
    if (!req.file) return res.status(400).json({ message: 'No se recibió ninguna imagen.' });
    asset.photoData = req.file.buffer;
    asset.photoMimeType = req.file.mimetype;
    asset.photoFileName = req.file.originalname || '';
    await asset.save({ validateBeforeSave: false });
    res.json({ message: 'Foto guardada', photoFileName: asset.photoFileName });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id/photo', auth, async (req, res) => {
  try {
    const asset = await Asset.findById(req.params.id);
    if (!asset || (asset.isTelemetry && !req.user.canViewTelemetryAssets)) return res.status(404).json({ message: 'Sin foto' });
    if (!asset.photoData) return res.status(404).json({ message: 'Sin foto' });
    res.setHeader('Content-Type', asset.photoMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${asset.photoFileName || 'foto'}"`);
    res.end(asset.photoData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Eliminar es exclusivo de Administrador — pedido explícito del usuario
// (2026-08-04): "eliminar solo debería ser para administradores, de
// cualquier cosa" — antes bastaba cualquier sesión válida, sin importar
// el rol.
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    // Si el activo sigue asignado a un empleado, borrarlo dejaría la asignación
    // apuntando a un activo inexistente y rompería la ficha de ese empleado.
    const activeAssignment = await Assignment.findOne({ asset: req.params.id, active: true })
      .populate('employee', 'name');
    if (activeAssignment) {
      return res.status(400).json({
        message: `Este activo está asignado a ${activeAssignment.employee?.name || 'un empleado'}; desasígnalo primero antes de eliminarlo.`,
      });
    }

    const asset = await Asset.findByIdAndDelete(req.params.id);
    if (asset) {
      const name = `${asset.brand} ${asset.model}`.trim() || asset.type;
      logAction(req.user, 'eliminar', 'activo', req.params.id, name, `Eliminó ${name}`);
    }
    res.json({ message: 'Activo eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
