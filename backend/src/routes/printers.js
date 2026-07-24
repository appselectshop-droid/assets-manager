const router = require('express').Router();
const Printer = require('../models/Printer');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

// Pública (sin JWT) — mismo criterio que /internal-apps/public: Reportar
// Ticket necesita ofrecer el selector de impresoras sin sesión de admin.
router.get('/public', async (req, res) => {
  const printers = await Printer.find().sort({ branch: 1, nombre: 1 });
  res.json(printers);
});

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  const printers = await Printer.find().sort({ branch: 1, nombre: 1 });
  res.json(printers);
});

router.post('/', async (req, res) => {
  try {
    const { branch, nombre, modelo, serie, ip } = req.body;
    if (!branch?.trim() || !nombre?.trim() || !modelo?.trim()) {
      return res.status(400).json({ message: 'Falta sucursal, nombre o modelo' });
    }
    const printer = await Printer.create({
      branch: branch.trim(), nombre: nombre.trim(), modelo: modelo.trim(),
      serie: (serie || '').trim(), ip: (ip || '').trim(),
    });
    logAction(req.user, 'crear', 'impresora', printer._id, printer.nombre, `Agregó la impresora "${printer.nombre}" (${printer.branch}) al catálogo`);
    res.status(201).json(printer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const printer = await Printer.findById(req.params.id);
    if (!printer) return res.status(404).json({ message: 'Impresora no encontrada' });

    const { branch, nombre, modelo, serie, ip } = req.body;
    if (branch !== undefined) {
      if (!branch.trim()) return res.status(400).json({ message: 'Falta la sucursal' });
      printer.branch = branch.trim();
    }
    if (nombre !== undefined) {
      if (!nombre.trim()) return res.status(400).json({ message: 'Falta el nombre' });
      printer.nombre = nombre.trim();
    }
    if (modelo !== undefined) {
      if (!modelo.trim()) return res.status(400).json({ message: 'Falta el modelo' });
      printer.modelo = modelo.trim();
    }
    if (serie !== undefined) printer.serie = serie.trim();
    if (ip !== undefined) printer.ip = ip.trim();
    await printer.save();
    logAction(req.user, 'editar', 'impresora', printer._id, printer.nombre, `Editó la impresora "${printer.nombre}" (${printer.branch})`);
    res.json(printer);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const printer = await Printer.findByIdAndDelete(req.params.id);
  if (!printer) return res.status(404).json({ message: 'Impresora no encontrada' });
  logAction(req.user, 'eliminar', 'impresora', printer._id, printer.nombre, `Eliminó la impresora "${printer.nombre}" (${printer.branch}) del catálogo`);
  res.json({ message: 'Impresora eliminada' });
});

module.exports = router;
