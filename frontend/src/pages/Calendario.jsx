import { useEffect, useMemo, useState } from 'react';
import api from '../services/api';
import styles from './Tickets.module.css';

// Calendario del equipo de Sistemas — pedido explícito del usuario
// (2026-08-19): un tablero compartido de actividades pendientes para
// Miguel, Lilly, Felipe, Atsiel y Bruno, con recordatorios push+correo
// (esos se mandan en una fase aparte, ver backend/src/models/CalendarActivity.js
// — "primero el calendario, cron después", pedido explícito del usuario).
//
// Mismo criterio de acceso que ya usa Tickets: cualquiera con role:'admin'
// o canManageTickets puede ENTRAR; solo role:'admin' puede crear/editar/
// completar/eliminar (pedido explícito: "todos menos Atsiel, el solo es
// lectura" — Atsiel/becario.sistemas es el único de los 5 con
// canManageTickets sin ser admin).
const STATUS_COLUMNS = [
  { key: 'pendiente',   label: 'Pendiente',   accent: '#d97706' },
  { key: 'en_proceso',  label: 'En proceso',  accent: '#2563eb' },
  { key: 'completada',  label: 'Completada',  accent: '#16a34a' },
  { key: 'pausada',     label: 'Pausada',     accent: '#6b7280' },
];

const RECURRENCE_LABELS = {
  ninguna: '',
  diaria: '🔁 Diaria',
  semanal: '🔁 Semanal',
  mensual: '🔁 Mensual',
  personalizada: '🔁 Personalizada',
};

function initials(name) {
  return (name || '')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join('');
}

function fmtDate(d) {
  if (!d) return '—';
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' });
}

const emptyForm = {
  title: '', description: '', category: '', assignedTo: [], dueDate: '',
  recurrenceType: 'ninguna', intervalDays: '', reminderOffsetDays: 0, status: 'pendiente',
};

export default function Calendario() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const canWrite = user.role === 'admin';

  const [activities, setActivities] = useState([]);
  const [teamUsers, setTeamUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showModal, setShowModal] = useState(false);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);

  const load = () => {
    api.get('/calendar-activities')
      .then((res) => setActivities(res.data))
      .catch((err) => setError(err.response?.data?.message || 'No se pudo cargar el calendario'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
    // El picker de "Asignar a" solo lo necesita quien puede escribir —
    // GET /users es adminOnly, Atsiel (solo lectura) ni lo necesita ni
    // podría llamarlo.
    if (canWrite) {
      api.get('/users')
        .then((res) => setTeamUsers(res.data.filter((u) => u.role === 'admin' || u.canManageTickets)))
        .catch(() => {});
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const board = useMemo(() => {
    const out = {};
    STATUS_COLUMNS.forEach((c) => {
      out[c.key] = activities
        .filter((a) => a.status === c.key)
        .sort((a, b) => new Date(a.dueDate) - new Date(b.dueDate));
    });
    return out;
  }, [activities]);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setShowModal(true);
  };

  const openEdit = (a) => {
    setEditing(a);
    setForm({
      title: a.title,
      description: a.description || '',
      category: a.category || '',
      assignedTo: (a.assignedTo || []).map((u) => u._id),
      dueDate: a.dueDate ? new Date(a.dueDate).toISOString().slice(0, 10) : '',
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

  const handleComplete = async (a) => {
    try {
      const { data } = await api.put(`/calendar-activities/${a._id}/complete`);
      setActivities((prev) => prev.map((x) => (x._id === data._id ? data : x)));
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo completar la actividad');
    }
  };

  const handleDelete = async (a) => {
    if (!window.confirm(`¿Eliminar la actividad "${a.title}"?`)) return;
    try {
      await api.delete(`/calendar-activities/${a._id}`);
      setActivities((prev) => prev.filter((x) => x._id !== a._id));
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo eliminar la actividad');
    }
  };

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
          <button type="button" className={styles.btnPrimary} onClick={openCreate}>
            + Nueva actividad
          </button>
        )}
      </div>

      {error && <p className={styles.formError}>{error}</p>}

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <div className={styles.board}>
          {STATUS_COLUMNS.map((col) => (
            <div key={col.key} className={styles.column} style={{ '--col-accent': col.accent }}>
              <div className={styles.columnHeader}>
                <span className={styles.columnTitle}>{col.label}</span>
                <span className={styles.columnCount}>{board[col.key].length}</span>
              </div>
              <div className={styles.columnList}>
                {board[col.key].length === 0 ? (
                  <p className={styles.columnEmpty}>Sin actividades</p>
                ) : (
                  board[col.key].map((a) => {
                    const overdue = a.status === 'pendiente' && new Date(a.dueDate) < new Date();
                    return (
                      <div key={a._id} className={`${styles.ticketCard} ${overdue ? styles.ticketCardOverdue : ''}`}>
                        <div className={styles.cardTop}>
                          <span className={styles.cardFolio}>{a.category || 'General'}</span>
                          <div className={styles.cardBadges}>
                            {overdue && <span className={styles.cardBadge} title="Vencida">⏰</span>}
                            {a.recurrence?.type !== 'ninguna' && (
                              <span className={styles.cardBadge} title={RECURRENCE_LABELS[a.recurrence?.type]}>
                                {RECURRENCE_LABELS[a.recurrence?.type]}
                              </span>
                            )}
                          </div>
                        </div>
                        <p className={styles.cardSubject}>{a.title}</p>
                        {a.description && <p className={styles.modalHint} style={{ margin: 0 }}>{a.description}</p>}
                        <div className={styles.cardMeta}>
                          <div>
                            <p className={styles.cardEmployee}>{fmtDate(a.dueDate)}</p>
                          </div>
                          {(a.assignedTo || []).length > 0 && (
                            <div style={{ display: 'flex', gap: '0.25rem' }}>
                              {a.assignedTo.map((u) => (
                                <div key={u._id} className={styles.cardAvatar} title={u.name}>{initials(u.name)}</div>
                              ))}
                            </div>
                          )}
                        </div>
                        {canWrite && (
                          <div className={styles.cardFooter} style={{ gap: '0.4rem' }}>
                            {a.status !== 'completada' && (
                              <button type="button" className={styles.btnLink} onClick={() => handleComplete(a)}>✅ Completar</button>
                            )}
                            <button type="button" className={styles.btnLink} onClick={() => openEdit(a)}>✏️ Editar</button>
                            <button type="button" className={styles.btnLink} onClick={() => handleDelete(a)}>🗑️ Eliminar</button>
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          ))}
        </div>
      )}

      {showModal && (
        <div className={styles.overlay} onClick={() => !saving && setShowModal(false)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <span className={styles.modalIcon}>📅</span>
              <span className={styles.modalTitle}>{editing ? 'Editar actividad' : 'Nueva actividad'}</span>
              <button type="button" className={styles.closeBtn} onClick={() => setShowModal(false)}>✕</button>
            </div>
            <div className={styles.modalBody}>
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
                    {STATUS_COLUMNS.map((c) => <option key={c.key} value={c.key}>{c.label}</option>)}
                  </select>
                </div>
              )}
              {error && <p className={styles.formError}>{error}</p>}
              <div className={styles.modalActions}>
                <button type="button" className={styles.btnCancel} onClick={() => setShowModal(false)} disabled={saving}>Cancelar</button>
                <button type="button" className={styles.btnPrimary} onClick={handleSave} disabled={saving}>
                  {saving ? 'Guardando...' : 'Guardar'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
