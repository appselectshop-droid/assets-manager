const Assignment = require('../models/Assignment');
const Asset = require('../models/Asset');
const logAction = require('./audit');

// Al dar de baja a un empleado, sus activos asignados se liberan solos (quedan
// disponibles) en vez de quedarse marcados como "asignados" a alguien que ya
// no está — y se etiquetan con de qué puesto/persona vinieron, para verlos
// aparte en Disponibilidad en vez de mezclados con el stock normal.
async function releaseAssetsOnBaja(employee, user) {
  const assignments = await Assignment.find({ employee: employee._id, active: true }).populate('asset');
  let freedCount = 0;
  for (const assignment of assignments) {
    const assetDoc = assignment.asset;
    if (!assetDoc) continue; // asignación huérfana, nada que liberar

    assignment.active = false;
    assignment.returnDate = new Date();
    await assignment.save();

    if (assetDoc.stockTotal != null) {
      // Producto a granel: recalcular status con lo que quede asignado
      const remaining = await Assignment.find({ asset: assetDoc._id, active: true });
      const remainingTotal = remaining.reduce((sum, a) => sum + (a.quantity || 1), 0);
      const newStatus = remainingTotal >= assetDoc.stockTotal ? 'asignado' : 'disponible';
      await Asset.findByIdAndUpdate(assetDoc._id, { status: newStatus, lastModifiedBy: user.name });
    } else {
      await Asset.findByIdAndUpdate(assetDoc._id, {
        status: 'disponible',
        lastModifiedBy: user.name,
        freedFromEmployee: {
          name: employee.name,
          position: employee.position || '',
          office: employee.office || employee.businessName || '',
          date: new Date(),
        },
      });
    }

    const assetName = `${assetDoc.brand} ${assetDoc.model}`.trim() || 'activo';
    logAction(user, 'devolver', 'activo', assetDoc._id, assetName, `Se liberó ${assetName} por baja de ${employee.name}`);
    freedCount++;
  }
  return freedCount;
}

module.exports = releaseAssetsOnBaja;
