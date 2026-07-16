const router = require('express').Router();
const Branch = require('../models/Branch');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

// Nombres ya en uso hoy como "office"/"location" en Employees/Assets — se
// siembran tal cual (mismos valores que ya existen en datos reales) la
// primera vez que se pide el catálogo, para no perder ni duplicar nada ya
// capturado. La tabla de levantamiento física que dio la junta de Finanzas
// usa OTROS nombres (Cisnes, Horacio, Nebraska, Tepotzotlán II/III/IV, etc.)
// que no se pudieron reconciliar con certeza contra esta lista — se deja para
// que Sistemas los agregue/renombre desde esta misma página una vez
// confirmada la correspondencia real.
const DEFAULT_BRANCHES = [
  'SUC.1 Corporativo Torre Polanco',
  'SUC.3 Tienda Cuernavaca',
  'SUC.4 Tienda Aragón',
  'SUC.5 CEDI Iztapalapa',
  'SUC.6 CEDI Naucalpan',
  'SUC.7 CEDI TEPOTZ JSB',
  'SUC.8 CEDI TEPOTZ B&B',
  'SUC.10 Fontastic',
  'SUC.11 Tienda Portal Centro',
  'SUC.12 Tienda Perinorte',
  'GOLDEN',
];

// Igual que autoCloseStaleResolved en tickets.js: no hay cron real en este
// proyecto, así que se siembra "perezosamente" la primera vez que alguien
// pide el catálogo.
async function ensureSeeded() {
  const count = await Branch.countDocuments();
  if (count > 0) return;
  await Branch.insertMany(DEFAULT_BRANCHES.map((name) => ({ name })), { ordered: false }).catch(() => {});
}

// Pública (sin JWT) — para selectores en formularios públicos (ej.
// SolicitarIngreso) que necesitan la lista de sucursales sin sesión.
router.get('/public', async (req, res) => {
  try {
    await ensureSeeded();
    const branches = await Branch.find().select('name').sort({ name: 1 });
    res.json(branches.map((b) => b.name));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  try {
    await ensureSeeded();
    const branches = await Branch.find().sort({ name: 1 });
    res.json(branches);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const { name, inventoryStatus, equipmentScope, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Falta el nombre de la sucursal' });
    const branch = await Branch.create({
      name: name.trim(),
      inventoryStatus: inventoryStatus || 'pendiente',
      equipmentScope: equipmentScope || null,
      notes: notes || '',
    });
    logAction(req.user, 'crear', 'sucursal', branch._id, branch.name, `Agregó la sucursal "${branch.name}" al catálogo`);
    res.status(201).json(branch);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Ya existe una sucursal con ese nombre' });
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const branch = await Branch.findById(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });

    const { name, inventoryStatus, equipmentScope, notes } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'Falta el nombre de la sucursal' });
      branch.name = name.trim();
    }
    if (inventoryStatus !== undefined) branch.inventoryStatus = inventoryStatus;
    if (equipmentScope !== undefined) branch.equipmentScope = equipmentScope || null;
    if (notes !== undefined) branch.notes = notes;
    await branch.save();
    logAction(req.user, 'editar', 'sucursal', branch._id, branch.name, `Editó la sucursal "${branch.name}"`);
    res.json(branch);
  } catch (err) {
    if (err.code === 11000) return res.status(409).json({ message: 'Ya existe una sucursal con ese nombre' });
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    const branch = await Branch.findByIdAndDelete(req.params.id);
    if (!branch) return res.status(404).json({ message: 'Sucursal no encontrada' });
    logAction(req.user, 'eliminar', 'sucursal', branch._id, branch.name, `Eliminó la sucursal "${branch.name}" del catálogo`);
    res.json({ message: 'Sucursal eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
