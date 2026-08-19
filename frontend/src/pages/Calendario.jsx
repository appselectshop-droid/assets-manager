import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import styles from './Tickets.module.css';
import cal from './Calendario.module.css';
import ReporteSemanalModal from '../components/ReporteSemanalModal';
import useEmployeeCatalog from '../hooks/useEmployeeCatalog';

// Calendario del equipo de Sistemas — pedido explícito del usuario
// (2026-08-19): un tablero compartido de actividades pendientes para
// Miguel, Lilly, Felipe, Atsiel y Bruno, con recordatorios push+correo
// (esos se mandan en una fase aparte, ver backend/src/models/CalendarActivity.js
// — "primero el calendario, cron después", pedido explícito del usuario).
//
// Vista: calendario mensual estilo Google Calendar (pedido explícito del
// usuario, 2026-08-19, tras ver una primera versión en tablero Kanban:
// "no me gusta estilo kanban... quiero un calendario estilo google donde
// se ponen las actividades a realizar no un trello") — cada actividad se
// pinta en el día de su `dueDate`; una recurrente solo aparece UNA vez, en
// la ocurrencia vigente (se re-agenda sola al completarse, ver
// PUT /:id/complete en el backend, no se listan ocurrencias futuras).
//
// Mismo criterio de acceso que ya usa Tickets: cualquiera con role:'admin'
// o canManageTickets puede ENTRAR; solo role:'admin' puede crear/editar/
// completar/eliminar (pedido explícito: "todos menos Atsiel, el solo es
// lectura").
const STATUS_LABELS = { pendiente: 'Pendiente', en_proceso: 'En proceso', completada: 'Completada', pausada: 'Pausada' };
const STATUS_COLORS = { pendiente: '#d97706', en_proceso: '#2563eb', completada: '#16a34a', pausada: '#6b7280' };
const RECURRENCE_LABELS = { ninguna: 'Ninguna (única vez)', diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual', personalizada: 'Personalizada' };
const MESES = ['enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio', 'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre'];
const DIAS = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

// Todo en UTC a propósito, de principio a fin: un <input type="date">
// entrega/recibe "YYYY-MM-DD" tal cual, sin hora ni huso — si se mezclara
// con Date normal en huso local (México, UTC-6), una medianoche UTC se ve
// como "el día anterior a las 6pm" y las actividades se pintarían un día
// antes de su fecha real. Construir y leer todo con getUTC*/Date.UTC
// evita ese corrimiento sin necesitar ninguna librería de fechas.
function utcDate(y, m, d) { return new Date(Date.UTC(y, m, d)); }
function dateKey(d) {
  const dt = new Date(d);
  return `${dt.getUTCFullYear()}-${String(dt.getUTCMonth() + 1).padStart(2, '0')}-${String(dt.getUTCDate()).padStart(2, '0')}`;
}
function todayUtc() {
  const n = new Date();
  return utcDate(n.getFullYear(), n.getMonth(), n.getDate());
}

const emptyForm = {
  title: '', description: '', category: '', assignedTo: [], dueDate: '', hora: '', sucursal: [],
  recurrenceType: 'ninguna', intervalDays: '', reminderOffsetDays: 0, status: 'pendiente',
};

export default function Calendario() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canWrite = user.role === 'admin';
  // Mismo catálogo de Oficinas/Sucursales que ya usa Empleados (pedido
  // explícito del usuario: "elegir una o varias de las que ya tenemos en
  // el catálogo... por ejemplo para empleados") — sin inventar una lista
  // nueva ni dejarlo texto libre.
  const oficinaOptions = useEmployeeCatalog('oficina');

  const [activities, setActivities] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [monthCursor, setMonthCursor] = useState(() => { const t = todayUtc(); return utcDate(t.getUTCFullYear(), t.getUTCMonth(), 1); });
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  // Sucursal ahora es un desplegable (2026-08-19, pedido explícito del
  // usuario: "que sea despegable, no así como lo tienes" — la lista de
  // checkboxes en línea, igual que "Asignar a") — mismas opciones
  // (`toggleSucursal`), solo cambia cómo se presentan.
  const [sucursalDropdownOpen, setSucursalDropdownOpen] = useState(false);
  // Actividades con reportType:'becario_semanal' (2026-08-19) abren el
  // Reporte Semanal en vez del modal genérico de editar — ver
  // ReporteSemanalModal.jsx.
  const [reportActivityId, setReportActivityId] = useState(null);
  // Vista "actividades del día" (2026-08-19, pedido explícito del
  // usuario): clic en un día con actividades ya no abre directo "crear" —
  // primero muestra qué hay ese día, con opción de agregar otra. Un día
  // vacío sigue yendo directo a "crear" (sin este paso de en medio).
  const [dayViewDate, setDayViewDate] = useState(null);

  useEffect(() => {
    api.get('/calendar-activities')
      .then((res) => setActivities(res.data))
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el calendario'))
      .finally(() => setLoading(false));
    if (canWrite) {
      api.get('/users')
        .then((res) => setTeamUsers(res.data.filter((u) => u.role === 'admin' || u.canManageTickets)))
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const activitiesByDate = useMemo(() => {
    const map = {};
    activities.forEach((a) => {
      const key = dateKey(a.dueDate);
      (map[key] = map[key] || []).push(a);
    });
    return map;
  }, [activities]);

  // Recuadro lateral (2026-08-19, pedido explícito del usuario): todas
  // las actividades semanales y mensuales, sin horarios ni fechas — solo
  // el nombre, para ver de un vistazo qué se repite sin tener que ir
  // navegando mes por mes buscándolas.
  const dailyActivities = useMemo(() => activities.filter((a) => a.recurrence?.type === 'diaria'), [activities]);
  const weeklyActivities = useMemo(() => activities.filter((a) => a.recurrence?.type === 'semanal'), [activities]);
  const monthlyActivities = useMemo(() => activities.filter((a) => a.recurrence?.type === 'mensual'), [activities]);

  const gridDays = useMemo(() => {
    const startWeekday = monthCursor.getUTCDay();
    const gridStart = utcDate(monthCursor.getUTCFullYear(), monthCursor.getUTCMonth(), 1 - startWeekday);
    return Array.from({ length: 42 }, (_, i) => utcDate(gridStart.getUTCFullYear(), gridStart.getUTCMonth(), gridStart.getUTCDate() + i));
  }, [monthCursor]);

  const goPrevMonth = () => setMonthCursor((m) => utcDate(m.getUTCFullYear(), m.getUTCMonth() - 1, 1));
  const goNextMonth = () => setMonthCursor((m) => utcDate(m.getUTCFullYear(), m.getUTCMonth() + 1, 1));
  const goToday = () => { const t = todayUtc(); setMonthCursor(utcDate(t.getUTCFullYear(), t.getUTCMonth(), 1)); };

  const openCreate = (presetDate) => {
    setEditing(null);
    setForm({ ...emptyForm, dueDate: presetDate ? dateKey(presetDate) : '' });
    setSucursalDropdownOpen(false);
    setShowModal(true);
  };

  const openDetail = (a) => {
    if (a.reportType === 'becario_semanal') {
      setReportActivityId(a._id);
      return;
    }
    setEditing(a);
    setSucursalDropdownOpen(false);
    setForm({
      title: a.title,
      description: a.description || '',
      category: a.category || '',
      assignedTo: (a.assignedTo || []).map((u) => u._id),
      dueDate: dateKey(a.dueDate),
      hora: a.hora || '',
      sucursal: a.sucursal || [],
      recurrenceType: a.recurrence?.type || 'ninguna',
      intervalDays: a.recurrence?.intervalDays || '',
      reminderOffsetDays: a.reminderOffsetDays || 0,
      status: a.status,
    });
    setShowModal(true);
  };

  const toggleAssignee = (id) => {
    setForm((f) => ({
      ...f,
      assignedTo: f.assignedTo.includes(id) ? f.assignedTo.filter((x) => x !== id) : [...f.assignedTo, id],
    }));
  };

  const toggleSucursal = (name) => {
    setForm((f) => ({
      ...f,
      sucursal: f.sucursal.includes(name) ? f.sucursal.filter((x) => x !== name) : [...f.sucursal, name],
    }));
  };

  const handleSave = async () => {
    if (!form.title.trim() || !form.dueDate) {
      setError('Falta el título o la fecha');
      return;
    }
    setSaving(true);
    setError('');
    const payload = {
      title: form.title,
      description: form.description,
      category: form.category,
      assignedTo: form.assignedTo,
      dueDate: form.dueDate,
      hora: form.hora,
      sucursal: form.sucursal,
      recurrence: {
        type: form.recurrenceType,
        intervalDays: form.recurrenceType === 'personalizada' ? Number(form.intervalDays) || null : null,
      },
      reminderOffsetDays: Number(form.reminderOffsetDays) || 0,
      status: form.status,
    };
    try {
      if (editing) {
        const { data } = await api.put(`/calendar-activities/${editing._id}`, payload);
        setActivities((prev) => prev.map((a) => (a._id === data._id ? data : a)));
      } else {
        const { data } = await api.post('/calendar-activities', payload);
        setActivities((prev) => [...prev, data]);
      }
      setShowModal(false);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo guardar la actividad');
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    try {
      const { data } = await api.put(`/calendar-activities/${editing._id}/complete`);
      setActivities((prev) => prev.map((x) => (x._id === data._id ? data : x)));
      setShowModal(false);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo completar la actividad');
    }
  };

  const handleDelete = async () => {
    if (!window.confirm(`¿Eliminar la actividad "${editing.title}"?`)) return;
    try {
      await api.delete(`/calendar-activities/${editing._id}`);
      setActivities((prev) => prev.filter((x) => x._id !== editing._id));
      setShowModal(false);
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar la actividad');
    }
  };

  const today = todayUtc();

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>📅</div>
          <div>
            <h1 className={styles.title}>Calendario</h1>
            <p className={styles.subtitle}>
              Actividades planeadas del equipo de Sistemas — recordatorios push y correo próximamente.
            </p>
          </div>
        </div>
        {canWrite && (
          <button type="button" className={styles.btnPrimary} onClick={() => openCreate(null)}>
            + Nueva actividad
          </button>
        )}
      </div>

      {error && <p className={styles.formError}>{error}</p>}

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <div className={cal.layoutRow}>
          <aside className={cal.sidebar}>
            <p className={cal.sidebarTitle}>🔁 Diarios</p>
            {dailyActivities.length === 0 ? (
              <p className={cal.sidebarEmpty}>Sin actividades diarias</p>
            ) : (
              <ul className={cal.sidebarList}>
                {dailyActivities.map((a) => (
                  <li key={a._id} onClick={() => openDetail(a)}>{a.title}</li>
                ))}
              </ul>
            )}
            <p className={cal.sidebarTitle}>🔁 Semanales</p>
            {weeklyActivities.length === 0 ? (
              <p className={cal.sidebarEmpty}>Sin actividades semanales</p>
            ) : (
              <ul className={cal.sidebarList}>
                {weeklyActivities.map((a) => (
                  <li key={a._id} onClick={() => openDetail(a)}>
                    {a.reportType === 'becario_semanal' ? '📋 ' : ''}{a.title}
                  </li>
                ))}
              </ul>
            )}
            <p className={cal.sidebarTitle}>🔁 Mensuales</p>
            {monthlyActivities.length === 0 ? (
              <p className={cal.sidebarEmpty}>Sin actividades mensuales</p>
            ) : (
              <ul className={cal.sidebarList}>
                {monthlyActivities.map((a) => (
                  <li key={a._id} onClick={() => openDetail(a)}>{a.title}</li>
                ))}
              </ul>
            )}
          </aside>

          <div className={cal.calendarMain}>
          <div className={cal.monthNav}>
            <span className={cal.monthTitle}>{MESES[monthCursor.getUTCMonth()]} {monthCursor.getUTCFullYear()}</span>
            <div className={cal.monthNavBtns}>
              <button type="button" className={cal.navBtn} onClick={goPrevMonth}>← Anterior</button>
              <button type="button" className={cal.navBtn} onClick={goToday}>Hoy</button>
              <button type="button" className={cal.navBtn} onClick={goNextMonth}>Siguiente →</button>
            </div>
          </div>

          <div className={cal.legend}>
            {Object.entries(STATUS_LABELS).map(([key, label]) => (
              <span key={key}><span className={cal.legendDot} style={{ background: STATUS_COLORS[key] }} />{label}</span>
            ))}
          </div>

          <div className={cal.grid}>
            {DIAS.map((d) => <div key={d} className={cal.weekdayCell}>{d}</div>)}
            {gridDays.map((day) => {
              const key = dateKey(day);
              const dayActivities = activitiesByDate[key] || [];
              const isOtherMonth = day.getUTCMonth() !== monthCursor.getUTCMonth();
              const isToday = key === dateKey(today);
              const visible = dayActivities.slice(0, 3);
              const extra = dayActivities.length - visible.length;
              return (
                <div
                  key={key}
                  className={`${cal.dayCell} ${isOtherMonth ? cal.dayOtherMonth : ''} ${isToday ? cal.dayToday : ''}`}
                  onClick={() => (dayActivities.length > 0 ? setDayViewDate(day) : canWrite && openCreate(day))}
                >
                  <span className={cal.dayNumber}>
                    {isToday ? <span className={cal.dayTodayNumber}>{day.getUTCDate()}</span> : day.getUTCDate()}
                  </span>
                  {visible.map((a) => {
                    const overdue = a.status === 'pendiente' && new Date(a.dueDate) < new Date();
                    return (
                      <span
                        key={a._id}
                        className={`${cal.chip} ${overdue ? cal.chipOverdue : ''}`}
                        style={{ background: STATUS_COLORS[a.status] }}
                        title={[a.title, a.hora, ...(a.sucursal || [])].filter(Boolean).join(' — ')}
                        onClick={(e) => { e.stopPropagation(); openDetail(a); }}
                      >
                        {a.reportType === 'becario_semanal' ? '📋 ' : ''}{a.title}
                      </span>
                    );
                  })}
                  {extra > 0 && <span className={cal.moreChip}>+{extra} más</span>}
                </div>
              );
            })}
          </div>
          </div>
        </div>
      )}

      {showModal && (
        <div className={styles.overlay} onClick={() => !saving && setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}>📅</span>
              <span className={styles.modalTitle}>{editing ? (canWrite ? 'Editar actividad' : 'Actividad') : 'Nueva actividad'}</span>
              <button type="button" className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {!canWrite && editing ? (
                <>
                  <div className={styles.field}><label>Título</label><p>{form.title}</p></div>
                  {form.description && <div className={styles.field}><label>Descripción</label><p>{form.description}</p></div>}
                  <div className={styles.field}><label>Categoría</label><p>{form.category || '—'}</p></div>
                  <div className={styles.field}><label>Fecha</label><p>{form.dueDate}</p></div>
                  <div className={styles.field}><label>Hora</label><p>{form.hora || 'Todo el día'}</p></div>
                  <div className={styles.field}><label>Sucursal</label><p>{form.sucursal.join(', ') || '—'}</p></div>
                  <div className={styles.field}><label>Asignado a</label><p>{editing.assignedTo?.map((u) => u.name).join(', ') || '—'}</p></div>
                  <div className={styles.field}><label>Repetición</label><p>{RECURRENCE_LABELS[form.recurrenceType]}</p></div>
                  <div className={styles.field}><label>Estatus</label><p>{STATUS_LABELS[form.status]}</p></div>
                </>
              ) : (
                <>
                  <div className={styles.field}>
                    <label>Título</label>
                    <input className={styles.input} value={form.title} onChange={(e) => setForm({ ...form, title: e.target.value })} autoFocus />
                  </div>
                  <div className={styles.field}>
                    <label>Descripción</label>
                    <textarea className={styles.input} rows={2} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label>Categoría</label>
                    <input className={styles.input} value={form.category} onChange={(e) => setForm({ ...form, category: e.target.value })} placeholder="Ej. Soporte, Infraestructura, Cursos..." />
                  </div>
                  <div className={styles.field}>
                    <label>Fecha</label>
                    <input type="date" className={styles.input} value={form.dueDate} onChange={(e) => setForm({ ...form, dueDate: e.target.value })} />
                  </div>
                  <div className={styles.field}>
                    <label>Hora</label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: '0.35rem', fontSize: '0.8rem', fontWeight: 500, marginBottom: '0.3rem' }}>
                      <input
                        type="checkbox"
                        checked={!form.hora}
                        onChange={(e) => setForm({ ...form, hora: e.target.checked ? '' : '09:00' })}
                      />
                      Todo el día (sin hora fija)
                    </label>
                    {!!form.hora && (
                      <input type="time" className={styles.input} value={form.hora} onChange={(e) => setForm({ ...form, hora: e.target.value })} />
                    )}
                  </div>
                  <div className={styles.field} style={{ position: 'relative' }}>
                    <label>Sucursal (una o varias)</label>
                    <button
                      type="button"
                      className={styles.input}
                      style={{ textAlign: 'left', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}
                      onClick={() => setSucursalDropdownOpen((o) => !o)}
                    >
                      <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {form.sucursal.length > 0 ? form.sucursal.join(', ') : 'Selecciona sucursal(es)...'}
                      </span>
                      <span>{sucursalDropdownOpen ? '▲' : '▼'}</span>
                    </button>
                    {sucursalDropdownOpen && (
                      <>
                        <div className={cal.dropdownBackdrop} onClick={() => setSucursalDropdownOpen(false)} />
                        <div className={cal.dropdownPanel}>
                          {oficinaOptions.length === 0 ? (
                            <p className={styles.modalHint} style={{ margin: '0.5rem' }}>Sin sucursales en el catálogo (Catálogos de Empleados → Oficinas).</p>
                          ) : (
                            oficinaOptions.map((o) => (
                              <label key={o} className={cal.dropdownOption}>
                                <input type="checkbox" checked={form.sucursal.includes(o)} onChange={() => toggleSucursal(o)} />
                                {o}
                              </label>
                            ))
                          )}
                        </div>
                      </>
                    )}
                  </div>
                  <div className={styles.field}>
                    <label>Asignar a</label>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
                      {teamUsers.map((u) => (
                        <label key={u._id} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem', fontSize: '0.82rem', fontWeight: 500 }}>
                          <input type="checkbox" checked={form.assignedTo.includes(u._id)} onChange={() => toggleAssignee(u._id)} />
                          {u.name}
                        </label>
                      ))}
                    </div>
                  </div>
                  <div className={styles.field}>
                    <label>Repetición</label>
                    <select className={styles.input} value={form.recurrenceType} onChange={(e) => setForm({ ...form, recurrenceType: e.target.value })}>
                      <option value="ninguna">Ninguna (única vez)</option>
                      <option value="diaria">Diaria</option>
                      <option value="semanal">Semanal</option>
                      <option value="mensual">Mensual</option>
                      <option value="personalizada">Personalizada (cada N días)</option>
                    </select>
                  </div>
                  {form.recurrenceType === 'personalizada' && (
                    <div className={styles.field}>
                      <label>Repetir cada (días)</label>
                      <input type="number" min="1" className={styles.input} value={form.intervalDays} onChange={(e) => setForm({ ...form, intervalDays: e.target.value })} />
                    </div>
                  )}
                  <div className={styles.field}>
                    <label>Recordatorio (días antes de la fecha)</label>
                    <input type="number" min="0" className={styles.input} value={form.reminderOffsetDays} onChange={(e) => setForm({ ...form, reminderOffsetDays: e.target.value })} />
                    <p className={styles.modalHint}>El envío del recordatorio (push + correo) todavía no está activo — llega en una fase aparte.</p>
                  </div>
                  {editing && (
                    <div className={styles.field}>
                      <label>Estatus</label>
                      <select className={styles.input} value={form.status} onChange={(e) => setForm({ ...form, status: e.target.value })}>
                        {Object.entries(STATUS_LABELS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                      </select>
                    </div>
                  )}
                </>
              )}

              {error && <p className={styles.formError}>{error}</p>}

              <div className={styles.modalActions}>
                {canWrite && editing && (
                  <>
                    <button type="button" className={styles.btnDanger} onClick={handleDelete} disabled={saving}>Eliminar</button>
                    {editing.status !== 'completada' && (
                      <button type="button" className={styles.btnCancel} onClick={handleComplete} disabled={saving}>✅ Completar</button>
                    )}
                  </>
                )}
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)} disabled={saving}>Cerrar</button>
                {canWrite && (
                  <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                    {saving ? 'Guardando...' : 'Guardar'}
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {reportActivityId && (
        <ReporteSemanalModal
          activityId={reportActivityId}
          onClose={() => setReportActivityId(null)}
          onUpdated={(updated) => setActivities((prev) => prev.map((a) => (a._id === updated._id ? updated : a)))}
        />
      )}

      {dayViewDate && (
        <div className={styles.overlay} onClick={() => setDayViewDate(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}>📅</span>
              <span className={styles.modalTitle}>
                {dayViewDate.getUTCDate()} de {MESES[dayViewDate.getUTCMonth()]} {dayViewDate.getUTCFullYear()}
              </span>
              <button type="button" className={styles.closeBtn} onClick={() => setDayViewDate(null)}>✕</button>
            </div>
            <div className={styles.modalBody}>
              {(activitiesByDate[dateKey(dayViewDate)] || []).map((a) => (
                <div
                  key={a._id}
                  className={cal.dayViewItem}
                  onClick={() => { setDayViewDate(null); openDetail(a); }}
                >
                  <span className={cal.legendDot} style={{ background: STATUS_COLORS[a.status] }} />
                  <span>{a.reportType === 'becario_semanal' ? '📋 ' : ''}{a.title}</span>
                  {(a.hora || (a.sucursal || []).length > 0) && (
                    <span className={cal.dayViewMeta}>{[a.hora, ...(a.sucursal || [])].filter(Boolean).join(' — ')}</span>
                  )}
                </div>
              ))}
              {canWrite && (
                <button
                  type="button"
                  className={styles.btnPrimary}
                  style={{ marginTop: '0.75rem' }}
                  onClick={() => { const d = dayViewDate; setDayViewDate(null); openCreate(d); }}
                >
                  + Agregar actividad
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
