const router = require('express').Router();
const multer = require('multer');
const ResponsivaArchive = require('../models/ResponsivaArchive');
const auth = require('../middleware/auth');
const responsivaViewerOnly = require('../middleware/responsivaViewerOnly');
const { isErpLeader } = require('../config/permissions');

// El líder de ERP también puede eliminar (2026-09-03, pedido explícito del
// usuario: "dale permisos como al líder de infraestructura pero solo con
// respecto al ERP") — pero ESTA colección mezcla los 4 tipos de responsiva
// (activo/cuenta_gmail/cuenta_plataforma/cuenta_plataforma_erp), a
// diferencia de platformAccountsErp.js que ya es 100% ERP — por eso aquí
// sí hace falta acotar por `doc.type`, o el líder de ERP podría borrar la
// responsiva de una laptop o de un Gmail sin relación con ERP.
function canDelete(doc, user) {
  return user.role === 'admin' || (isErpLeader(user) && doc.type === 'cuenta_plataforma_erp');
}

const ALLOWED_SIGNED_MIME = ['application/pdf', 'image/jpeg', 'image/png', 'image/heic', 'image/heif'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — de sobra para una foto de celular o un escaneo
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_SIGNED_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan PDF, JPG, PNG o HEIC'));
    }
    cb(null, true);
  },
});

router.use(auth, responsivaViewerOnly);

// Solo admin, quien generó el documento, o el líder de ERP sobre una
// responsiva de cuenta ERP (2026-09-03, mismo criterio que canDelete
// arriba) puede administrar su copia firmada o descargar el original —
// aunque no la haya generado él mismo (ej. las que genera Yocelin Contla).
function canManage(doc, user) {
  return user.role === 'admin'
    || String(doc.generatedBy) === String(user.id)
    || (isErpLeader(user) && doc.type === 'cuenta_plataforma_erp');
}

// Lista el histórico sin traer el binario del PDF (serían decenas de MB en una sola respuesta).
// Los admins ven todo; el líder de ERP ve TODAS las responsivas de cuenta
// ERP (no solo las que él generó — 2026-09-03, para poder administrar/
// eliminar también las de su equipo, ej. las que genera Yocelin Contla);
// cualquier otro usuario con acceso solo ve lo que él mismo generó.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'admin'
      ? {}
      : isErpLeader(req.user)
        ? { type: 'cuenta_plataforma_erp' }
        : { generatedBy: req.user.id };
    const docs = await ResponsivaArchive.find(filter)
      .select('-pdfData -signedFileData')
      .populate('employee', 'employeeId name businessName office department active')
      .sort({ createdAt: -1 })
      .limit(1000);
    res.json(docs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Sube (o reemplaza) la copia ya firmada — foto o PDF escaneado del papel
// que se firmó a mano tras generar e imprimir el documento original.
router.post('/:id/signed', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir el archivo' });
    next();
  });
}, async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    if (!canManage(doc, req.user)) {
      return res.status(403).json({ message: 'Solo puedes subir la firmada de responsivas que tú mismo generaste' });
    }
    if (!req.file) return res.status(400).json({ message: 'Falta el archivo' });

    doc.signedFileData = req.file.buffer;
    doc.signedFileName = req.file.originalname;
    doc.signedFileMimeType = req.file.mimetype;
    doc.signedAt = new Date();
    doc.signedByName = req.user.name;
    doc.signedBy = req.user.id;
    await doc.save();

    res.json({ message: 'Responsiva firmada guardada', signedAt: doc.signedAt, signedByName: doc.signedByName });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id/signed/download', async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    if (!doc.signedFileData) return res.status(404).json({ message: 'Todavía no se ha subido la firmada' });
    if (!canManage(doc, req.user)) {
      return res.status(403).json({ message: 'Solo puedes ver la firmada de responsivas que tú mismo generaste' });
    }
    res.setHeader('Content-Type', doc.signedFileMimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${doc.signedFileName}"`);
    res.end(doc.signedFileData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Eliminar era exclusivo de Administrador (2026-08-04): antes bastaba
// haber generado tú mismo la responsiva (canManage), sin necesitar ser
// Administrador de verdad. Ampliado 2026-09-03 (ver canDelete arriba) para
// que el líder de ERP también pueda, solo sobre responsivas de cuenta ERP.
router.delete('/:id/signed', async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    if (!canDelete(doc, req.user)) {
      return res.status(403).json({ message: 'Acceso restringido a administradores o al líder de ERP (solo sus cuentas ERP)' });
    }
    doc.signedFileData = undefined;
    doc.signedFileName = '';
    doc.signedFileMimeType = '';
    doc.signedAt = undefined;
    doc.signedByName = '';
    doc.signedBy = undefined;
    await doc.save();
    res.json({ message: 'Firmada eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/download', async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    if (!canManage(doc, req.user)) {
      return res.status(403).json({ message: 'Solo puedes descargar responsivas que tú mismo generaste' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    res.end(doc.pdfData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Borrar del archivo — admin, o el líder de ERP solo sobre responsivas de
// cuenta ERP (ver canDelete arriba, 2026-09-03).
router.delete('/:id', async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    if (!canDelete(doc, req.user)) {
      return res.status(403).json({ message: 'Acceso restringido a administradores o al líder de ERP (solo sus cuentas ERP)' });
    }
    await doc.deleteOne();
    res.json({ message: 'Documento eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
