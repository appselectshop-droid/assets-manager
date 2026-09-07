const router = require('express').Router();
const multer = require('multer');
const BecarioEntry = require('../models/BecarioEntry');
const BecarioTodo = require('../models/BecarioTodo');
const BecarioModule = require('../models/BecarioModule');
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
    const todos = await BecarioTodo.find().sort({ order: 1, done: 1, createdAt: -1 });
    res.json(todos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// dueDate/priority/subtasks — ampliado a "to-do app real" (2026-09-08,
// pedido explícito: "todo, hazlo muy padre"). `order` nuevo empieza en el
// mínimo actual - 1 para que lo recién creado quede arriba de la lista.
router.post('/todos', async (req, res) => {
  try {
    const { text, dueDate, priority, subtasks } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Escribe un pendiente.' });
    const lowest = await BecarioTodo.findOne().sort({ order: 1 }).select('order');
    const todo = await BecarioTodo.create({
      authorName: req.user.name,
      authorEmail: req.user.email,
      text: text.trim(),
      dueDate: dueDate || undefined,
      priority: ['alta', 'media', 'baja'].includes(priority) ? priority : 'media',
      subtasks: Array.isArray(subtasks) ? subtasks.filter((s) => s?.text?.trim()).map((s) => ({ text: s.text.trim(), done: !!s.done })) : [],
      order: (lowest?.order ?? 0) - 1,
    });
    res.status(201).json(todo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/todos/:id', async (req, res) => {
  try {
    const todo = await BecarioTodo.findById(req.params.id);
    if (!todo) return res.status(404).json({ message: 'No encontrado' });
    // Toggle simple (sin body) — mismo comportamiento de siempre. Con body,
    // permite editar fecha/prioridad/texto sin tocar el estado done.
    const { text, dueDate, priority } = req.body || {};
    if (text !== undefined || dueDate !== undefined || priority !== undefined) {
      if (text !== undefined && text.trim()) todo.text = text.trim();
      if (dueDate !== undefined) todo.dueDate = dueDate || undefined;
      if (priority !== undefined && ['alta', 'media', 'baja'].includes(priority)) todo.priority = priority;
    } else {
      todo.done = !todo.done;
      todo.completedAt = todo.done ? new Date() : undefined;
    }
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

// Subtareas — checklist dentro de un pendiente.
router.post('/todos/:id/subtasks', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Escribe una subtarea.' });
    const todo = await BecarioTodo.findById(req.params.id);
    if (!todo) return res.status(404).json({ message: 'No encontrado' });
    todo.subtasks.push({ text: text.trim() });
    await todo.save();
    res.status(201).json(todo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/todos/:id/subtasks/:subtaskId', async (req, res) => {
  try {
    const todo = await BecarioTodo.findById(req.params.id);
    const subtask = todo?.subtasks?.id(req.params.subtaskId);
    if (!todo || !subtask) return res.status(404).json({ message: 'No encontrado' });
    subtask.done = !subtask.done;
    await todo.save();
    res.json(todo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Reordenar (subir/bajar) — pedido explícito del usuario (2026-09-08): "to
// do app real". Sin drag-and-drop (no había ninguna librería de eso en el
// proyecto y agregar una nueva dependencia solo para esto no valía la
// pena) — se intercambia el `order` con el vecino inmediato en esa
// dirección dentro de la lista ya ordenada.
router.put('/todos/:id/move', async (req, res) => {
  try {
    const { direction } = req.body; // 'up' | 'down'
    const all = await BecarioTodo.find().sort({ order: 1, createdAt: -1 });
    const idx = all.findIndex((t) => t._id.toString() === req.params.id);
    if (idx === -1) return res.status(404).json({ message: 'No encontrado' });
    const swapIdx = direction === 'up' ? idx - 1 : idx + 1;
    if (swapIdx < 0 || swapIdx >= all.length) return res.json(all);
    const a = all[idx];
    const b = all[swapIdx];
    const aOrder = a.order;
    a.order = b.order;
    b.order = aOrder;
    await Promise.all([a.save(), b.save()]);
    const updated = await BecarioTodo.find().sort({ order: 1, createdAt: -1 });
    res.json(updated);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Ruta de aprendizaje (módulos) ────────────────────────────────────────
// Estilo AWS Skill Builder/curso — pedido explícito del usuario
// (2026-09-08): "todo, hazlo muy padre". Se siembra una plantilla inicial
// la primera vez que no hay ningún módulo — después cada quien puede
// agregar más temas a un módulo existente.
const DEFAULT_MODULES = [
  { title: 'Soporte a usuarios', icon: '🎧', order: 0, topics: [
    { text: 'Resolver tu primer ticket' },
    { text: 'Aprender a escalar un ticket' },
    { text: 'Conocer el SLA de respuesta' },
  ]},
  { title: 'Proveedores y plataformas', icon: '🔌', order: 1, topics: [
    { text: 'Aprender NOI' },
    { text: 'Aprender COI' },
    { text: 'Aprender SAE' },
  ]},
  { title: 'Infraestructura y mantenimiento', icon: '🛠️', order: 2, topics: [
    { text: 'Cableado básico' },
    { text: 'Mantenimiento preventivo de equipos' },
    { text: 'Inventario de activos' },
  ]},
  { title: 'Reportes y bitácora', icon: '📋', order: 3, topics: [
    { text: 'Publicar tu primera entrada en Bitácora' },
    { text: 'Completar tu primer reporte semanal' },
  ]},
];

router.get('/modules', async (req, res) => {
  try {
    let modules = await BecarioModule.find().sort({ order: 1 });
    if (modules.length === 0) {
      modules = await BecarioModule.insertMany(DEFAULT_MODULES);
    }
    res.json(modules);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/modules/:id/topics', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Escribe un tema.' });
    const mod = await BecarioModule.findById(req.params.id);
    if (!mod) return res.status(404).json({ message: 'No encontrado' });
    mod.topics.push({ text: text.trim() });
    await mod.save();
    res.status(201).json(mod);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/modules/:id/topics/:topicId', async (req, res) => {
  try {
    const mod = await BecarioModule.findById(req.params.id);
    const topic = mod?.topics?.id(req.params.topicId);
    if (!mod || !topic) return res.status(404).json({ message: 'No encontrado' });
    topic.done = !topic.done;
    topic.doneByName = topic.done ? req.user.name : '';
    topic.doneByEmail = topic.done ? req.user.email : '';
    topic.doneAt = topic.done ? new Date() : undefined;
    await mod.save();
    res.json(mod);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Progreso: XP, nivel, racha, insignias y mapa de calor ────────────────
// Estilo "Activities Board" de AWS Skill Builder + racha tipo Duolingo —
// pedido explícito del usuario (2026-09-07 y ampliado 2026-09-08: "todo,
// hazlo muy padre, que se vea muy futurista"). Todo se calcula al vuelo a
// partir de entradas, comentarios, pendientes completados y temas de la
// ruta de aprendizaje marcados — sin guardar XP/nivel por separado, para
// que nunca se desincronice de la actividad real.
const XP_PER_ENTRY = 10;
const XP_PER_TODO = 5;
const XP_PER_COMMENT = 2;
const XP_PER_TOPIC = 8;
const LEVELS = [
  { min: 0, title: 'Novato' },
  { min: 100, title: 'Aprendiz' },
  { min: 300, title: 'Especialista' },
  { min: 600, title: 'Experto' },
  { min: 1000, title: 'Maestro' },
];
function levelFor(xp) {
  let level = 1;
  let title = LEVELS[0].title;
  LEVELS.forEach((l, i) => {
    if (xp >= l.min) { level = i + 1; title = l.title; }
  });
  const next = LEVELS[level]; // siguiente umbral, o undefined si ya es el máximo
  return { level, title, nextLevelXp: next ? next.min : null };
}

router.get('/stats', async (req, res) => {
  try {
    const [entries, allTodos, modules] = await Promise.all([
      BecarioEntry.find().select('authorEmail authorName createdAt comments'),
      BecarioTodo.find().select('authorEmail authorName done completedAt'),
      BecarioModule.find().select('topics'),
    ]);
    const dayKey = (d) => new Date(d).toISOString().slice(0, 10);
    const byUser = {};
    const touch = (email, name) => {
      if (!byUser[email]) byUser[email] = { authorEmail: email, authorName: name, totalEntries: 0, xp: 0, dayCounts: new Map() };
      return byUser[email];
    };
    const bump = (u, date, xp) => {
      u.xp += xp;
      const k = dayKey(date);
      u.dayCounts.set(k, (u.dayCounts.get(k) || 0) + 1);
    };

    entries.forEach((e) => {
      const u = touch(e.authorEmail, e.authorName);
      u.totalEntries += 1;
      bump(u, e.createdAt, XP_PER_ENTRY);
      (e.comments || []).forEach((c) => bump(touch(c.authorEmail, c.authorName), c.createdAt, XP_PER_COMMENT));
    });
    allTodos.forEach((t) => {
      if (t.done && t.completedAt) bump(touch(t.authorEmail, t.authorName), t.completedAt, XP_PER_TODO);
    });
    modules.forEach((m) => {
      (m.topics || []).forEach((topic) => {
        if (topic.done && topic.doneAt && topic.doneByEmail) {
          bump(touch(topic.doneByEmail, topic.doneByName), topic.doneAt, XP_PER_TOPIC);
        }
      });
    });

    const today = new Date();
    const result = Object.values(byUser).map((u) => {
      let streak = 0;
      const cursor = new Date();
      while (u.dayCounts.has(dayKey(cursor))) {
        streak += 1;
        cursor.setDate(cursor.getDate() - 1);
      }
      const badges = [];
      if (u.totalEntries >= 1) badges.push({ icon: '🥉', label: 'Primera publicación' });
      if (u.totalEntries >= 10) badges.push({ icon: '💯', label: '10 publicaciones' });
      if (u.dayCounts.size >= 7) badges.push({ icon: '📅', label: 'Semana activa' });
      if (streak >= 5) badges.push({ icon: '🔥', label: `Racha de ${streak}` });

      // Mapa de calor — últimos 84 días (12 semanas), estilo GitHub/Duolingo.
      const heatmap = [];
      const cur = new Date(today);
      cur.setDate(cur.getDate() - 83);
      for (let i = 0; i < 84; i += 1) {
        const key = dayKey(cur);
        heatmap.push({ date: key, count: u.dayCounts.get(key) || 0 });
        cur.setDate(cur.getDate() + 1);
      }

      const lvl = levelFor(u.xp);
      return {
        authorEmail: u.authorEmail,
        authorName: u.authorName,
        totalEntries: u.totalEntries,
        currentStreak: streak,
        badges,
        xp: u.xp,
        level: lvl.level,
        levelTitle: lvl.title,
        nextLevelXp: lvl.nextLevelXp,
        heatmap,
      };
    });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
