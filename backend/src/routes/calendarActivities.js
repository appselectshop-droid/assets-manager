const router = require('express').Router();
const CalendarActivity = require('../models/CalendarActivity');
const Ticket = require('../models/Ticket');
const User = require('../models/User');
const auth = require('../middleware/auth');
const logAction = require('../utils/audit');
const { sendPushToUser } = require('../utils/webPush');

// Único validador del reporte semanal del becario (2026-08-19, pedido
// explícito del usuario: "se vaya a Miguel para validación") — mismo
// correo/criterio de "una sola persona" que ya usa isVentasUser() en
// tickets.js, no un rol general.
const LIDER_INFRA_SOPORTE_EMAIL = 'lider.infra.soporte@selectshop.com.mx';

const REPORT_CRITERIOS = [
  'Cumplimiento de SLA',
  'Calidad de atención al usuario (calificaciones)',
  'Proactividad',
  'Cumplimiento de tareas asignadas',
  'Presentación y evidencia de las actividades',
];

// satisfactionRating es un enum de texto (CSAT), no un número — se mapea
// a 1-5 solo para poder promediarlo en los indicadores del reporte.
const RATING_TO_NUMBER = {
  'Extremadamente insatisfecho': 1,
  'Mayormente insatisfecho': 2,
  'Ni satisfecho ni insatisfecho': 3,
  'Mayormente satisfecho': 4,
  'Extremadamente satisfecho': 5,
};

function isBecarioAssignedTo(req, activity) {
  return req.user.role !== 'admin'
    && (activity.assignedTo || []).some((u) => String(u._id || u) === String(req.user.id));
}
function isValidador(req) {
  return req.user.email === LIDER_INFRA_SOPORTE_EMAIL;
}

// Semana que cierra en `dueDate` (el viernes de esa actividad): sábado
// anterior 00:00 a viernes 23:59:59, en UTC — mismo criterio "todo en
// UTC" que ya usa el calendario en el frontend, para no correr el día por
// el huso horario de México.
function weekWindow(dueDate) {
  const end = new Date(dueDate);
  end.setUTCHours(23, 59, 59, 999);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 6);
  start.setUTCHours(0, 0, 0, 0);
  return { start, end };
}

// Calcula solo — el becario NO llena esto a mano (pedido explícito del
// usuario tras preguntar "¿se llena solo o cómo?"): se saca de los
// tickets reales asignados a quien tenga esta actividad, tocados durante
// la semana de `activity.dueDate`.
async function computeReportMetrics(activity) {
  const ids = (activity.assignedTo || []).map((u) => u._id || u);
  if (ids.length === 0) return null;
  const { start, end } = weekWindow(activity.dueDate);
  const tickets = await Ticket.find({
    assignedTo: { $in: ids },
    $or: [
      { resolvedAt: { $gte: start, $lte: end } },
      { createdAt: { $gte: start, $lte: end } },
      { updatedAt: { $gte: start, $lte: end } },
    ],
  }).select('folio subject resolvedAt resolutionDueAt satisfactionRating escalated status createdAt employeeName');

  const withResolutionSla = tickets.filter((t) => t.resolvedAt && t.resolutionDueAt);
  const onTime = withResolutionSla.filter((t) => t.resolvedAt <= t.resolutionDueAt).length;
  const rated = tickets.filter((t) => t.satisfactionRating);
  const avgRating = rated.length
    ? Number((rated.reduce((s, t) => s + (RATING_TO_NUMBER[t.satisfactionRating] || 0), 0) / rated.length).toFixed(2))
    : null;

  return {
    ventana: { start, end },
    ticketsAtendidos: tickets.length,
    slaPct: withResolutionSla.length ? Math.round((onTime / withResolutionSla.length) * 100) : null,
    calificacionPromedio: avgRating,
    ticketsBajaCalificacion: rated.filter((t) => (RATING_TO_NUMBER[t.satisfactionRating] || 0) <= 3).length,
    ticketsEscalados: tickets.filter((t) => t.escalated).length,
    ticketsSinCalificar: tickets.filter((t) => ['resuelto', 'cerrado'].includes(t.status) && !t.satisfactionRating).length,
    tickets: tickets.map((t) => ({
      folio: t.folio,
      subject: t.subject,
      employeeName: t.employeeName,
      resolvedAt: t.resolvedAt,
      resolutionDueAt: t.resolutionDueAt,
      dentroDeSla: (t.resolvedAt && t.resolutionDueAt) ? t.resolvedAt <= t.resolutionDueAt : null,
      satisfactionRating: t.satisfactionRating,
      escalated: t.escalated,
      status: t.status,
    })),
  };
}

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

// ── Reporte semanal del becario ─────────────────────────────────────────
// Vive dentro de una actividad con reportType:'becario_semanal' (ver
// CalendarActivity.js). Los 3 endpoints de abajo tienen SU PROPIA capa de
// permisos, distinta al canWrite() general de arriba (admin-only): aquí
// el becario asignado puede escribir su parte aunque no sea admin, y solo
// Miguel (LIDER_INFRA_SOPORTE_EMAIL) puede validar, aunque sí sea admin
// cualquier otro (Lilly incluida).

router.get('/:id/report', async (req, res) => {
  try {
    const activity = await CalendarActivity.findById(req.params.id).populate('assignedTo', 'name email');
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });
    if (activity.reportType !== 'becario_semanal') {
      return res.status(400).json({ message: 'Esta actividad no tiene un reporte asociado' });
    }
    const metrics = await computeReportMetrics(activity);
    res.json({
      activity,
      metrics,
      criterios: REPORT_CRITERIOS,
      canFillBecario: isBecarioAssignedTo(req, activity),
      canValidate: isValidador(req),
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// El becario guarda/edita su parte (resumen, otras actividades, cursos,
// autoevaluación) — puede volver a guardar cuantas veces quiera mientras
// no esté 'validado'. `submit:true` en el body marca que ya la mandó a
// revisión (dispara el push a Miguel), sin eso solo queda como borrador.
router.put('/:id/report', async (req, res) => {
  try {
    const activity = await CalendarActivity.findById(req.params.id).populate('assignedTo', 'name email');
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });
    if (activity.reportType !== 'becario_semanal') {
      return res.status(400).json({ message: 'Esta actividad no tiene un reporte asociado' });
    }
    if (!isBecarioAssignedTo(req, activity)) {
      return res.status(403).json({ message: 'Solo el becario asignado puede llenar este reporte' });
    }
    if (activity.report.estado === 'validado') {
      return res.status(400).json({ message: 'Este reporte ya fue validado — ya no se puede editar' });
    }

    const { resumenSemana, otrasActividades, cursos, autoevaluacion, submit } = req.body;
    if (resumenSemana !== undefined) activity.report.resumenSemana = resumenSemana;
    if (otrasActividades !== undefined) activity.report.otrasActividades = otrasActividades;
    if (cursos !== undefined) activity.report.cursos = cursos;
    if (autoevaluacion !== undefined) activity.report.autoevaluacion = autoevaluacion;

    if (submit) {
      activity.report.estado = 'llenado';
      activity.report.enviadoAt = new Date();
      activity.report.enviadoPorName = req.user.name;
    }

    await activity.save();
    logAction(req.user, 'editar', 'actividad_calendario', activity._id, activity.title,
      submit ? `Envió a validación el reporte semanal de "${activity.title}"` : `Guardó avances del reporte semanal de "${activity.title}"`);

    if (submit) {
      const miguel = await User.findOne({ email: LIDER_INFRA_SOPORTE_EMAIL });
      if (miguel) {
        sendPushToUser(miguel._id, {
          title: `Reporte semanal listo para validar`,
          body: `${req.user.name} envió su reporte de "${activity.title}"`,
          url: `/calendario`,
        }).catch(() => {});
      }
    }

    res.json(activity);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

// Miguel valida — llena la evaluación del supervisor y confirma. Validar
// = completar: se re-agenda la actividad para la semana siguiente (mismo
// mecanismo que PUT /:id/complete), pero antes de resetear `report` se
// guarda una copia completa en `reportHistory` — a propósito, para poder
// ver varias semanas seguidas y juzgar mejora real de desempeño (pedido
// explícito del usuario), no se pierde como con el resto de recurrentes.
router.put('/:id/report/validate', async (req, res) => {
  try {
    const activity = await CalendarActivity.findById(req.params.id).populate('assignedTo', 'name email');
    if (!activity) return res.status(404).json({ message: 'Actividad no encontrada' });
    if (activity.reportType !== 'becario_semanal') {
      return res.status(400).json({ message: 'Esta actividad no tiene un reporte asociado' });
    }
    if (!isValidador(req)) {
      return res.status(403).json({ message: 'Solo Miguel García puede validar este reporte' });
    }
    if (activity.report.estado !== 'llenado') {
      return res.status(400).json({ message: 'El becario todavía no envía este reporte a validación' });
    }

    const { criterios, semaforo, comentarioGeneral } = req.body;
    activity.report.evaluacionSupervisor = { criterios: criterios || [], semaforo: semaforo || '', comentarioGeneral: comentarioGeneral || '' };
    activity.report.estado = 'validado';
    activity.report.validadoAt = new Date();
    activity.report.validadoPorName = req.user.name;

    const metrics = await computeReportMetrics(activity);
    activity.reportHistory.push({
      weekOf: activity.dueDate,
      resumenSemana: activity.report.resumenSemana,
      otrasActividades: activity.report.otrasActividades,
      cursos: activity.report.cursos,
      autoevaluacion: activity.report.autoevaluacion,
      metrics,
      evaluacionSupervisor: activity.report.evaluacionSupervisor,
      enviadoAt: activity.report.enviadoAt,
      enviadoPorName: activity.report.enviadoPorName,
      validadoAt: activity.report.validadoAt,
      validadoPorName: activity.report.validadoPorName,
    });

    activity.completedAt = new Date();
    activity.completedByName = req.user.name;
    const next = nextDueDate(activity.dueDate, activity.recurrence);
    if (next) {
      activity.dueDate = next;
      activity.status = 'pendiente';
      activity.lastReminderSentAt = null;
      // Reporte en blanco para la semana que arranca — la semana que se
      // acaba de validar ya quedó a salvo en reportHistory arriba.
      activity.report = {
        estado: 'pendiente', resumenSemana: '', otrasActividades: [], cursos: [],
        autoevaluacion: { logros: '', dificultades: '', plan: '' },
        enviadoAt: null, enviadoPorName: '',
        evaluacionSupervisor: { criterios: [], semaforo: '', comentarioGeneral: '' },
        validadoAt: null, validadoPorName: '',
      };
    } else {
      activity.status = 'completada';
    }

    await activity.save();
    logAction(req.user, 'editar', 'actividad_calendario', activity._id, activity.title, `Validó el reporte semanal de "${activity.title}"`);

    (activity.assignedTo || []).forEach((u) => {
      sendPushToUser(u._id, {
        title: `Tu reporte semanal fue validado`,
        body: `Miguel validó el reporte de "${activity.title}"`,
        url: `/calendario`,
      }).catch(() => {});
    });

    res.json(activity);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
