const router = require('express').Router();
const multer = require('multer');
const InternalApp = require('../models/InternalApp');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

const ALLOWED_DOC_MIME = [
  'application/pdf',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 }, // 20MB — de sobra para un manual
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_DOC_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan PDF, DOC o DOCX'));
    }
    cb(null, true);
  },
});

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  const apps = await InternalApp.find().select('-documentData').sort({ name: 1 });
  res.json(apps);
});

router.get('/:id', async (req, res) => {
  const app = await InternalApp.findById(req.params.id).select('-documentData');
  if (!app) return res.status(404).json({ message: 'Aplicación no encontrada' });
  res.json(app);
});

router.post('/', async (req, res) => {
  try {
    const { name, description, responsibleName, responsibleArea, notes } = req.body;
    if (!name?.trim()) return res.status(400).json({ message: 'Falta el nombre de la aplicación' });

    const app = await InternalApp.create({
      name: name.trim(),
      description: description || '',
      responsibleName: responsibleName || '',
      responsibleArea: responsibleArea || '',
      notes: notes || '',
      createdByName: req.user.name,
      createdBy: req.user.id,
    });
    logAction(req.user, 'crear', 'aplicacion_interna', app._id, app.name, `Agregó la aplicación interna "${app.name}" al catálogo`);

    const obj = app.toObject();
    delete obj.documentData;
    res.status(201).json(obj);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const app = await InternalApp.findById(req.params.id);
    if (!app) return res.status(404).json({ message: 'Aplicación no encontrada' });

    const { name, description, responsibleName, responsibleArea, notes, active } = req.body;
    if (name !== undefined) {
      if (!name.trim()) return res.status(400).json({ message: 'Falta el nombre de la aplicación' });
      app.name = name.trim();
    }
    if (description !== undefined) app.description = description;
    if (responsibleName !== undefined) app.responsibleName = responsibleName;
    if (responsibleArea !== undefined) app.responsibleArea = responsibleArea;
    if (notes !== undefined) app.notes = notes;
    if (active !== undefined) app.active = active;
    await app.save();
    logAction(req.user, 'editar', 'aplicacion_interna', app._id, app.name, `Editó la aplicación interna "${app.name}"`);

    const obj = app.toObject();
    delete obj.documentData;
    res.json(obj);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  const app = await InternalApp.findByIdAndDelete(req.params.id);
  if (!app) return res.status(404).json({ message: 'Aplicación no encontrada' });
  logAction(req.user, 'eliminar', 'aplicacion_interna', app._id, app.name, `Eliminó la aplicación interna "${app.name}" del catálogo`);
  res.json({ message: 'Aplicación eliminada' });
});

router.post('/:id/document', (req, res, next) => {
  upload.single('file')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir el documento' });
    next();
  });
}, async (req, res) => {
  try {
    const app = await InternalApp.findById(req.params.id);
    if (!app) return res.status(404).json({ message: 'Aplicación no encontrada' });
    if (!req.file) return res.status(400).json({ message: 'Falta el documento' });

    app.documentData = req.file.buffer;
    app.documentFileName = req.file.originalname;
    app.documentMimeType = req.file.mimetype;
    app.documentUploadedAt = new Date();
    await app.save();
    logAction(req.user, 'editar', 'aplicacion_interna', app._id, app.name, `Subió documentación para "${app.name}"`);

    res.json({ message: 'Documento guardado', documentFileName: app.documentFileName, documentUploadedAt: app.documentUploadedAt });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.get('/:id/document', async (req, res) => {
  const app = await InternalApp.findById(req.params.id);
  if (!app) return res.status(404).json({ message: 'Aplicación no encontrada' });
  if (!app.documentData) return res.status(404).json({ message: 'Todavía no se ha subido documentación' });
  res.setHeader('Content-Type', app.documentMimeType || 'application/octet-stream');
  res.setHeader('Content-Disposition', `inline; filename="${app.documentFileName}"`);
  res.end(app.documentData);
});

router.delete('/:id/document', async (req, res) => {
  const app = await InternalApp.findById(req.params.id);
  if (!app) return res.status(404).json({ message: 'Aplicación no encontrada' });
  app.documentData = undefined;
  app.documentFileName = '';
  app.documentMimeType = '';
  app.documentUploadedAt = undefined;
  await app.save();
  logAction(req.user, 'editar', 'aplicacion_interna', app._id, app.name, `Quitó la documentación de "${app.name}"`);
  res.json({ message: 'Documento eliminado' });
});

module.exports = router;
