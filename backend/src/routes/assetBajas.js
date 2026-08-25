const router = require('express').Router();
const AssetBaja = require('../models/AssetBaja');
const Asset = require('../models/Asset');
const Assignment = require('../models/Assignment');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { buildAssetBajaPdf } = require('../utils/assetBajaPdf');
const { GERENTE_SISTEMAS_EMAIL } = require('../utils/pdfBranding');
const { notifyTelegram } = require('../utils/telegram');
const logAction = require('../utils/audit');

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.reason) filter.reason = req.query.reason;
    const bajas = await AssetBaja.find(filter)
      .populate('buyerEmployee', 'name office position')
      .sort({ createdAt: -1 });
    res.json(bajas);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Solo admin — igual criterio que DELETE /assignments/:id y DELETE /assets/:id:
// una baja es una operación destructiva de inventario (saca el activo del
// sistema, desasigna si hacía falta), no un alta cualquiera.
router.post('/', adminOnly, async (req, res) => {
  try {
    const body = req.body || {};
    if (!/^[a-f0-9]{24}$/i.test(body.asset || '')) {
      return res.status(400).json({ message: 'Falta el activo a dar de baja' });
    }
    if (!AssetBaja.REASON_OPTIONS.includes(body.reason)) {
      return res.status(400).json({ message: 'Falta el motivo de baja' });
    }
    if (body.reason === 'Otro' && !(body.reasonOther || '').trim()) {
      return res.status(400).json({ message: 'Especifica el motivo de baja' });
    }

    const asset = await Asset.findById(body.asset);
    if (!asset) return res.status(404).json({ message: 'Activo no encontrado' });
    if (asset.status === 'baja') {
      return res.status(400).json({ message: 'Este activo ya está dado de baja' });
    }

    const isVenta = body.reason === 'Venta';
    if (isVenta) {
      if (!AssetBaja.BUYER_TYPE_OPTIONS.includes(body.buyerType)) {
        return res.status(400).json({ message: 'Indica si el comprador es empleado o externo' });
      }
      if (!(body.buyerName || '').trim()) {
        return res.status(400).json({ message: 'Falta el nombre del comprador' });
      }
      if (body.saleAmount == null || Number(body.saleAmount) <= 0) {
        return res.status(400).json({ message: 'Falta el monto de venta' });
      }
      if (!AssetBaja.PAYMENT_METHOD_OPTIONS.includes(body.paymentMethod)) {
        return res.status(400).json({ message: 'Falta la forma de pago' });
      }
    }

    const buyerEmployee = /^[a-f0-9]{24}$/i.test(body.buyerEmployee || '') ? body.buyerEmployee : undefined;

    const baja = await AssetBaja.create({
      folio: AssetBaja.generateFolio(),
      asset: asset._id,
      assetSnapshot: {
        type: asset.type,
        brand: asset.brand,
        model: asset.model,
        serialNumber: asset.serialNumber,
        inventoryTag: asset.inventoryTag,
        location: asset.location,
      },
      condition: AssetBaja.CONDITION_OPTIONS.includes(body.condition) ? body.condition : 'Bueno',
      conditionNotes: (body.conditionNotes || '').trim(),
      dataWiped: !!body.dataWiped,
      reason: body.reason,
      reasonOther: (body.reasonOther || '').trim(),
      buyerType: isVenta ? body.buyerType : undefined,
      buyerEmployee: isVenta ? buyerEmployee : undefined,
      buyerName: isVenta ? (body.buyerName || '').trim() : '',
      buyerIdNumber: isVenta ? (body.buyerIdNumber || '').trim() : '',
      buyerPhone: isVenta ? (body.buyerPhone || '').trim() : '',
      buyerAddress: isVenta ? (body.buyerAddress || '').trim() : '',
      saleAmount: isVenta ? Number(body.saleAmount) : null,
      paymentMethod: isVenta ? body.paymentMethod : undefined,
      paymentMethodOther: isVenta ? (body.paymentMethodOther || '').trim() : '',
      paymentDate: isVenta && body.paymentDate ? body.paymentDate : undefined,
      saleReference: isVenta ? (body.saleReference || '').trim() : '',
      deliveredByName: req.user.name,
      createdByName: req.user.name,
      createdBy: req.user.id,
    });

    // Si el activo tenía una asignación activa, se libera igual que un
    // "Devolver" normal (mismo criterio que DELETE /assignments/:id) antes de
    // mandarlo a baja — no puede seguir figurando asignado a un empleado.
    const activeAssignment = await Assignment.findOne({ asset: asset._id, active: true });
    if (activeAssignment) {
      activeAssignment.active = false;
      activeAssignment.returnDate = new Date();
      const pairedId = activeAssignment.pairedAssignment;
      activeAssignment.pairedAssignment = null;
      await activeAssignment.save();
      if (pairedId) {
        await Assignment.findByIdAndUpdate(pairedId, { pairedAssignment: null });
      }
    }

    asset.status = 'baja';
    asset.lastModifiedBy = req.user.name;
    await asset.save();

    const assetName = `${asset.brand} ${asset.model}`.trim() || asset.type;
    notifyTelegram(
      `🗑️ <b>Baja de activo</b>\n` +
      `Folio: ${baja.folio}\n` +
      `${assetName} (${asset.serialNumber || 's/n'})\n` +
      `Motivo: ${baja.reason}${isVenta ? ` — $${baja.saleAmount} a ${baja.buyerName}` : ''}`
    );

    logAction(req.user, 'crear', 'baja_activo', baja._id, baja.folio, `Dio de baja ${assetName} (${baja.reason})`);

    res.status(201).json(baja);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const baja = await AssetBaja.findById(req.params.id).populate('buyerEmployee', 'name office position');
    if (!baja) return res.status(404).json({ message: 'Baja no encontrada' });
    const gerenteSistemas = await Employee.findOne({ corporateEmails: GERENTE_SISTEMAS_EMAIL }).select('name');
    const pdfData = await buildAssetBajaPdf(baja, gerenteSistemas?.name || null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Baja_${baja.folio}.pdf"`);
    res.end(pdfData);
  } catch (err) {
    console.error('Error generando PDF de baja:', err);
    res.status(500).json({ message: 'Error al generar el PDF' });
  }
});

// Revertir una baja creada por error — a diferencia de Envíos (donde borrar
// el registro no afecta nada más), aquí si no se regresa el Asset a
// 'disponible' se quedaría atorado en 'baja' para siempre sin forma de
// reactivarlo desde la UI. Solo se revierte si sigue en 'baja' (por si ya lo
// cambiaron a mano por otro lado mientras tanto).
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const baja = await AssetBaja.findById(req.params.id);
    if (!baja) return res.status(404).json({ message: 'Baja no encontrada' });
    await baja.deleteOne();

    const asset = await Asset.findById(baja.asset);
    if (asset && asset.status === 'baja') {
      asset.status = 'disponible';
      asset.lastModifiedBy = req.user.name;
      await asset.save();
    }

    logAction(req.user, 'eliminar', 'baja_activo', baja._id, baja.folio, `Eliminó el registro de baja ${baja.folio} (el activo vuelve a disponible)`);
    res.json({ message: 'Registro de baja eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
