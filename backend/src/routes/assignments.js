const router = require('express').Router();
const Assignment = require('../models/Assignment');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

router.get('/', auth, async (req, res) => {
  try {
    const assignments = await Assignment.find({ active: true })
      .populate('employee', 'employeeId name businessName office position area department')
      .populate('asset')
      .sort({ assignedDate: -1 });
    res.json(assignments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, async (req, res) => {
  try {
    const { employee, asset, assignedDate, notes, quantity = 1 } = req.body;
    const assetDoc = await Asset.findById(asset);
    if (!assetDoc) return res.status(404).json({ message: 'Activo no encontrado' });

    if (assetDoc.stockTotal != null) {
      // Bulk product: allow multiple assignments, validate available quantity
      const activeAssigns = await Assignment.find({ asset, active: true });
      const assignedTotal = activeAssigns.reduce((sum, a) => sum + (a.quantity || 1), 0);
      const available = assetDoc.stockTotal - assignedTotal;
      if (quantity > available) {
        return res.status(400).json({ message: `Solo hay ${available} unidades disponibles` });
      }
      const assignment = await Assignment.create({ employee, asset, assignedDate, notes, quantity });
      const newAssigned = assignedTotal + Number(quantity);
      const newStatus = newAssigned >= assetDoc.stockTotal ? 'asignado' : 'disponible';
      await Asset.findByIdAndUpdate(asset, { status: newStatus, lastModifiedBy: req.user.name });
      const populated = await assignment.populate(['employee', 'asset']);
      const assetName = `${populated.asset?.brand} ${populated.asset?.model}`.trim() || 'accesorio';
      const empName   = populated.employee?.name || 'empleado';
      logAction(req.user, 'asignar', 'accesorio', asset, assetName, `Asignó ${quantity} uds. de ${assetName} a ${empName}`);
      return res.status(201).json(populated);
    }

    // Individual asset: original one-assignment-at-a-time behavior
    const existing = await Assignment.findOne({ asset, active: true });
    if (existing) return res.status(400).json({ message: 'Este activo ya está asignado' });
    const assignment = await Assignment.create({ employee, asset, assignedDate, notes });
    await Asset.findByIdAndUpdate(asset, {
      status: 'asignado',
      lastModifiedBy: req.user.name,
      $unset: { freedFromEmployee: '' },
    });
    const populated = await assignment.populate(['employee', 'asset']);
    const assetName = `${populated.asset?.brand} ${populated.asset?.model}`.trim() || 'activo';
    const empName   = populated.employee?.name || 'empleado';
    logAction(req.user, 'asignar', 'activo', asset, assetName, `Asignó ${assetName} a ${empName}`);
    res.status(201).json(populated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, async (req, res) => {
  try {
    const { notes } = req.body;
    const assignment = await Assignment.findByIdAndUpdate(
      req.params.id,
      { notes },
      { new: true }
    ).populate(['employee', 'asset']);
    if (!assignment) return res.status(404).json({ message: 'No encontrada' });
    res.json(assignment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Eliminar (devolver/desasignar) es exclusivo de Administrador — pedido
// explícito del usuario (2026-08-04): "eliminar solo debería ser para
// administradores, de cualquier cosa" — antes bastaba cualquier sesión
// válida, sin importar el rol.
router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const assignment = await Assignment.findById(req.params.id).populate(['employee', 'asset']);
    if (!assignment) return res.status(404).json({ message: 'No encontrada' });
    // Ya se había devuelto antes (doble clic en "Devolver", reintento de red,
    // o el flujo de reasignar-a-otra-persona en Assets.jsx que hace DELETE +
    // POST seguidos) — no reprocesar. Sin este guard, un segundo DELETE
    // tardío vuelve a forzar el activo a "disponible" más abajo, aunque ya
    // exista una asignación nueva (bug real confirmado vía AuditLog en
    // PF47Z7RT/PF61LNY2/el celular Motorola: el "devolver" duplicado llegó
    // 1.3s después del correcto y pisó el "asignado" que el POST ya había
    // puesto bien).
    if (!assignment.active) return res.json({ message: 'Activo desasignado' });

    assignment.active     = false;
    assignment.returnDate = new Date();
    await assignment.save();

    const assetDoc = assignment.asset;
    if (assetDoc?.stockTotal != null) {
      // Bulk product: recompute status from remaining active assignments
      const remaining = await Assignment.find({ asset: assetDoc._id, active: true });
      const remainingTotal = remaining.reduce((sum, a) => sum + (a.quantity || 1), 0);
      const newStatus = remainingTotal >= assetDoc.stockTotal ? 'asignado' : 'disponible';
      await Asset.findByIdAndUpdate(assetDoc._id, { status: newStatus, lastModifiedBy: req.user.name });
    } else {
      // Individual asset: solo se marca "disponible" si de verdad no queda
      // NINGUNA otra asignación activa — si ya hay una nueva (ej. se
      // reasignó a otra persona justo después de devolverlo), no se pisa.
      const stillActive = await Assignment.findOne({ asset: assetDoc?._id || assignment.asset, active: true });
      if (!stillActive) {
        await Asset.findByIdAndUpdate(assetDoc?._id || assignment.asset, { status: 'disponible', lastModifiedBy: req.user.name });
      }
    }

    const assetName = `${assetDoc?.brand} ${assetDoc?.model}`.trim() || 'activo';
    const empName   = assignment.employee?.name || 'empleado';
    logAction(req.user, 'devolver', 'activo', assetDoc?._id, assetName, `Devolvió ${assetName} de ${empName}`);
    res.json({ message: 'Activo desasignado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
