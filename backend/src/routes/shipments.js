const router = require('express').Router();
const crypto = require('crypto');
const multer = require('multer');
const Shipment = require('../models/Shipment');
const Asset = require('../models/Asset');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { notifyTelegram } = require('../utils/telegram');
const { buildShipmentPdf, buildShipmentReceptionPdf } = require('../utils/shipmentPdf');
const { GERENTE_SISTEMAS_EMAIL } = require('../utils/pdfBranding');
const logAction = require('../utils/audit');

function generateFolio() {
  const year = new Date().getFullYear();
  const rand = crypto.randomBytes(3).toString('hex').toUpperCase();
  return `SAL-${year}-${rand}`;
}

// Firma reutilizable de destinatario — hoy solo Felipe (pedido explícito del
// usuario: "ÚNICAMENTE PARA LOS ENVÍOS A FELIPE"). `recipientName` es texto
// libre en Shipment (no hay referencia a Employee), así que se resuelve por
// correo corporativo — mismo patrón que GERENTE_SISTEMAS_EMAIL — y se
// compara contra el nombre de su ficha de Empleado.
const FELIPE_EMAIL = 'sistemas.4@selectshop.com.mx';

// Solo JPG/PNG: son los únicos formatos que pdfkit puede dibujar directo
// con doc.image() sin una conversión adicional (a diferencia de los
// adjuntos de tickets, esta imagen sí se incrusta dentro de un PDF).
const SIGNATURE_MIME = ['image/jpeg', 'image/png'];
const signatureUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    if (!SIGNATURE_MIME.includes(file.mimetype)) {
      return cb(new Error('La firma debe ser una foto en JPG o PNG'));
    }
    cb(null, true);
  },
});

// Sin acentos/mayúsculas para comparar nombres — "Felipe Gómez" (como puede
// estar capturado en Empleados) y "Felipe Gomez" (como alguien lo haya
// escrito al crear el envío) deben coincidir igual. Bug real encontrado: la
// comparación anterior era case-insensitive pero NO ignoraba acentos, así
// que un simple acento de más/de menos hacía que nunca se reconociera a
// Felipe como destinatario.
function normalizeName(s) {
  return (s || '').trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

// Si el destinatario de este envío es Felipe, regresa su ficha de Empleado
// (para saber si ya tiene firma guardada o hay que ofrecerle subir una);
// para cualquier otro destinatario regresa `null` — la función no hace
// nada especial para nadie más, a propósito.
async function getFelipeIfRecipient(recipientName) {
  const felipe = await Employee.findOne({ corporateEmails: FELIPE_EMAIL });
  if (!felipe) return null;
  if (normalizeName(recipientName) !== normalizeName(felipe.name)) return null;
  return felipe;
}

// Todos son admin, pero un envío sigue siendo "de quien lo creó" — pedido
// explícito: aunque cualquier admin puede VER la lista completa (para
// coordinarse), solo quien lo creó (o el Gerente de Sistemas, con
// visibilidad total) puede modificarlo/marcarlo/eliminarlo.
function canManageShipment(req, shipment) {
  if (req.user.email === GERENTE_SISTEMAS_EMAIL) return true;
  return !!shipment.sentBy && String(shipment.sentBy) === String(req.user.id);
}

// ── PÚBLICO (sin login) — para que el destinatario, que normalmente no
// tiene cuenta en el sistema, vea qué le mandaron y confirme la recepción
// con el link único que Sistemas le comparte por WhatsApp/correo. ─────────
router.get('/public/:token', async (req, res) => {
  try {
    const shipment = await Shipment.findOne({ confirmToken: req.params.token });
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    // Le dice al frontend si debe ofrecerle a quien confirma subir su firma
    // escaneada (solo Felipe, y solo si todavía no tiene una guardada) — así
    // el formulario público no necesita saber nada de esta regla por sí solo.
    const felipe = await getFelipeIfRecipient(shipment.recipientName);
    const needsSignatureUpload = !!felipe && !felipe.signatureImageData;
    res.json({ ...shipment.toObject(), needsSignatureUpload });
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

router.post('/public/:token/confirm', (req, res, next) => {
  signatureUpload.single('signatureImage')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la firma' });
    next();
  });
}, async (req, res) => {
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

    // Firma escaneada opcional (solo Felipe, ver getFelipeIfRecipient) — se
    // guarda en su ficha de Empleado para reutilizarse en todos sus envíos
    // futuros, no solo este. Si vuelve a subir una, se reemplaza la anterior.
    if (req.file) {
      const felipe = await getFelipeIfRecipient(shipment.recipientName);
      if (felipe) {
        felipe.signatureImageData = req.file.buffer;
        felipe.signatureImageMimeType = req.file.mimetype;
        felipe.signatureUploadedAt = new Date();
        await felipe.save();
      }
    }

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

// Capturar la firma de Felipe SIN depender de estar confirmando la
// recepción justo en ese momento — pedido explícito: poder habilitarlo en
// un envío que ya se hizo y ya se confirmó antes, para que quede guardada de
// una vez y el PRÓXIMO envío ya salga firmado (no hace falta esperar a un
// envío nuevo en curso). A diferencia de /confirm, esta ruta no toca el
// estatus del envío ni ningún otro dato — solo guarda la imagen en la ficha
// de Felipe, sin importar en qué estatus esté el envío desde el que se subió.
router.post('/public/:token/signature', (req, res, next) => {
  signatureUpload.single('signatureImage')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la firma' });
    next();
  });
}, async (req, res) => {
  try {
    const shipment = await Shipment.findOne({ confirmToken: req.params.token });
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    if (!req.file) return res.status(400).json({ message: 'Sube una foto de tu hoja firmada' });

    const felipe = await getFelipeIfRecipient(shipment.recipientName);
    if (!felipe) return res.status(400).json({ message: 'Esta función no aplica para este envío' });

    felipe.signatureImageData = req.file.buffer;
    felipe.signatureImageMimeType = req.file.mimetype;
    felipe.signatureUploadedAt = new Date();
    await felipe.save();

    res.json({ message: 'Firma guardada — tus próximos envíos ya saldrán firmados' });
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

router.get('/:id/pdf', async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    const gerenteSistemas = await Employee.findOne({ corporateEmails: GERENTE_SISTEMAS_EMAIL }).select('name');
    const pdfData = await buildShipmentPdf(shipment, gerenteSistemas?.name || null);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Salida_${shipment.folio}.pdf"`);
    res.end(pdfData);
  } catch (err) {
    console.error('Error generando PDF de salida:', err);
    res.status(500).json({ message: 'Error al generar el PDF' });
  }
});

// Formato aparte para quien RECIBE el equipo en destino — pedido explícito
// tras una confusión real con un mensajero que insistía en firmar la hoja
// equivocada: el mensajero firma el de salida (arriba), quien recibe firma
// este.
router.get('/:id/reception-pdf', async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    // Pedido explícito: este PDF solo tiene sentido una vez que de verdad se
    // confirmó la recepción (antes de eso no hay nombre/fecha/firma real que
    // mostrar en el documento).
    if (shipment.status !== 'recibido') {
      return res.status(400).json({ message: 'Este envío todavía no ha sido confirmado como recibido' });
    }
    const felipe = await getFelipeIfRecipient(shipment.recipientName);
    const signatureImage = felipe?.signatureImageData || null;
    const pdfData = await buildShipmentReceptionPdf(shipment, signatureImage);
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="Recepcion_${shipment.folio}.pdf"`);
    res.end(pdfData);
  } catch (err) {
    console.error('Error generando PDF de recepción:', err);
    res.status(500).json({ message: 'Error al generar el PDF' });
  }
});

router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const shipment = await Shipment.findById(req.params.id);
    if (!shipment) return res.status(404).json({ message: 'Envío no encontrado' });
    if (!canManageShipment(req, shipment)) {
      return res.status(403).json({ message: 'Solo quien creó este envío (o el Gerente de Sistemas) puede eliminarlo' });
    }
    await shipment.deleteOne();
    logAction(req.user, 'eliminar', 'envio', shipment._id, shipment.folio, `Eliminó la salida ${shipment.folio}`);
    res.json({ message: 'Envío eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
