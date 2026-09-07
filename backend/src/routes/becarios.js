const router = require('express').Router();
const multer = require('multer');
const BecarioEntry = require('../models/BecarioEntry');
const BecarioTodo = require('../models/BecarioTodo');
const auth = require('../middleware/auth');
const becariosPanelOnly = require('../middleware/becariosPanelOnly');

router.use(auth, becariosPanelOnly);

// Los adjuntos (fotos/archivos de evidencia) no se necesitan en el listado
// del feed — mismo criterio que LIST_EXCLUDE_FIELDS en assets.js/tickets.js:
// el binario pesa, el feed solo necesita saber cuántos adjuntos trae cada
// entrada para mostrar la miniatura, y pide cada uno aparte.
const LIST_EXCLUDE_FIELDS = '-attachments.data';

const ALLOWED_MIME = [
  'image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp',
  'application/pdf',
];
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 15 * 1024 * 1024, files: 5 },
  fileFilter: (req, file, cb) => {
    if (!ALLOWED_MIME.includes(file.mimetype)) {
      return cb(new Error('Solo se aceptan imágenes (JPG, PNG, HEIC, WEBP) o PDF'));
    }
    cb(null, true);
  },
});

const REACTION_EMOJIS = ['👍', '✅', '⚠️'];

// Feed completo, más reciente primero.
router.get('/', async (req, res) => {
  try {
    const entries = await BecarioEntry.find().select(LIST_EXCLUDE_FIELDS).sort({ createdAt: -1 });
    res.json(entries);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', upload.array('attachments', 5), async (req, res) => {
  try {
    const { body } = req.body;
    if (!body || !body.trim()) return res.status(400).json({ message: 'Escribe algo antes de publicar.' });
    const attachments = (req.files || []).map((f) => ({
      data: f.buffer,
      mimeType: f.mimetype,
      fileName: f.originalname || '',
    }));
    const entry = await BecarioEntry.create({
      authorName: req.user.name,
      authorEmail: req.user.email,
      body: body.trim(),
      attachments,
    });
    const { attachments: _omit, ...safe } = entry.toObject();
    res.status(201).json({ ...safe, attachments: entry.attachments.map((a) => ({ _id: a._id, mimeType: a.mimeType, fileName: a.fileName })) });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Solo el autor (o un administrador) puede borrar su propia entrada.
router.delete('/:id', async (req, res) => {
  try {
    const entry = await BecarioEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'No encontrada' });
    if (entry.authorEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Solo quien la publicó puede borrarla' });
    }
    await entry.deleteOne();
    res.json({ message: 'Eliminada' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/:id/attachments/:attachmentId', async (req, res) => {
  try {
    const entry = await BecarioEntry.findById(req.params.id);
    const att = entry?.attachments?.id(req.params.attachmentId);
    if (!att) return res.status(404).json({ message: 'Adjunto no encontrado' });
    res.setHeader('Content-Type', att.mimeType || 'application/octet-stream');
    res.setHeader('Content-Disposition', `inline; filename="${att.fileName || 'archivo'}"`);
    res.end(att.data);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/:id/comments', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Escribe un comentario.' });
    const entry = await BecarioEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'No encontrada' });
    entry.comments.push({ authorName: req.user.name, authorEmail: req.user.email, text: text.trim() });
    await entry.save();
    res.status(201).json(entry.comments[entry.comments.length - 1]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Reacción rápida tipo toggle: si ya tenías esa reacción puesta, la quita;
// si tenías otra, la cambia; nunca acumula más de una reacción por persona.
router.post('/:id/reactions', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ message: 'Reacción inválida' });
    const entry = await BecarioEntry.findById(req.params.id);
    if (!entry) return res.status(404).json({ message: 'No encontrada' });
    const existingIdx = entry.reactions.findIndex((r) => r.authorEmail === req.user.email);
    const hadSameEmoji = existingIdx !== -1 && entry.reactions[existingIdx].emoji === emoji;
    if (existingIdx !== -1) entry.reactions.splice(existingIdx, 1);
    if (!hadSameEmoji) entry.reactions.push({ emoji, authorName: req.user.name, authorEmail: req.user.email });
    await entry.save();
    res.json(entry.reactions);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Pendientes (to-do) ──────────────────────────────────────────────────
// Lista compartida — pedido explícito del usuario (2026-09-07): "ayúdame a
// que sea interactivo... tal vez algo como to-do". Cualquiera con acceso al
// panel puede marcar/desmarcar cualquier pendiente (accountability entre
// los dos becarios), pero solo el autor (o un admin) puede borrarlo.
router.get('/todos', async (req, res) => {
  try {
    const todos = await BecarioTodo.find().sort({ done: 1, createdAt: -1 });
    res.json(todos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/todos', async (req, res) => {
  try {
    const { text, category } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Escribe un pendiente.' });
    const todo = await BecarioTodo.create({
      authorName: req.user.name,
      authorEmail: req.user.email,
      text: text.trim(),
      category: category === 'reporte_semanal' ? 'reporte_semanal' : 'general',
    });
    res.status(201).json(todo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Reinicia el reporte semanal (desmarca todo, sin borrar nada) — pedido
// explícito del usuario (2026-09-07): el reporte se repite cada viernes,
// así que al cerrar la semana se vuelve a dejar listo para la siguiente.
router.put('/todos/reporte-semanal/reset', async (req, res) => {
  try {
    await BecarioTodo.updateMany({ category: 'reporte_semanal' }, { $set: { done: false }, $unset: { completedAt: '' } });
    const todos = await BecarioTodo.find({ category: 'reporte_semanal' });
    res.json(todos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.put('/todos/:id', async (req, res) => {
  try {
    const todo = await BecarioTodo.findById(req.params.id);
    if (!todo) return res.status(404).json({ message: 'No encontrado' });
    todo.done = !todo.done;
    todo.completedAt = todo.done ? new Date() : undefined;
    await todo.save();
    res.json(todo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/todos/:id', async (req, res) => {
  try {
    const todo = await BecarioTodo.findById(req.params.id);
    if (!todo) return res.status(404).json({ message: 'No encontrado' });
    if (todo.authorEmail !== req.user.email && req.user.role !== 'admin') {
      return res.status(403).json({ message: 'Solo quien lo creó puede borrarlo' });
    }
    await todo.deleteOne();
    res.json({ message: 'Eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// ── Progreso: racha, total de publicaciones e insignias ─────────────────
// Estilo "Activities Board" de AWS Skill Builder — pedido explícito del
// usuario (2026-09-07), para que el panel se sienta menos "plano". Todo se
// calcula al vuelo a partir de entradas + pendientes completados, sin
// guardar nada nuevo por separado: la racha es días de calendario
// consecutivos (hasta hoy) con al menos 1 entrada o 1 pendiente completado.
router.get('/stats', async (req, res) => {
  try {
    const [entries, doneTodos] = await Promise.all([
      BecarioEntry.find().select('authorEmail authorName createdAt'),
      BecarioTodo.find({ done: true }).select('authorEmail authorName completedAt'),
    ]);
    const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
    const byUser = {};
    const touch = (email, name) => {
      if (!byUser[email]) byUser[email] = { authorEmail: email, authorName: name, totalEntries: 0, days: new Set() };
      return byUser[email];
    };
    entries.forEach((e) => {
      const u = touch(e.authorEmail, e.authorName);
      u.totalEntries += 1;
      u.days.add(dayKey(e.createdAt));
    });
    doneTodos.forEach((t) => {
      if (!t.completedAt) return;
      touch(t.authorEmail, t.authorName).days.add(dayKey(t.completedAt));
    });

    const result = Object.values(byUser).map((u) => {
      let streak = 0;
      const cursor = new Date();
      while (u.days.has(dayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      const badges = [];
      if (u.totalEntries >= 1) badges.push({ icon: '🥉', label: 'Primera publicación' });
      if (u.totalEntries >= 10) badges.push({ icon: '💯', label: '10 publicaciones' });
      if (u.days.size >= 7) badges.push({ icon: '📅', label: 'Semana activa' });
      if (streak >= 5) badges.push({ icon: '🔥', label: `Racha de ${streak}` });
      return { authorEmail: u.authorEmail, authorName: u.authorName, totalEntries: u.totalEntries, currentStreak: streak, badges };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
