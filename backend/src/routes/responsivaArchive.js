const router = require('express').Router();
const multer = require('multer');
const ResponsivaArchive = require('../models/ResponsivaArchive');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const responsivaViewerOnly = require('../middleware/responsivaViewerOnly');

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

// Solo admin o quien generó el documento puede administrar su copia firmada
// (mismo criterio que ya se usaba para descargar el original).
function canManage(doc, user) {
  return user.role === 'admin' || String(doc.generatedBy) === String(user.id);
}

// Lista el histórico sin traer el binario del PDF (serían decenas de MB en una sola respuesta).
// Los admins ven todo; cualquier otro usuario con acceso solo ve lo que él mismo generó.
router.get('/', async (req, res) => {
  try {
    const filter = req.user.role === 'admin' ? {} : { generatedBy: req.user.id };
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

router.delete('/:id/signed', async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findById(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    if (!canManage(doc, req.user)) {
      return res.status(403).json({ message: 'Solo puedes quitar la firmada de responsivas que tú mismo generaste' });
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
    if (req.user.role !== 'admin' && String(doc.generatedBy) !== String(req.user.id)) {
      return res.status(403).json({ message: 'Solo puedes descargar responsivas que tú mismo generaste' });
    }
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${doc.fileName}"`);
    res.end(doc.pdfData);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Borrar del archivo queda reservado a administradores.
router.delete('/:id', adminOnly, async (req, res) => {
  try {
    const doc = await ResponsivaArchive.findByIdAndDelete(req.params.id);
    if (!doc) return res.status(404).json({ message: 'Documento no encontrado' });
    res.json({ message: 'Documento eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
