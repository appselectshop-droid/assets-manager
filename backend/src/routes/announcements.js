const router = require('express').Router();
const multer = require('multer');
const sharp = require('sharp');
const Announcement = require('../models/Announcement');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');
const { uploadBuffer, downloadStream, deleteFile } = require('../utils/gridfs');

// Comprimir/redimensionar (2026-08-05) — pedido explícito del usuario: el
// carrusel de Mesa de Ayuda cargaba lento y con lag — los banners ya
// diseñados (Canva/PowerPoint) suelen venir sin optimizar para web (ej.
// 2000px de ancho, 700KB+). Se limita a un ancho razonable de pantalla y se
// recomprime antes de guardar — nunca se sube el archivo tal cual llegó.
async function optimizeImage(buffer, mimeType) {
  try {
    const img = sharp(buffer).resize({ width: 1600, withoutEnlargement: true });
    if (mimeType === 'image/png') return { buffer: await img.png({ compressionLevel: 9 }).toBuffer(), mimeType };
    if (mimeType === 'image/webp') return { buffer: await img.webp({ quality: 80 }).toBuffer(), mimeType };
    return { buffer: await img.jpeg({ quality: 82 }).toBuffer(), mimeType: 'image/jpeg' };
  } catch (_) {
    // Si algo falla al comprimir, se sube el original tal cual — nunca debe
    // bloquear la subida de un aviso por esto.
    return { buffer, mimeType };
  }
}

const ALLOWED_MIME = ['image/jpeg', 'image/png', 'image/webp'];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 8 * 1024 * 1024 }, // 8MB — de sobra para un banner ya comprimido
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan JPG, PNG o WEBP'));
    }
    cb(null, true);
  },
});

// Público — el carrusel de Mesa de Ayuda (sin login, ver MesaDeAyuda.jsx)
// también debe poder mostrarlo, mismo criterio que el resto del contenido
// "vitrina" de esa página.
router.get('/active', async (req, res) => {
  try {
    const items = await Announcement.find({ active: true }).sort({ order: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/image', async (req, res) => {
  try {
    const item = await Announcement.findById(req.params.id);
    if (!item) return res.status(404).end();
    res.setHeader('Content-Type', item.imageMimeType);
    downloadStream(item.imageId, 'announcements')
      .on('error', () => res.status(404).end())
      .pipe(res);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Administración — exclusivo de Administrador, mismo criterio que el resto
// de "eliminar"/gestión de catálogos del sistema (pedido explícito del
// usuario, 2026-08-04).
router.get('/', auth, adminOnly, async (req, res) => {
  try {
    const items = await Announcement.find().sort({ order: 1, createdAt: 1 });
    res.json(items);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', auth, adminOnly, (req, res, next) => {
  upload.single('image')(req, res, (err) => {
    if (err) return res.status(400).json({ message: err.message || 'No se pudo subir la imagen' });
    next();
  });
}, async (req, res) => {
  try {
    if (!req.file) return res.status(400).json({ message: 'Falta la imagen del aviso' });
    const { buffer, mimeType } = await optimizeImage(req.file.buffer, req.file.mimetype);
    const imageId = await uploadBuffer(buffer, req.file.originalname, mimeType, 'announcements');
    const count = await Announcement.countDocuments();
    const item = await Announcement.create({
      title: (req.body.title || '').trim(),
      imageId,
      imageMimeType: mimeType,
      imageFileName: req.file.originalname,
      order: count,
      createdByName: req.user.name,
    });
    logAction(req.user, 'crear', 'aviso', item._id, item.title || 'Aviso', `Creó el aviso "${item.title || 'sin título'}"`);
    res.status(201).json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', auth, adminOnly, async (req, res) => {
  try {
    const { title, active, order } = req.body;
    const update = {};
    if (title !== undefined) update.title = title;
    if (active !== undefined) update.active = active;
    if (order !== undefined) update.order = order;
    const item = await Announcement.findByIdAndUpdate(req.params.id, update, { new: true });
    if (!item) return res.status(404).json({ message: 'No encontrado' });
    logAction(req.user, 'editar', 'aviso', item._id, item.title || 'Aviso', `Editó el aviso "${item.title || 'sin título'}"`);
    res.json(item);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', auth, adminOnly, async (req, res) => {
  try {
    const item = await Announcement.findById(req.params.id);
    if (!item) return res.status(404).json({ message: 'No encontrado' });
    await deleteFile(item.imageId, 'announcements');
    await item.deleteOne();
    logAction(req.user, 'eliminar', 'aviso', item._id, item.title || 'Aviso', `Eliminó el aviso "${item.title || 'sin título'}"`);
    res.json({ message: 'Aviso eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
