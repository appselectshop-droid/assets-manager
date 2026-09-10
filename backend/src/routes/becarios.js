const router = require('express').Router();
const multer = require('multer');
const BecarioEntry = require('../models/BecarioEntry');
const BecarioTodo = require('../models/BecarioTodo');
const BecarioModule = require('../models/BecarioModule');
const User = require('../models/User');
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

// ── Pendientes (tareas asignables) ───────────────────────────────────────
// Reconstruido (2026-09-08) siguiendo el documento de referencia del
// usuario (Habitica/TalentLMS/ClickUp/TickTick): asignación entre personas
// (asignado_por/asignado_a), puntos fijos por prioridad, tareas diarias con
// racha y congelamiento. Solo el autor (o un admin) puede borrar.
const PRIORITY_POINTS = { alta: 20, media: 10, baja: 5 };
const TODO_REACTION_EMOJIS = ['⭐', '👍', '✅'];

function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}

// Semanal/mensual (2026-09-10, pedido explícito del usuario: "actividades
// diarias, semanales y mensuales") — mismo mecanismo de racha que 'diaria'
// (ver PUT /todos/:id más abajo), solo que agrupando por semana ISO o por
// mes en vez de por día. RECURRING_TYPES centraliza dónde aplica.
const RECURRING_TYPES = ['diaria', 'semanal', 'mensual'];

// Semana ISO 8601 (lunes a domingo, la semana que contiene el primer jueves
// del año es la semana 1) — mismo criterio que usan calendarios/hojas de
// cálculo, para que "esta semana" no dependa de en qué día caiga hoy.
function isoWeekKey(d) {
  const date = new Date(Date.UTC(new Date(d).getUTCFullYear(), new Date(d).getUTCMonth(), new Date(d).getUTCDate()));
  const dayNum = (date.getUTCDay() + 6) % 7; // lunes=0 ... domingo=6
  date.setUTCDate(date.getUTCDate() - dayNum + 3); // jueves de esa semana
  const firstThursday = new Date(Date.UTC(date.getUTCFullYear(), 0, 4));
  const weekNum = 1 + Math.round(((date - firstThursday) / 86400000 - 3 + ((firstThursday.getUTCDay() + 6) % 7)) / 7);
  return `${date.getUTCFullYear()}-W${String(weekNum).padStart(2, '0')}`;
}
function monthKey(d) {
  return new Date(d).toISOString().slice(0, 7);
}
// "Bucket" del período según el tipo de tarea — reemplaza a dayKey() cuando
// la tarea es semanal/mensual, sin tocar el criterio ya establecido de
// 'diaria'.
function periodKey(d, taskType) {
  if (taskType === 'semanal') return isoWeekKey(d);
  if (taskType === 'mensual') return monthKey(d);
  return dayKey(d);
}
// El período INMEDIATO ANTERIOR a hoy, según el tipo — para decidir si la
// racha sigue viva (se completó en el período anterior) o se rompió. Restar
// 7 días siempre cae en la semana ISO anterior; para mensual se resta un
// mes de calendario completo (respeta el desbordamiento de día, ej. 31 de
// marzo - 1 mes = último día de febrero).
function previousPeriodDate(taskType) {
  const now = new Date();
  if (taskType === 'semanal') return new Date(now.getTime() - 7 * 86400000);
  if (taskType === 'mensual') {
    // Se fija el día en 1 ANTES de restar el mes — restar un mes directo
    // sobre un día que no existe en el mes anterior (ej. 31 de marzo, 30 de
    // febrero no existe) hace que Date lo desborde hacia adelante (cae en
    // marzo otra vez, no en febrero). Solo se necesita el mes/año
    // correctos (monthKey() no usa el día), así que el día 1 siempre es
    // seguro.
    const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
    d.setUTCMonth(d.getUTCMonth() - 1);
    return d;
  }
  return new Date(now.getTime() - 86400000);
}

// Personas asignables — cualquiera con acceso al panel puede aparecer como
// "asignado_a" (el documento pide que el modelo soporte más de un mentor
// asignando, no solo el admin; esto ya lo permite sin cambios adicionales).
// Solo becarios reales (role:'viewer') pueden ser "asignado_a" — corrección
// explícita del usuario (2026-09-10): "me deja ponerles tareas a Felipe y
// Miguel y eso no, es a los becarios únicamente". Antes traía a CUALQUIERA
// con acceso al panel, incluidos los mentores (Miguel/Felipe/Lilly), que ya
// no deberían poder asignarse tareas entre ellos aquí — mismo criterio
// exacto que ya usa GET /becarios/stats para separar mentores de becarios.
router.get('/team', async (req, res) => {
  try {
    const team = await User.find({ canViewBecariosPanel: true, role: { $ne: 'admin' } }).select('name email -_id');
    res.json(team);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.get('/todos', async (req, res) => {
  try {
    const todos = await BecarioTodo.find().sort({ order: 1, done: 1, createdAt: -1 });
    // Una tarea recurrente (diaria/semanal/mensual) representa "hecho EN
    // ESTE período" — si quedó marcada como hecha en un período que ya
    // pasó, se corrige aquí (sin esperar un cron) para que el nuevo
    // período vuelva a aparecer como pendiente sin perder la racha.
    const stale = todos.filter((t) => RECURRING_TYPES.includes(t.taskType) && t.done && (!t.lastCompletedDate || periodKey(t.lastCompletedDate, t.taskType) !== periodKey(new Date(), t.taskType)));
    if (stale.length > 0) {
      await BecarioTodo.updateMany({ _id: { $in: stale.map((t) => t._id) } }, { $set: { done: false } });
      stale.forEach((t) => { t.done = false; });
    }
    res.json(todos);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// dueDate/prioridad/subtareas/asignación/tipo — `order` nuevo empieza en el
// mínimo actual - 1 para que lo recién creado quede arriba de la lista. Si
// no se manda asignado_a, se autoasigna a quien la crea (comportamiento de
// pendiente simple de siempre).
router.post('/todos', async (req, res) => {
  try {
    const { text, dueDate, priority, subtasks, assignedToName, assignedToEmail, taskType } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Escribe un pendiente.' });
    const validPriority = ['alta', 'media', 'baja'].includes(priority) ? priority : 'media';
    const lowest = await BecarioTodo.findOne().sort({ order: 1 }).select('order');
    const todo = await BecarioTodo.create({
      authorName: req.user.name,
      authorEmail: req.user.email,
      assignedToName: assignedToName || req.user.name,
      assignedToEmail: assignedToEmail || req.user.email,
      text: text.trim(),
      taskType: RECURRING_TYPES.includes(taskType) ? taskType : 'unica',
      dueDate: dueDate || undefined,
      priority: validPriority,
      points: PRIORITY_POINTS[validPriority],
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
    const { text, dueDate, priority } = req.body || {};

    // Con body: editar texto/fecha/prioridad sin tocar el estado done.
    if (text !== undefined || dueDate !== undefined || priority !== undefined) {
      if (text !== undefined && text.trim()) todo.text = text.trim();
      if (dueDate !== undefined) todo.dueDate = dueDate || undefined;
      if (priority !== undefined && PRIORITY_POINTS[priority] !== undefined) {
        todo.priority = priority;
        todo.points = PRIORITY_POINTS[priority];
      }
      await todo.save();
      return res.json(todo);
    }

    // Sin body: marcar/desmarcar completado.
    if (RECURRING_TYPES.includes(todo.taskType)) {
      // Racha con congelamiento — ver documento de referencia (Habitica
      // Dailies/TickTick): completar el período actual sube la racha si el
      // período anterior (ayer/semana pasada/mes pasado, según el tipo)
      // también se completó; si se saltó uno y hay congelamiento
      // disponible, se usa uno para no perderla; si no, la racha se
      // reinicia en 1. 'semanal'/'mensual' (2026-09-10) usan el mismo
      // mecanismo, solo cambia periodKey()/previousPeriodDate() de arriba.
      const today = periodKey(new Date(), todo.taskType);
      const doneToday = todo.lastCompletedDate && periodKey(todo.lastCompletedDate, todo.taskType) === today;
      if (!doneToday) {
        const previous = periodKey(previousPeriodDate(todo.taskType), todo.taskType);
        const lastKey = todo.lastCompletedDate ? periodKey(todo.lastCompletedDate, todo.taskType) : null;
        if (lastKey === previous) {
          todo.currentStreak += 1;
        } else if (lastKey && lastKey !== today && todo.freezesAvailable > 0) {
          todo.freezesAvailable -= 1;
          todo.currentStreak += 1;
        } else {
          todo.currentStreak = 1;
        }
        todo.maxStreak = Math.max(todo.maxStreak, todo.currentStreak);
        todo.lastCompletedDate = new Date();
        todo.completionLog.push(new Date());
        todo.done = true;
        todo.completedAt = new Date();
      } else {
        // Deshacer "hecho en este período" — resta la racha y lo quita del historial.
        todo.completionLog = todo.completionLog.filter((d) => periodKey(d, todo.taskType) !== today);
        todo.currentStreak = Math.max(0, todo.currentStreak - 1);
        todo.lastCompletedDate = todo.completionLog.length ? todo.completionLog[todo.completionLog.length - 1] : undefined;
        todo.done = false;
        todo.completedAt = undefined;
      }
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

// Retroalimentación por tarea — comentarios y reacción rápida (⭐/👍/✅),
// pedido explícito del documento de referencia: "el mentor recibe... y
// puede dejar un comentario y/o una reacción rápida desde la misma vista".
router.post('/todos/:id/comments', async (req, res) => {
  try {
    const { text } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ message: 'Escribe un comentario.' });
    const todo = await BecarioTodo.findById(req.params.id);
    if (!todo) return res.status(404).json({ message: 'No encontrado' });
    todo.comments.push({ authorName: req.user.name, authorEmail: req.user.email, text: text.trim() });
    await todo.save();
    res.status(201).json(todo);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/todos/:id/reactions', async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!TODO_REACTION_EMOJIS.includes(emoji)) return res.status(400).json({ message: 'Reacción inválida' });
    const todo = await BecarioTodo.findById(req.params.id);
    if (!todo) return res.status(404).json({ message: 'No encontrado' });
    const existingIdx = todo.reactions.findIndex((r) => r.authorEmail === req.user.email);
    const hadSameEmoji = existingIdx !== -1 && todo.reactions[existingIdx].emoji === emoji;
    if (existingIdx !== -1) todo.reactions.splice(existingIdx, 1);
    if (!hadSameEmoji) todo.reactions.push({ emoji, authorName: req.user.name, authorEmail: req.user.email });
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

// Anota cada módulo con el avance DE QUIEN PIDE (doneByMe, pctMine) — el
// checklist ya no es un booleano compartido (ver BecarioModule.js): cada
// quien marca su propio avance, y aquí se calcula el % de cada módulo desde
// el punto de vista de `viewerEmail`, no globalmente. `completedBy` se deja
// tal cual en la respuesta para que se pueda ver quién más ya lo completó.
function annotateModules(modules, viewerEmail) {
  return modules.map((m) => {
    const obj = m.toObject ? m.toObject() : m;
    const topics = obj.topics.map((t) => ({
      ...t,
      doneByMe: (t.completedBy || []).some((c) => c.email === viewerEmail),
    }));
    const doneCount = topics.filter((t) => t.doneByMe).length;
    const pctMine = topics.length > 0 ? Math.round((doneCount / topics.length) * 100) : 0;
    return { ...obj, topics, pctMine };
  });
}

router.get('/modules', async (req, res) => {
  try {
    let modules = await BecarioModule.find().sort({ order: 1 });
    if (modules.length === 0) {
      modules = await BecarioModule.insertMany(DEFAULT_MODULES);
    }
    res.json(annotateModules(modules, req.user.email));
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
    res.status(201).json(annotateModules([mod], req.user.email)[0]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Marca/desmarca el avance de QUIEN PIDE en ese tema — ya no un booleano
// compartido. Corrección real (2026-09-08) reportada por el usuario tras
// probarlo: "si Mariano marca un tema, se marca igual para Italo".
router.put('/modules/:id/topics/:topicId', async (req, res) => {
  try {
    const mod = await BecarioModule.findById(req.params.id);
    const topic = mod?.topics?.id(req.params.topicId);
    if (!mod || !topic) return res.status(404).json({ message: 'No encontrado' });
    const idx = topic.completedBy.findIndex((c) => c.email === req.user.email);
    if (idx !== -1) {
      topic.completedBy.splice(idx, 1);
    } else {
      topic.completedBy.push({ name: req.user.name, email: req.user.email, completedAt: new Date() });
    }
    await mod.save();
    res.json(annotateModules([mod], req.user.email)[0]);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// ── Progreso: puntos, insignia, racha y leaderboard ──────────────────────
// Reconstruido (2026-09-08) siguiendo el documento de referencia: puntos
// según prioridad de cada tarea completada (PRIORITY_POINTS de arriba) +
// puntos por cada día de una tarea 'diaria' completado (completionLog) +
// puntos por tema de la ruta de aprendizaje marcado — todo calculado al
// vuelo, sin guardar puntos por separado, para que nunca se desincronice.
const TOPIC_POINTS = 10;
const BADGE_THRESHOLDS = [
  { min: 500, icon: '👑', label: 'Leyenda' },
  { min: 200, icon: '🏆', label: 'Experto' },
  { min: 50, icon: '⭐', label: 'En camino' },
  { min: 0, icon: '🌱', label: 'Recién llegado' },
];
function badgeFor(points) {
  return BADGE_THRESHOLDS.find((b) => points >= b.min);
}

router.get('/stats', async (req, res) => {
  try {
    // Solo los becarios reales (role:'viewer') entran al panel de progreso/
    // leaderboard — un mentor con acceso temporal (ej. sistemas.3, mientras
    // prueba el panel) NO es un becario y no debería aparecer "compitiendo"
    // ahí ("yo sistemas.3 no soy becaria jajaja").
    const [allTodos, modules, team] = await Promise.all([
      BecarioTodo.find(),
      BecarioModule.find().select('topics'),
      User.find({ canViewBecariosPanel: true, role: { $ne: 'admin' } }).select('name email -_id'),
    ]);
    const becarioEmails = new Set(team.map((u) => u.email));
    const now = new Date();
    const weekAgo = new Date(now);
    weekAgo.setDate(weekAgo.getDate() - 6); // últimos 7 días, incluyendo hoy
    const monthAgo = new Date(now);
    monthAgo.setDate(monthAgo.getDate() - 29); // últimos 30 días

    const byUser = {};
    const touch = (email, name) => {
      if (!byUser[email]) byUser[email] = { authorEmail: email, authorName: name, pointsTotal: 0, pointsWeek: 0, pointsMonth: 0, dayCounts: new Map() };
      return byUser[email];
    };
    // Sembrar a todo el equipo desde /becarios/team ANTES de sumar nada —
    // corrección real (2026-09-08) reportada por el usuario: si nadie ha
    // completado todavía ninguna tarea, antes el panel de progreso y el
    // leaderboard desaparecían por completo en vez de mostrar 0 puntos.
    team.forEach((u) => touch(u.email, u.name));

    const bump = (u, date, points) => {
      u.pointsTotal += points;
      if (new Date(date) >= weekAgo) u.pointsWeek += points;
      if (new Date(date) >= monthAgo) u.pointsMonth += points;
      const k = dayKey(date);
      u.dayCounts.set(k, (u.dayCounts.get(k) || 0) + 1);
    };

    const streakByUser = {};
    allTodos.forEach((t) => {
      const email = t.assignedToEmail || t.authorEmail;
      const name = t.assignedToName || t.authorName;
      if (RECURRING_TYPES.includes(t.taskType)) {
        (t.completionLog || []).forEach((d) => bump(touch(email, name), d, t.points || 10));
        streakByUser[email] = Math.max(streakByUser[email] || 0, t.currentStreak || 0);
      } else if (t.done && t.completedAt) {
        bump(touch(email, name), t.completedAt, t.points || 10);
      }
    });
    // Puntos por tema de la ruta de aprendizaje — cada entrada de
    // completedBy es la finalización de UNA persona (ver BecarioModule.js).
    modules.forEach((m) => {
      (m.topics || []).forEach((topic) => {
        (topic.completedBy || []).forEach((c) => bump(touch(c.email, c.name), c.completedAt, TOPIC_POINTS));
      });
    });

    const today = new Date();
    // Descarta a cualquiera que no sea un becario real, aunque haya
    // aparecido por actividad propia (ej. un mentor probando el panel).
    let result = Object.values(byUser).filter((u) => becarioEmails.has(u.authorEmail)).map((u) => {
      // Mapa de calor — últimos 84 días (12 semanas), estilo GitHub/Duolingo.
      const heatmap = [];
      const cur = new Date(today);
      cur.setDate(cur.getDate() - 83);
      for (let i = 0; i < 84; i += 1) {
        const key = dayKey(cur);
        heatmap.push({ date: key, count: u.dayCounts.get(key) || 0 });
        cur.setDate(cur.getDate() + 1);
      }
      return {
        authorEmail: u.authorEmail,
        authorName: u.authorName,
        pointsTotal: u.pointsTotal,
        pointsWeek: u.pointsWeek,
        pointsMonth: u.pointsMonth,
        bestStreak: streakByUser[u.authorEmail] || 0,
        badge: badgeFor(u.pointsTotal),
        heatmap,
      };
    });

    // Leaderboard — ranking simple por puntos de la semana (documento:
    // "Vista simple con los dos becarios ordenados por puntos de la semana
    // o el mes").
    result = result.sort((a, b) => b.pointsWeek - a.pointsWeek).map((u, i) => ({ ...u, rank: i + 1 }));
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
