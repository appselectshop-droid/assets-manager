const router = require('express').Router();
const EmployeeCatalog = require('../models/EmployeeCatalog');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

const TYPES = ['departamento', 'area', 'razon_social', 'puesto', 'oficina'];
const TYPE_LABELS = {
  departamento: 'Departamentos',
  area: 'Áreas',
  razon_social: 'Razones Sociales',
  puesto: 'Puestos',
  oficina: 'Oficinas',
};

function isValidType(type) {
  return TYPES.includes(type);
}

// Público (sin login) — cualquier formulario, admin o del portal de
// empleado (ej. Solicitar Ingreso), necesita leer estas listas para llenar
// sus selects; son solo etiquetas, nada sensible.
router.get('/:type/public', async (req, res) => {
  try {
    if (!isValidType(req.params.type)) return res.status(400).json({ message: 'Tipo de catálogo inválido' });
    const items = await EmployeeCatalog.find({ type: req.params.type }).sort({ label: 1 }).select('label');
    res.json(items.map((i) => i.label));
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.use(auth, adminOnly);

router.get('/:type', async (req, res) => {
  try {
    if (!isValidType(req.params.type)) return res.status(400).json({ message: 'Tipo de catálogo inválido' });
    const items = await EmployeeCatalog.find({ type: req.params.type }).sort({ label: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:type', async (req, res) => {
  try {
    if (!isValidType(req.params.type)) return res.status(400).json({ message: 'Tipo de catálogo inválido' });
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ message: 'Falta el nombre' });
    const item = await EmployeeCatalog.create({ type: req.params.type, label, createdByName: req.user.name });
    logAction(req.user, 'crear', 'catalogo_empleado', item._id, item.label, `Agregó "${label}" a ${TYPE_LABELS[req.params.type]}`);
    res.status(201).json(item);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Ya existe esa opción' });
    res.status(400).json({ message: err.message });
  }
});

router.put('/item/:id', async (req, res) => {
  try {
    const label = (req.body.label || '').trim();
    if (!label) return res.status(400).json({ message: 'Falta el nombre' });
    const item = await EmployeeCatalog.findByIdAndUpdate(req.params.id, { label }, { new: true, runValidators: true });
    if (!item) return res.status(404).json({ message: 'No encontrado' });
    logAction(req.user, 'editar', 'catalogo_empleado', item._id, item.label, `Editó ${TYPE_LABELS[item.type]}: "${label}"`);
    res.json(item);
  } catch (err) {
    if (err.code === 11000) return res.status(400).json({ message: 'Ya existe esa opción' });
    res.status(400).json({ message: err.message });
  }
});

router.delete('/item/:id', async (req, res) => {
  try {
    const item = await EmployeeCatalog.findByIdAndDelete(req.params.id);
    if (!item) return res.status(404).json({ message: 'No encontrado' });
    logAction(req.user, 'eliminar', 'catalogo_empleado', item._id, item.label, `Eliminó de ${TYPE_LABELS[item.type]}: "${item.label}"`);
    res.json({ message: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
