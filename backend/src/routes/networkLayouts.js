const router = require('express').Router();
const multer = require('multer');
const NetworkLayout = require('../models/NetworkLayout');
const LayoutDevice = require('../models/LayoutDevice');
const LayoutConnection = require('../models/LayoutConnection');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

// Mapa visual de red — Infra sube el plano de una sucursal y coloca encima
// cámaras/NVRs/APs/switches con su IP/MAC/serie, ligados o no a un Activo
// real. Todo admin-only, igual que Tickets/Envíos (uso interno de Sistemas).
const ALLOWED_IMAGE_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_IMAGE_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan JPG, PNG o WEBP como plano'));
    }
    cb(null, true);
  },
});

router.use(auth, adminOnly);

const normalizeMac = (mac) => (mac || '').toUpperCase().replace(/[^0-9A-F]/g, '');

// Lista sin el binario de la imagen (serían varios MB por respuesta) + el
// conteo de dispositivos ya colocados en cada plano.
router.get('/', async (req, res) => {
  try {
    const layouts = await NetworkLayout.find().select('-imageData').sort({ createdAt: -1 });
    const counts = await LayoutDevice.aggregate([
      { $group: { _id: '$layout', count: { $sum: 1 } } },
    ]);
    const countByLayout = {};
    counts.forEach((c) => { countByLayout[c._id.toString()] = c.count; });
    res.json(layouts.map((l) => ({ ...l.toObject(), deviceCount: countByLayout[l._id.toString()] || 0 })));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir el plano' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Falta la imagen del plano' });
    const name = (req.body.name || '').trim();
    if (!name) return res.status(400).json({ message: 'Falta el nombre del plano' });

    const layout = await NetworkLayout.create({
      name,
      office: (req.body.office || '').trim(),
      imageData: req.file.buffer,
      imageMimeType: req.file.mimetype,
      imageFileName: req.file.originalname,
      createdByName: req.user.name,
      createdBy: req.user.id,
    });

    logAction(req.user, 'crear', 'plano_red', layout._id, layout.name, `Subió el plano de red "${layout.name}"`);

    const { imageData, ...rest } = layout.toObject();
    res.status(201).json({ ...rest, deviceCount: 0 });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id', async (req, res) => {
  try {
    const layout = await NetworkLayout.findById(req.params.id).select('-imageData');
    if (!layout) return res.status(404).json({ message: 'Plano no encontrado' });
    res.json(layout);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/image', async (req, res) => {
  try {
    const layout = await NetworkLayout.findById(req.params.id);
    if (!layout) return res.status(404).json({ message: 'Plano no encontrado' });
    res.setHeader('Content-Type', layout.imageMimeType);
    res.end(layout.imageData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Reemplaza solo la imagen de un plano ya existente — a diferencia de borrar
// y volver a crear el plano, esto conserva intactos sus dispositivos y
// conexiones (son colecciones aparte, ligadas por el id del plano, que no
// cambia). Pedido explícito: subir una versión actualizada de la foto sin
// perder todo lo ya colocado encima.
router.put('/:id/image', (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir el plano' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Falta la imagen nueva del plano' });
    const layout = await NetworkLayout.findById(req.params.id);
    if (!layout) return res.status(404).json({ message: 'Plano no encontrado' });

    layout.imageData = req.file.buffer;
    layout.imageMimeType = req.file.mimetype;
    layout.imageFileName = req.file.originalname;
    await layout.save();

    logAction(req.user, 'editar', 'plano_red', layout._id, layout.name, `Reemplazó la imagen del plano de red "${layout.name}" (dispositivos y conexiones se conservan)`);

    const { imageData, ...rest } = layout.toObject();
    res.json(rest);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const layout = await NetworkLayout.findByIdAndDelete(req.params.id);
    if (!layout) return res.status(404).json({ message: 'Plano no encontrado' });
    await LayoutDevice.deleteMany({ layout: layout._id });
    await LayoutConnection.deleteMany({ layout: layout._id });
    logAction(req.user, 'eliminar', 'plano_red', layout._id, layout.name, `Eliminó el plano de red "${layout.name}" y sus dispositivos`);
    res.json({ message: 'Plano eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Dispositivos (pines) de un plano ────────────────────────────────────
router.get('/:id/devices', async (req, res) => {
  try {
    const devices = await LayoutDevice.find({ layout: req.params.id })
      .populate('assetRef', 'type brand model serialNumber location status');
    res.json(devices);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/devices', async (req, res) => {
  try {
    const layout = await NetworkLayout.findById(req.params.id);
    if (!layout) return res.status(404).json({ message: 'Plano no encontrado' });

    const { x, y, deviceType, label, assetRef, ipAddress, macAddress, serialNumber, status, notes } = req.body;
    if (typeof x !== 'number' || typeof y !== 'number') {
      return res.status(400).json({ message: 'Falta la posición del dispositivo en el plano' });
    }
    if (!LayoutDevice.DEVICE_TYPES.includes(deviceType)) {
      return res.status(400).json({ message: 'Tipo de dispositivo inválido' });
    }

    const device = await LayoutDevice.create({
      layout: layout._id,
      x, y, deviceType,
      label: (label || '').trim(),
      assetRef: /^[a-f0-9]{24}$/i.test(assetRef || '') ? assetRef : undefined,
      ipAddress: (ipAddress || '').trim(),
      macAddress: (macAddress || '').trim(),
      serialNumber: (serialNumber || '').trim(),
      status: ['activo', 'inactivo', 'mantenimiento'].includes(status) ? status : 'activo',
      notes: (notes || '').trim(),
    });

    logAction(req.user, 'crear', 'plano_red', device._id, device.label || LayoutDevice.DEVICE_TYPE_LABELS[deviceType], `Agregó ${LayoutDevice.DEVICE_TYPE_LABELS[deviceType]} al plano "${layout.name}"`);

    const populated = await device.populate('assetRef', 'type brand model serialNumber location status');
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/devices/:deviceId', async (req, res) => {
  try {
    const device = await LayoutDevice.findById(req.params.deviceId);
    if (!device) return res.status(404).json({ message: 'Dispositivo no encontrado' });

    const { x, y, deviceType, label, assetRef, ipAddress, macAddress, serialNumber, status, notes } = req.body;
    if (typeof x === 'number') device.x = x;
    if (typeof y === 'number') device.y = y;
    if (deviceType) {
      if (!LayoutDevice.DEVICE_TYPES.includes(deviceType)) return res.status(400).json({ message: 'Tipo de dispositivo inválido' });
      device.deviceType = deviceType;
    }
    if (label !== undefined) device.label = label.trim();
    if (assetRef !== undefined) device.assetRef = /^[a-f0-9]{24}$/i.test(assetRef || '') ? assetRef : undefined;
    if (ipAddress !== undefined) device.ipAddress = ipAddress.trim();
    if (macAddress !== undefined) device.macAddress = macAddress.trim();
    if (serialNumber !== undefined) device.serialNumber = serialNumber.trim();
    if (status && ['activo', 'inactivo', 'mantenimiento'].includes(status)) device.status = status;
    if (notes !== undefined) device.notes = notes.trim();
    await device.save();

    const populated = await device.populate('assetRef', 'type brand model serialNumber location status');
    res.json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/devices/:deviceId', async (req, res) => {
  try {
    const device = await LayoutDevice.findByIdAndDelete(req.params.deviceId);
    if (!device) return res.status(404).json({ message: 'Dispositivo no encontrado' });
    await LayoutConnection.deleteMany({ $or: [{ fromDevice: device._id }, { toDevice: device._id }] });
    logAction(req.user, 'eliminar', 'plano_red', device._id, device.label || LayoutDevice.DEVICE_TYPE_LABELS[device.deviceType], `Eliminó ${LayoutDevice.DEVICE_TYPE_LABELS[device.deviceType]} del plano`);
    res.json({ message: 'Dispositivo eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Conexiones (cables) entre dos pines de un plano ─────────────────────
// El trazo va de fromDevice a toDevice pasando por los puntos intermedios
// que el usuario haya marcado — el color con el que se dibuja se infiere en
// el frontend a partir del deviceType de los dos extremos, no se guarda aquí.
router.get('/:id/connections', async (req, res) => {
  try {
    const connections = await LayoutConnection.find({ layout: req.params.id })
      .populate('fromDevice', 'deviceType label x y')
      .populate('toDevice', 'deviceType label x y');
    res.json(connections);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/connections', async (req, res) => {
  try {
    const layout = await NetworkLayout.findById(req.params.id);
    if (!layout) return res.status(404).json({ message: 'Plano no encontrado' });

    const { fromDevice, toDevice, path, notes } = req.body;
    if (!Array.isArray(path) || path.length < 2) {
      return res.status(400).json({ message: 'El trazo necesita al menos 2 puntos' });
    }
    const [from, to] = await Promise.all([
      LayoutDevice.findOne({ _id: fromDevice, layout: layout._id }),
      LayoutDevice.findOne({ _id: toDevice, layout: layout._id }),
    ]);
    if (!from || !to) return res.status(400).json({ message: 'Los dos dispositivos deben existir en este plano' });

    // El trazo siempre arranca/termina exacto en el pin, sin importar dónde
    // cayó el clic al dibujar.
    const fullPath = [{ x: from.x, y: from.y }, ...path.slice(1, -1), { x: to.x, y: to.y }];

    const connection = await LayoutConnection.create({
      layout: layout._id,
      fromDevice: from._id,
      toDevice: to._id,
      path: fullPath,
      notes: (notes || '').trim(),
      createdByName: req.user.name,
    });

    logAction(req.user, 'crear', 'plano_red', connection._id, `${from.label || LayoutDevice.DEVICE_TYPE_LABELS[from.deviceType]} → ${to.label || LayoutDevice.DEVICE_TYPE_LABELS[to.deviceType]}`, `Conectó dos dispositivos en el plano "${layout.name}"`);

    const populated = await connection.populate([
      { path: 'fromDevice', select: 'deviceType label x y' },
      { path: 'toDevice', select: 'deviceType label x y' },
    ]);
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/connections/:connectionId', async (req, res) => {
  try {
    const connection = await LayoutConnection.findByIdAndDelete(req.params.connectionId);
    if (!connection) return res.status(404).json({ message: 'Conexión no encontrada' });
    res.json({ message: 'Conexión eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Dispositivos descubiertos por red (SADP/ConfigTool u otra herramienta) ──
// Import en lote de lo que un escaneo de descubrimiento del fabricante ya
// trae (IP+MAC+modelo+serie) sin necesitar credenciales del NVR. No coloca
// ningún pin — solo guarda el catálogo; cada entrada se "usa" para llenar
// un pin (nuevo o existente) desde el modal del frontend, que la descarta
// de la lista de pendientes en cuanto su MAC ya coincide con algún pin.
router.post('/:id/discovered-devices', async (req, res) => {
  try {
    const layout = await NetworkLayout.findById(req.params.id);
    if (!layout) return res.status(404).json({ message: 'Plano no encontrado' });

    const rows = Array.isArray(req.body.devices) ? req.body.devices : [];
    const existingMacs = new Set(layout.discoveredDevices.map((d) => normalizeMac(d.mac)));
    let added = 0;
    let skipped = 0;
    for (const row of rows) {
      const macNorm = normalizeMac(row.mac);
      if (!macNorm || existingMacs.has(macNorm)) { skipped++; continue; }
      existingMacs.add(macNorm);
      layout.discoveredDevices.push({
        ip: (row.ip || '').trim(),
        mac: (row.mac || '').trim(),
        model: (row.model || '').trim(),
        serialNumber: (row.serialNumber || '').trim(),
      });
      added++;
    }
    await layout.save();

    logAction(req.user, 'crear', 'plano_red', layout._id, layout.name, `Importó ${added} dispositivo(s) descubierto(s) por red al plano "${layout.name}"${skipped ? ` (${skipped} omitidos por repetidos o sin MAC)` : ''}`);

    res.status(201).json({ added, skipped, discoveredDevices: layout.discoveredDevices });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id/discovered-devices/:discoveredId', async (req, res) => {
  try {
    const layout = await NetworkLayout.findById(req.params.id);
    if (!layout) return res.status(404).json({ message: 'Plano no encontrado' });
    const sub = layout.discoveredDevices.id(req.params.discoveredId);
    if (!sub) return res.status(404).json({ message: 'Dispositivo descubierto no encontrado' });
    sub.deleteOne();
    await layout.save();
    res.json({ discoveredDevices: layout.discoveredDevices });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
