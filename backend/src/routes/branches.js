const router = require('express').Router();
const Branch = require('../models/Branch');
const Employee = require('../models/Employee');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

// El usuario confirmó (16 jul) que la lista vieja de 11 sucursales estaba
// desactualizada, y dio la correspondencia real contra la tabla de
// levantamiento de la junta de Finanzas. inventoryStatus viene de esa tabla
// (sección 4.2 del documento) para cada nombre ya resuelto; las 2 que no
// aparecían ahí (T. Portal Centro, T. Perinorte) quedan "pendiente" por no
// tener dato. CISNES y POLANCO PISO 16 vienen de dividir "GOLDEN" — division
// pendiente de que el usuario confirme qué empleados van a cada una (ver
// OFFICE_SPLIT_PENDING más abajo); mientras tanto se agregan ya al catálogo
// para que se puedan usar en altas nuevas, pero los empleados existentes con
// "GOLDEN" no se tocan todavía.
const DEFAULT_BRANCHES = [
  { name: 'CISNES', inventoryStatus: 'levantado' },
  { name: 'HORACIO', inventoryStatus: 'levantado' },
  { name: 'IZTAPALAPA', inventoryStatus: 'levantado' },
  { name: 'NAUCALPAN (CRISTALERIA)', inventoryStatus: 'pendiente' },
  { name: 'NAUCALPAN (TLB)', inventoryStatus: 'pendiente' },
  { name: 'NEBRASKA', inventoryStatus: 'levantado' },
  { name: 'POLANCO PISO 13', inventoryStatus: 'levantado' },
  { name: 'POLANCO PISO 16', inventoryStatus: 'levantado' },
  { name: 'T. ARAGON', inventoryStatus: 'levantado' },
  { name: 'T. CUERNAVACA', inventoryStatus: 'pendiente' },
  { name: 'T. POLANCO', inventoryStatus: 'levantado' },
  { name: 'TEPOTZOTLAN II', inventoryStatus: 'levantado' },
  { name: 'TEPOTZOTLAN III', inventoryStatus: 'levantado' },
  { name: 'TEPOTZOTLAN IV', inventoryStatus: 'levantado' },
  { name: 'T. PORTAL CENTRO', inventoryStatus: 'pendiente' },
  { name: 'T. PERINORTE', inventoryStatus: 'pendiente' },
];

// Renombres 1 a 1, sin ambigüedad — mismo empleado/activo, solo cambia el
// nombre correcto de su sucursal. GOLDEN y "SUC.6 CEDI Naucalpan" NO están
// aquí a propósito: cada una se divide en dos sucursales nuevas y requiere
// saber, empleado por empleado, a cuál de las dos va (ver
// POST /branches/split-golden).
const OFFICE_RENAME_MAP = {
  'SUC.10 Fontastic': 'HORACIO',
  'SUC.5 CEDI Iztapalapa': 'IZTAPALAPA',
  'SUC.1 Corporativo Torre Polanco': 'POLANCO PISO 13',
  'SUC.4 Tienda Aragón': 'T. ARAGON',
  'SUC.3 Tienda Cuernavaca': 'T. CUERNAVACA',
  'SUC.7 CEDI TEPOTZ JSB': 'TEPOTZOTLAN II',
  'SUC.8 CEDI TEPOTZ B&B': 'TEPOTZOTLAN III',
  'SUC.11 Tienda Portal Centro': 'T. PORTAL CENTRO',
  'SUC.12 Tienda Perinorte': 'T. PERINORTE',
};

// Igual que autoCloseStaleResolved en tickets.js: no hay cron real en este
// proyecto, así que se siembra "perezosamente" la primera vez que alguien
// pide el catálogo.
async function ensureSeeded() {
  const count = await Branch.countDocuments();
  if (count > 0) return;
  await Branch.insertMany(DEFAULT_BRANCHES, { ordered: false }).catch(() => {});
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

// Corrige de un jalón los 9 renombres 1 a 1 (ver OFFICE_RENAME_MAP) en
// Empleados, Activos y el catálogo mismo — pensado para correrse UNA vez,
// desde el botón en Sucursales.jsx. Es seguro volver a correrlo (si un
// nombre viejo ya no existe en ningún lado, updateMany simplemente no
// encuentra nada que cambiar).
router.post('/migrate-office-names', async (req, res) => {
  try {
    const results = [];
    for (const [oldName, newName] of Object.entries(OFFICE_RENAME_MAP)) {
      const [empRes, assetRes] = await Promise.all([
        Employee.updateMany({ office: oldName }, { $set: { office: newName } }),
        Asset.updateMany({ location: oldName }, { $set: { location: newName } }),
      ]);
      // Si el catálogo ya tiene la sucursal nueva (por el seed), solo se
      // quita la vieja; si no, se renombra la vieja para no perder su
      // inventoryStatus/equipmentScope ya capturado a mano.
      const newExists = await Branch.exists({ name: newName });
      if (newExists) {
        await Branch.deleteOne({ name: oldName });
      } else {
        await Branch.updateOne({ name: oldName }, { $set: { name: newName } });
      }
      results.push({ oldName, newName, employeesUpdated: empRes.modifiedCount, assetsUpdated: assetRes.modifiedCount });
    }
    await ensureSeeded(); // agrega NEBRASKA/T. POLANCO/etc. si el catálogo seguía vacío
    logAction(req.user, 'editar', 'sucursal', 'migracion-nombres', 'Catálogo de sucursales', 'Corrigió la nomenclatura de sucursales (renombres 1 a 1)');
    res.json({ message: 'Migración completada', results });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Empleados que hoy tienen "GOLDEN" como oficina — para que Sucursales.jsx
// arme un checklist real (evita que alguien tenga que teclear nombres a
// mano y arriesgarse a un typo que deje a alguien sin migrar).
router.get('/golden-employees', async (req, res) => {
  try {
    const employees = await Employee.find({ office: 'GOLDEN' }).select('name employeeId department').sort({ name: 1 });
    res.json(employees);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// División de GOLDEN → CISNES (Cuernavaca) / POLANCO PISO 16, confirmada por
// el usuario el 16 jul. `piso16Ids` son los _id de Employee marcados en el
// checklist; todo el que se quede con "GOLDEN" después de eso pasa a CISNES
// por default (es la mayoría, según el usuario).
router.post('/split-golden', async (req, res) => {
  try {
    const { piso16Ids } = req.body;
    if (!Array.isArray(piso16Ids) || piso16Ids.length === 0) {
      return res.status(400).json({ message: 'Selecciona al menos un empleado de Polanco Piso 16' });
    }
    const toPiso16 = await Employee.updateMany(
      { office: 'GOLDEN', _id: { $in: piso16Ids } },
      { $set: { office: 'POLANCO PISO 16' } }
    );
    const toCisnes = await Employee.updateMany(
      { office: 'GOLDEN' },
      { $set: { office: 'CISNES' } }
    );
    // Un activo con ubicación "GOLDEN" no distingue personas — no se puede
    // dividir por lista de empleados. Se deja para revisión manual si hay
    // alguno (poco común: la ubicación del activo normalmente se actualiza
    // sola al confirmarse un envío, ver Shipments).
    const goldenAssetsLeft = await Asset.countDocuments({ location: 'GOLDEN' });
    await Branch.deleteOne({ name: 'GOLDEN' });

    logAction(req.user, 'editar', 'sucursal', 'split-golden', 'Catálogo de sucursales',
      `Dividió GOLDEN: ${toPiso16.modifiedCount} a Polanco Piso 16, ${toCisnes.modifiedCount} a Cisnes`);
    res.json({
      message: 'División completada',
      piso16Count: toPiso16.modifiedCount,
      cisnesCount: toCisnes.modifiedCount,
      goldenAssetsLeft,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

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
