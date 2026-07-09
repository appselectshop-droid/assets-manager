const router = require('express').Router();
const crypto = require('crypto');
const Shipment = require('../models/Shipment');
const Asset = require('../models/Asset');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { notifyTelegram } = require('../utils/telegram');
const { buildShipmentPdf } = require('../utils/shipmentPdf');
const logAction = require('../utils/audit');

function generateFolio() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SAL-${year}-${rand}`;
}

// ── PÚBLICO (sin login) — para que el destinatario, que normalmente no
// tiene cuenta en el sistema, vea qué le mandaron y confirme la recepción
// con el link único que Sistemas le comparte por WhatsApp/correo. ─────────
router.get('/public/:token', async (req, res) => {
  try {
    const shipment = await Shipment.findOne({ confirmToken: req.params.token });
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    res.json(shipment);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// El mensajero tampoco tiene cuenta en el sistema — marca "en tránsito" desde
// el mismo link único (antes de que el destinatario lo pueda confirmar como
// recibido), sin meterse a la app.
router.post('/public/:token/transit', async (req, res) => {
  try {
    const shipment = await Shipment.findOne({ confirmToken: req.params.token });
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    if (shipment.status !== 'enviado') {
      return res.status(400).json({ message: 'Este envío ya no está en estatus "enviado"' });
    }
    const transitByName = (req.body.transitByName || '').trim();
    if (!transitByName) return res.status(400).json({ message: 'Escribe tu nombre para marcar el envío en tránsito' });

    shipment.status = 'en_transito';
    shipment.transitAt = new Date();
    shipment.transitByName = transitByName;
    await shipment.save();

    notifyTelegram(
      `🚚 <b>Envío en tránsito</b>\n` +
      `Folio: ${shipment.folio}\n` +
      `${shipment.originOffice} → ${shipment.destinationOffice}\n` +
      `Marcado por: ${transitByName}`
    );

    res.json(shipment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/public/:token/confirm', async (req, res) => {
  try {
    const shipment = await Shipment.findOne({ confirmToken: req.params.token });
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    if (shipment.status === 'recibido') {
      return res.status(400).json({ message: 'Este envío ya fue confirmado como recibido' });
    }
    const receivedByName = (req.body.receivedByName || '').trim();
    if (!receivedByName) return res.status(400).json({ message: 'Escribe tu nombre para confirmar la recepción' });

    shipment.status = 'recibido';
    shipment.receivedAt = new Date();
    shipment.receivedByName = receivedByName;
    shipment.receivedNotes = (req.body.receivedNotes || '').trim();
    await shipment.save();

    // Los activos reales vinculados ya están físicamente en el destino —
    // se actualiza su ubicación para que Disponibilidad quede correcta.
    const assetIds = shipment.items.map((i) => i.assetRef).filter(Boolean);
    if (assetIds.length) {
      await Asset.updateMany({ _id: { $in: assetIds } }, { $set: { location: shipment.destinationOffice } });
    }

    notifyTelegram(
      `✅ <b>Envío recibido</b>\n` +
      `Folio: ${shipment.folio}\n` +
      `${shipment.originOffice} → ${shipment.destinationOffice}\n` +
      `Confirmado por: ${receivedByName}`
    );

    res.json(shipment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.use(auth);

router.get('/', async (req, res) => {
  try {
    const filter = {};
    if (req.query.status) filter.status = req.query.status;
    const shipments = await Shipment.find(filter).sort({ createdAt: -1 });
    res.json(shipments);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const body = req.body || {};
    if (!(body.requesterName || '').trim()) return res.status(400).json({ message: 'Falta el nombre del solicitante' });
    if (!(body.originOffice || '').trim()) return res.status(400).json({ message: 'Falta la sucursal de origen' });
    if (!(body.destinationOffice || '').trim()) return res.status(400).json({ message: 'Falta la sucursal de destino' });
    if (!(body.recipientName || '').trim()) return res.status(400).json({ message: 'Falta el destinatario' });
    if (!Array.isArray(body.items) || body.items.length === 0) {
      return res.status(400).json({ message: 'Agrega al menos un equipo al envío' });
    }
    if (!Shipment.REASON_OPTIONS.includes(body.reason)) {
      return res.status(400).json({ message: 'Falta el motivo de salida' });
    }

    const requesterRef = /^[a-f0-9]{24}$/i.test(body.requesterRef || '') ? body.requesterRef : undefined;
    const sourceResourceRequest = /^[a-f0-9]{24}$/i.test(body.sourceResourceRequest || '') ? body.sourceResourceRequest : undefined;

    const shipment = await Shipment.create({
      folio: generateFolio(),
      requesterName: body.requesterName.trim(),
      requesterDepartment: (body.requesterDepartment || '').trim(),
      requesterPosition: (body.requesterPosition || '').trim(),
      requesterRef,
      sourceResourceRequest,
      originOffice: body.originOffice.trim(),
      destinationOffice: body.destinationOffice.trim(),
      recipientName: body.recipientName.trim(),
      items: body.items.map((i) => ({
        assetRef: /^[a-f0-9]{24}$/i.test(i.assetRef || '') ? i.assetRef : undefined,
        type: i.type || '',
        description: i.description || '',
        serialOrImei: i.serialOrImei || '',
        condition: i.condition || '',
        itemStatus: i.itemStatus || '',
      })),
      reason: body.reason,
      reasonOther: (body.reasonOther || '').trim(),
      notes: (body.notes || '').trim(),
      returnDate: body.returnDate || undefined,
      sentByName: req.user.name,
      sentBy: req.user.id,
    });

    notifyTelegram(
      `📦🚚 <b>Nueva salida de equipo</b>\n` +
      `Folio: ${shipment.folio}\n` +
      `${shipment.originOffice} → ${shipment.destinationOffice}\n` +
      `Para: ${shipment.recipientName}\n` +
      `${shipment.items.length} equipo(s) — ${shipment.reason}`
    );

    logAction(req.user, 'crear', 'envio', shipment._id, shipment.folio, `Creó salida ${shipment.folio}: ${shipment.originOffice} → ${shipment.destinationOffice} para ${shipment.recipientName}`);

    res.status(201).json(shipment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id/transit', async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    if (shipment.status !== 'enviado') {
      return res.status(400).json({ message: 'Este envío ya no está en estatus "enviado"' });
    }
    shipment.status = 'en_transito';
    shipment.transitAt = new Date();
    await shipment.save();
    logAction(req.user, 'editar', 'envio', shipment._id, shipment.folio, `Marcó en tránsito la salida ${shipment.folio}`);
    res.json(shipment);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id/pdf', async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    const pdfData = await buildShipmentPdf(shipment);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Salida_${shipment.folio}.pdf"`);
    res.end(pdfData);
  } catch (err) {
    console.error('Error generando PDF de salida:', err);
    res.status(500).json({ message: 'Error al generar el PDF' });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const shipment = await Shipment.findByIdAndDelete(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    logAction(req.user, 'eliminar', 'envio', shipment._id, shipment.folio, `Eliminó la salida ${shipment.folio}`);
    res.json({ message: 'Envío eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
