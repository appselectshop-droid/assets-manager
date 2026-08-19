const router = require('express').Router();
const CalendarActivity = require('../models/CalendarActivity');
const auth = require('../middleware/auth');
const logAction = require('../utils/audit');

// Calendario del equipo de Sistemas — ver CalendarActivity.js para el
// contexto completo. Acceso: mismo criterio que ya usa Tickets (ver
// router.use en routes/tickets.js) — cualquiera con role:'admin' o el
// permiso canManageTickets (Atsiel/becario.sistemas) puede ENTRAR y VER el
// calendario; solo role:'admin' puede crear/editar/eliminar/completar
// (pedido explícito del usuario 2026-08-19: "todos menos Atsiel, el solo
// es lectura" — Atsiel es el único del equipo con canManageTickets sin
// ser admin, así que este criterio ya distingue exactamente a las
// personas correctas sin necesitar una lista de correos fija).
router.use(auth, (req, res, next) => {
  if (req.user.role === 'admin' || req.user.canManageTickets) return next();
  return res.status(403).json({ message: 'No tienes acceso al Calendario' });
});

function canWrite(req) {
  return req.user.role === 'admin';
}

// Calcula la siguiente fecha de una actividad recurrente a partir de la
// fecha vigente (no de "hoy") — así una actividad diaria que se completa
// tarde no se acumula ni se adelanta de más, siempre avanza un paso real
// desde la fecha que tenía.
function nextDueDate(current, recurrence) {
  const d = new Date(current);
  switch (recurrence?.type) {
    case 'diaria': d.setDate(d.getDate() + 1); return d;
    case 'semanal': d.setDate(d.getDate() + 7); return d;
    case 'mensual': d.setMonth(d.getMonth() + 1); return d;
    case 'personalizada': d.setDate(d.getDate() + (recurrence.intervalDays || 7)); return d;
    default: return null; // 'ninguna' — no se re-agenda
  }
}

router.get('/', async (req, res) => {
  try {
    const activities = await CalendarActivity.find({})
      .populate('assignedTo', 'name email')
      .sort({ dueDate: 1 });
    res.json(activities);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ message: 'Solo puedes ver el calendario, no crear actividades' });
    const { title, description, category, assignedTo, dueDate, recurrence, reminderOffsetDays } = req.body;
    if (!title?.trim()) return res.status(400).json({ message: 'Falta el título de la actividad' });
    if (!dueDate) return res.status(400).json({ message: 'Falta la fecha' });

    const activity = await CalendarActivity.create({
      title: title.trim(),
      description: (description || '').trim(),
      category: (category || '').trim(),
      assignedTo: Array.isArray(assignedTo) ? assignedTo : [],
      dueDate,
      recurrence: recurrence || { type: 'ninguna', intervalDays: null },
      reminderOffsetDays: reminderOffsetDays || 0,
      createdByName: req.user.name,
    });
    await activity.populate('assignedTo', 'name email');

    logAction(req.user, 'crear', 'actividad_calendario', activity._id, activity.title, `Creó la actividad "${activity.title}" del calendario`);
    res.status(201).json(activity);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ message: 'Solo puedes ver el calendario, no editar actividades' });
    const activity = await CalendarActivity.findById(req.params.id);
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });

    const { title, description, category, assignedTo, dueDate, status, recurrence, reminderOffsetDays } = req.body;
    if (title !== undefined) activity.title = title.trim();
    if (description !== undefined) activity.description = description.trim();
    if (category !== undefined) activity.category = category.trim();
    if (assignedTo !== undefined) activity.assignedTo = Array.isArray(assignedTo) ? assignedTo : [];
    if (dueDate !== undefined) activity.dueDate = dueDate;
    if (status !== undefined) activity.status = status;
    if (recurrence !== undefined) activity.recurrence = recurrence;
    if (reminderOffsetDays !== undefined) activity.reminderOffsetDays = reminderOffsetDays;

    await activity.save();
    await activity.populate('assignedTo', 'name email');
    logAction(req.user, 'editar', 'actividad_calendario', activity._id, activity.title, `Editó la actividad "${activity.title}" del calendario`);
    res.json(activity);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Marcar completada — pedido explícito del usuario: si la actividad es
// recurrente, en vez de quedarse en 'completada' para siempre, se
// re-agenda sola a la siguiente ocurrencia (mismo documento).
router.put('/:id/complete', async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ message: 'Solo puedes ver el calendario, no completar actividades' });
    const activity = await CalendarActivity.findById(req.params.id);
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });

    activity.completedAt = new Date();
    activity.completedByName = req.user.name;

    const next = nextDueDate(activity.dueDate, activity.recurrence);
    if (next) {
      activity.dueDate = next;
      activity.status = 'pendiente';
      activity.lastReminderSentAt = null;
    } else {
      activity.status = 'completada';
    }

    await activity.save();
    await activity.populate('assignedTo', 'name email');
    logAction(req.user, 'editar', 'actividad_calendario', activity._id, activity.title,
      next ? `Completó "${activity.title}" — se re-agendó para ${next.toLocaleDateString('es-MX')}` : `Completó "${activity.title}"`);
    res.json(activity);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (!canWrite(req)) return res.status(403).json({ message: 'Solo puedes ver el calendario, no eliminar actividades' });
    const activity = await CalendarActivity.findByIdAndDelete(req.params.id);
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });
    logAction(req.user, 'eliminar', 'actividad_calendario', activity._id, activity.title, `Eliminó la actividad "${activity.title}" del calendario`);
    res.json({ message: 'Actividad eliminada' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
