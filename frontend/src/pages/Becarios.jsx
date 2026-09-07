import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import ImageLightbox from '../components/ImageLightbox';
import ReporteSemanalModal from '../components/ReporteSemanalModal';
import PdfViewerModal from '../components/PdfViewerModal';
import usePdfViewer from '../hooks/usePdfViewer';
import styles from './Becarios.module.css';

// Bitácora de becarios — pedido explícito del usuario (2026-09-05 → 2026-09-08):
// empezó como un feed simple ("busca algo más didáctico donde puedan subir
// cosas") y terminó rediseñada por completo ("todo, hazlo muy padre, que se
// vea muy futurista") combinando 3 cosas que pidió por separado:
//   1) Ruta de aprendizaje estilo curso (AWS Skill Builder) — módulos con
//      temas que se marcan, cada uno con su % de avance.
//   2) Progreso tipo app de hábitos (Duolingo) — XP, nivel, racha con
//      mapa de calor de actividad de las últimas 12 semanas.
//   3) To-do app real (Todoist/Google Tasks) — prioridad, fecha límite,
//      subtareas, vistas Hoy/Semana/Atrasadas, subir/bajar en la lista.
// Esta página se compromete a un solo look oscuro/neón a propósito (no se
// diseñó una variante clara) — es la decisión de diseño que pidió el
// usuario, no un olvido.
const REACTIONS = ['👍', '✅', '⚠️'];
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const PRIORITY_CONFIG = {
  alta: { label: 'Alta', icon: '🔴' },
  media: { label: 'Media', icon: '🟡' },
  baja: { label: 'Baja', icon: '🟢' },
};
const TODO_FILTERS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'atrasadas', label: 'Atrasadas' },
  { key: 'todas', label: 'Todas' },
];

function formatDate(d) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
function formatDueDate(d) {
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' });
}
function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

// Miniatura de un adjunto — imágenes se piden como blob (mismo patrón que
// AssetThumbnail.jsx); los PDF se piden al tocarlos y se abren en el visor
// embebido (usePdfViewer, mismo patrón que Responsivas/Solicitudes) — las
// rutas de adjuntos requieren sesión, un <a href> directo no manda el token.
function Attachment({ entryId, att, onOpenImage, onOpenPdf }) {
  const [url, setUrl] = useState(null);
  const [loadingPdf, setLoadingPdf] = useState(false);
  const isImage = IMAGE_MIME.includes(att.mimeType);

  useEffect(() => {
    if (!isImage) return;
    let objectUrl;
    let cancelled = false;
    api.get(`/becarios/${entryId}/attachments/${att._id}`, { responseType: 'blob' })
      .then(({ data }) => { if (!cancelled) { objectUrl = URL.createObjectURL(data); setUrl(objectUrl); } })
      .catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [entryId, att._id, isImage]);

  if (isImage) {
    return url
      ? <img src={url} alt="" className={styles.attachmentThumb} onClick={() => onOpenImage(url)} />
      : <div className={styles.attachmentThumb} />;
  }

  const openPdf = async () => {
    setLoadingPdf(true);
    try {
      const { data } = await api.get(`/becarios/${entryId}/attachments/${att._id}`, { responseType: 'blob' });
      onOpenPdf(new Blob([data], { type: 'application/pdf' }), att.fileName || 'archivo');
    } catch {
      alert('No se pudo abrir el archivo');
    } finally {
      setLoadingPdf(false);
    }
  };
  return (
    <button type="button" className={styles.attachmentFile} onClick={openPdf} disabled={loadingPdf}>
      📄 {att.fileName || 'archivo'}
    </button>
  );
}

// Acceso directo al reporte semanal real (el de Calendario, con métricas de
// tickets/autoevaluación/evaluación del supervisor) — pedido explícito del
// usuario (2026-09-07): "debería aparecer en Bitácora, no en Calendario".
// No se duplica nada: reusa el mismo ReporteSemanalModal y los mismos
// endpoints de /calendar-activities, solo se le da un atajo desde aquí.
const REPORTE_ESTADO_LABELS = {
  pendiente: '📝 Sin llenar',
  llenado: '📤 Enviado, esperando validación',
  validado: '✅ Validado',
};
function MyWeeklyReportCard({ activity, onOpen }) {
  if (!activity) return null;
  return (
    <button type="button" className={styles.reportCard} onClick={onOpen}>
      <span className={styles.reportCardIcon}>📋</span>
      <span className={styles.reportCardText}>
        <span className={styles.reportCardTitle}>Mi reporte semanal</span>
        <span className={styles.reportCardStatus}>{REPORTE_ESTADO_LABELS[activity.report?.estado] || 'Ver reporte'}</span>
      </span>
      <span className={styles.reportCardArrow}>→</span>
    </button>
  );
}

// Mapa de calor de actividad — 12 semanas, estilo GitHub/Duolingo. `data` ya
// viene ordenado del backend (día más viejo primero), 84 entradas exactas.
function Heatmap({ data }) {
  const weeks = [];
  for (let i = 0; i < data.length; i += 7) weeks.push(data.slice(i, i + 7));
  const maxCount = Math.max(1, ...data.map((d) => d.count));
  const levelFor = (count) => {
    if (count === 0) return 0;
    const ratio = count / maxCount;
    if (ratio > 0.75) return 4;
    if (ratio > 0.5) return 3;
    if (ratio > 0.25) return 2;
    return 1;
  };
  return (
    <div className={styles.heatmap}>
      {weeks.map((week, wi) => (
        <div key={wi} className={styles.heatmapCol}>
          {week.map((d) => (
            <div
              key={d.date}
              className={`${styles.heatmapCell} ${styles[`heatLevel${levelFor(d.count)}`]}`}
              title={`${d.date}: ${d.count} actividad${d.count === 1 ? '' : 'es'}`}
            />
          ))}
        </div>
      ))}
    </div>
  );
}

// Panel de progreso — XP, nivel, racha con llama, insignias y mapa de calor.
// Estilo AWS Skill Builder (Activities Board) + Duolingo (racha/XP) —
// pedido explícito del usuario. Todo lo calcula el backend (GET /becarios/stats).
function ProgressBoard({ stats }) {
  if (stats.length === 0) return null;
  return (
    <div className={styles.progressBoard}>
      {stats.map((s) => {
        const pct = s.nextLevelXp ? Math.min(100, Math.round((s.xp / s.nextLevelXp) * 100)) : 100;
        return (
          <div key={s.authorEmail} className={styles.progressCard}>
            <div className={styles.progressTop}>
              <div className={styles.avatar}>{initials(s.authorName)}</div>
              <div className={styles.progressInfo}>
                <span className={styles.authorName}>{s.authorName}</span>
                <span className={styles.levelTag}>Nivel {s.level} · {s.levelTitle}</span>
              </div>
              <div className={styles.streakBadge} title={`Racha de ${s.currentStreak} días`}>
                <span className={styles.streakFlame}>🔥</span>
                <span className={styles.streakNum}>{s.currentStreak}</span>
              </div>
            </div>

            <div className={styles.xpBarWrap}>
              <div className={styles.xpBar}><div className={styles.xpBarFill} style={{ width: `${pct}%` }} /></div>
              <span className={styles.xpLabel}>
                {s.xp} XP{s.nextLevelXp ? ` · faltan ${s.nextLevelXp - s.xp} para subir de nivel` : ' · nivel máximo'}
              </span>
            </div>

            <Heatmap data={s.heatmap} />

            {s.badges.length > 0 && (
              <div className={styles.badgesRow}>
                {s.badges.map((b) => (
                  <span key={b.label} className={styles.badge} title={b.label}>{b.icon} {b.label}</span>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Ruta de aprendizaje — estilo curso (AWS Skill Builder): módulos con temas
// que se marcan, cada uno con su barra de progreso. Pedido explícito del
// usuario (2026-09-08): "todo, hazlo muy padre".
function LearningPath({ modules, onToggleTopic, onAddTopic }) {
  const [collapsed, setCollapsed] = useState({});
  const [addingTo, setAddingTo] = useState(null);
  const [newTopicText, setNewTopicText] = useState('');

  if (modules.length === 0) return null;

  const submitTopic = (e, moduleId) => {
    e.preventDefault();
    if (!newTopicText.trim()) return;
    onAddTopic(moduleId, newTopicText.trim());
    setNewTopicText('');
    setAddingTo(null);
  };

  return (
    <div className={styles.pathBox}>
      <h2 className={styles.sectionTitle}>🎓 Ruta de aprendizaje</h2>
      <div className={styles.moduleList}>
        {modules.map((m) => {
          const total = m.topics.length;
          const done = m.topics.filter((t) => t.done).length;
          const pct = total > 0 ? Math.round((done / total) * 100) : 0;
          const isOpen = !collapsed[m._id];
          return (
            <div key={m._id} className={`${styles.moduleCard} ${pct === 100 ? styles.moduleComplete : ''}`}>
              <button
                type="button"
                className={styles.moduleHeader}
                onClick={() => setCollapsed((c) => ({ ...c, [m._id]: isOpen }))}
              >
                <span className={styles.moduleIcon}>{m.icon}</span>
                <span className={styles.moduleTitle}>{m.title}</span>
                <span className={styles.modulePct}>{pct}%</span>
                <span className={styles.moduleChevron}>{isOpen ? '▾' : '▸'}</span>
              </button>
              <div className={styles.moduleProgressBar}><div className={styles.moduleProgressFill} style={{ width: `${pct}%` }} /></div>

              {isOpen && (
                <div className={styles.topicList}>
                  {m.topics.map((t) => (
                    <label key={t._id} className={`${styles.topicItem} ${t.done ? styles.topicDone : ''}`}>
                      <input type="checkbox" checked={t.done} onChange={() => onToggleTopic(m._id, t._id)} />
                      <span className={styles.topicText}>{t.text}</span>
                      {t.done && t.doneByName && <span className={styles.topicDoneBy}>✓ {t.doneByName}</span>}
                    </label>
                  ))}
                  {addingTo === m._id ? (
                    <form className={styles.topicAddForm} onSubmit={(e) => submitTopic(e, m._id)}>
                      <input
                        autoFocus
                        type="text"
                        value={newTopicText}
                        onChange={(e) => setNewTopicText(e.target.value)}
                        placeholder="Nuevo tema..."
                      />
                      <button type="submit">Agregar</button>
                      <button type="button" onClick={() => { setAddingTo(null); setNewTopicText(''); }}>✕</button>
                    </form>
                  ) : (
                    <button type="button" className={styles.topicAddBtn} onClick={() => setAddingTo(m._id)}>+ Agregar tema</button>
                  )}
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Un pendiente individual — prioridad, fecha límite, subtareas, subir/bajar.
// Pedido explícito del usuario (2026-09-08): "to-do app real". Sin
// drag-and-drop (no había ninguna librería de eso en el proyecto) — se
// suben/bajan con botones, intercambiando `order` con el vecino.
function TodoItem({ todo, currentUser, onToggle, onDelete, onMove, onAddSubtask, onToggleSubtask, isFirst, isLast }) {
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskText, setSubtaskText] = useState('');
  const canDelete = todo.authorEmail === currentUser.email || currentUser.role === 'admin';
  const prio = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG.media;
  const isOverdue = todo.dueDate && !todo.done && new Date(todo.dueDate) < new Date(new Date().toDateString());
  const subtaskDone = todo.subtasks?.filter((s) => s.done).length || 0;
  const subtaskTotal = todo.subtasks?.length || 0;

  const submitSubtask = (e) => {
    e.preventDefault();
    if (!subtaskText.trim()) return;
    onAddSubtask(todo._id, subtaskText.trim());
    setSubtaskText('');
    setAddingSubtask(false);
  };

  return (
    <div className={`${styles.todoItem} ${todo.done ? styles.todoDone : ''} ${isOverdue ? styles.todoOverdue : ''}`}>
      <div className={styles.todoMain}>
        <div className={styles.todoMoveCol}>
          <button type="button" className={styles.moveBtn} disabled={isFirst} onClick={() => onMove(todo._id, 'up')}>▲</button>
          <button type="button" className={styles.moveBtn} disabled={isLast} onClick={() => onMove(todo._id, 'down')}>▼</button>
        </div>
        <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo._id)} />
        <span className={styles.priorityChip} title={`Prioridad ${prio.label}`}>{prio.icon}</span>
        <div className={styles.todoTextCol}>
          <span className={styles.todoText}>{todo.text}</span>
          <div className={styles.todoMeta}>
            {todo.dueDate && (
              <span className={`${styles.dueChip} ${isOverdue ? styles.dueChipOverdue : ''}`}>📅 {formatDueDate(todo.dueDate)}</span>
            )}
            <span className={styles.todoAuthor}>{todo.authorName}</span>
            {subtaskTotal > 0 && <span className={styles.subtaskCount}>☑ {subtaskDone}/{subtaskTotal}</span>}
          </div>
        </div>
        {canDelete && (
          <button type="button" className={styles.todoDelete} onClick={() => onDelete(todo._id)} title="Eliminar">🗑️</button>
        )}
      </div>

      {(subtaskTotal > 0 || addingSubtask) && (
        <div className={styles.subtaskList}>
          {todo.subtasks.map((s) => (
            <label key={s._id} className={`${styles.subtaskItem} ${s.done ? styles.subtaskItemDone : ''}`}>
              <input type="checkbox" checked={s.done} onChange={() => onToggleSubtask(todo._id, s._id)} />
              <span>{s.text}</span>
            </label>
          ))}
          {addingSubtask && (
            <form className={styles.subtaskAddForm} onSubmit={submitSubtask}>
              <input
                autoFocus
                type="text"
                value={subtaskText}
                onChange={(e) => setSubtaskText(e.target.value)}
                placeholder="Nueva subtarea..."
                onBlur={() => { if (!subtaskText.trim()) setAddingSubtask(false); }}
              />
            </form>
          )}
        </div>
      )}
      {!addingSubtask && (
        <button type="button" className={styles.subtaskAddBtn} onClick={() => setAddingSubtask(true)}>+ subtarea</button>
      )}
    </div>
  );
}

// Pendientes — pedido explícito del usuario: "to-do app real" con
// vistas Hoy/Esta semana/Atrasadas/Todas, prioridad y fecha límite.
function TodoList({ todos, currentUser, onAdd, onToggle, onDelete, onMove, onAddSubtask, onToggleSubtask }) {
  const [filter, setFilter] = useState('todas');
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('media');

  const today = dayKey(new Date());
  const weekAhead = new Date();
  weekAhead.setDate(weekAhead.getDate() + 7);

  const filtered = todos.filter((t) => {
    if (filter === 'todas') return true;
    if (!t.dueDate) return false;
    const due = dayKey(t.dueDate);
    if (filter === 'hoy') return due === today;
    if (filter === 'semana') return new Date(t.dueDate) <= weekAhead;
    if (filter === 'atrasadas') return !t.done && new Date(t.dueDate) < new Date(new Date().toDateString());
    return true;
  });
  const done = filtered.filter((t) => t.done);
  const pct = filtered.length > 0 ? Math.round((done.length / filtered.length) * 100) : 0;

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim(), dueDate || null, priority);
    setText('');
    setDueDate('');
    setPriority('media');
  };

  return (
    <div className={styles.todoBox}>
      <div className={styles.todoHeader}>
        <h2 className={styles.sectionTitle}>✅ Pendientes</h2>
        {filtered.length > 0 && (
          <div className={styles.todoProgress}>
            <div className={styles.todoProgressBar}><div className={styles.todoProgressFill} style={{ width: `${pct}%` }} /></div>
            <span className={styles.todoProgressLabel}>{done.length}/{filtered.length}</span>
          </div>
        )}
      </div>

      <div className={styles.filterTabs}>
        {TODO_FILTERS.map((f) => (
          <button
            key={f.key}
            type="button"
            className={`${styles.filterTab} ${filter === f.key ? styles.filterTabActive : ''}`}
            onClick={() => setFilter(f.key)}
          >
            {f.label}
          </button>
        ))}
      </div>

      <form className={styles.todoForm} onSubmit={submit}>
        <input type="text" placeholder="Agregar un pendiente..." value={text} onChange={(e) => setText(e.target.value)} />
        <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={styles.dueDateInput} />
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={styles.prioritySelect}>
          <option value="alta">🔴 Alta</option>
          <option value="media">🟡 Media</option>
          <option value="baja">🟢 Baja</option>
        </select>
        <button type="submit" disabled={!text.trim()}>Agregar</button>
      </form>

      <div className={styles.todoList}>
        {filtered.map((t, i) => (
          <TodoItem
            key={t._id}
            todo={t}
            currentUser={currentUser}
            onToggle={onToggle}
            onDelete={onDelete}
            onMove={onMove}
            onAddSubtask={onAddSubtask}
            onToggleSubtask={onToggleSubtask}
            isFirst={i === 0}
            isLast={i === filtered.length - 1}
          />
        ))}
        {filtered.length === 0 && <p className={styles.empty}>Nada por aquí.</p>}
      </div>
    </div>
  );
}

function Entry({ entry, currentUser, onDeleted, onReact, onComment, onOpenPdf }) {
  const [commentText, setCommentText] = useState('');
  const [sendingComment, setSendingComment] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const canDelete = entry.authorEmail === currentUser.email || currentUser.role === 'admin';

  const myReaction = entry.reactions?.find((r) => r.authorEmail === currentUser.email)?.emoji;
  const reactionCounts = REACTIONS.map((emoji) => ({
    emoji,
    count: entry.reactions?.filter((r) => r.emoji === emoji).length || 0,
  }));

  const submitComment = async (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    setSendingComment(true);
    try {
      await onComment(entry._id, commentText.trim());
      setCommentText('');
    } finally {
      setSendingComment(false);
    }
  };

  return (
    <div className={styles.entry}>
      <div className={styles.entryHeader}>
        <div className={styles.avatar}>{initials(entry.authorName)}</div>
        <div className={styles.entryHeaderText}>
          <span className={styles.authorName}>{entry.authorName}</span>
          <span className={styles.entryDate}>{formatDate(entry.createdAt)}</span>
        </div>
        {canDelete && (
          <button className={styles.deleteBtn} onClick={() => onDeleted(entry._id)} title="Eliminar">🗑️</button>
        )}
      </div>

      <p className={styles.entryBody}>{entry.body}</p>

      {entry.attachments?.length > 0 && (
        <div className={styles.attachmentsRow}>
          {entry.attachments.map((att) => (
            <Attachment key={att._id} entryId={entry._id} att={att} onOpenImage={setLightboxUrl} onOpenPdf={onOpenPdf} />
          ))}
        </div>
      )}

      <div className={styles.reactionsRow}>
        {reactionCounts.map(({ emoji, count }) => (
          <button
            key={emoji}
            className={`${styles.reactionBtn} ${myReaction === emoji ? styles.reactionActive : ''}`}
            onClick={() => onReact(entry._id, emoji)}
          >
            {emoji} {count > 0 && count}
          </button>
        ))}
      </div>

      {entry.comments?.length > 0 && (
        <div className={styles.comments}>
          {entry.comments.map((c) => (
            <div key={c._id} className={styles.comment}>
              <span className={styles.commentAuthor}>{c.authorName}:</span>
              <span className={styles.commentText}>{c.text}</span>
            </div>
          ))}
        </div>
      )}

      <form className={styles.commentForm} onSubmit={submitComment}>
        <input
          type="text"
          placeholder="Escribe un comentario..."
          value={commentText}
          onChange={(e) => setCommentText(e.target.value)}
        />
        <button type="submit" disabled={sendingComment || !commentText.trim()}>Enviar</button>
      </form>

      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}
    </div>
  );
}

export default function Becarios() {
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const [entries, setEntries] = useState([]);
  const [loading, setLoading] = useState(true);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState([]);
  const [posting, setPosting] = useState(false);
  const [stats, setStats] = useState([]);
  const [todos, setTodos] = useState([]);
  const [modules, setModules] = useState([]);
  const [myReportActivity, setMyReportActivity] = useState(null);
  const [reportModalOpen, setReportModalOpen] = useState(false);
  const fileInputRef = useRef(null);
  const { pdf, showPdf, closePdf } = usePdfViewer();

  const load = () => {
    api.get('/becarios').then(({ data }) => setEntries(data)).finally(() => setLoading(false));
  };
  const loadStats = () => api.get('/becarios/stats').then(({ data }) => setStats(data));
  // El reporte semanal real vive en Calendario (ver MyWeeklyReportCard) — se
  // filtran los registros `reporte_semanal` que quedaron de un intento
  // anterior (no se borran, solo se dejan de mostrar aquí).
  const loadTodos = () => api.get('/becarios/todos').then(({ data }) => setTodos(data.filter((t) => t.category !== 'reporte_semanal')));
  const loadModules = () => api.get('/becarios/modules').then(({ data }) => setModules(data));
  const loadMyReport = () => {
    api.get('/calendar-activities').then(({ data }) => {
      const mine = data.find((a) => a.reportType === 'becario_semanal' && a.assignedTo?.some((u) => u.email === user.email));
      setMyReportActivity(mine || null);
    }).catch(() => {}); // sin acceso al Calendario (ej. sistemas.3 sin canManageTickets) — simplemente no se muestra la tarjeta
  };
  useEffect(() => { load(); loadStats(); loadTodos(); loadModules(); loadMyReport(); }, []);

  const handleAddTodo = async (text, dueDate, priority) => {
    const { data } = await api.post('/becarios/todos', { text, dueDate, priority });
    setTodos((prev) => [data, ...prev]);
  };
  const handleToggleTodo = async (id) => {
    const { data } = await api.put(`/becarios/todos/${id}`);
    setTodos((prev) => prev.map((t) => (t._id === id ? data : t)));
    loadStats(); // la racha/XP dependen de los pendientes completados
  };
  const handleDeleteTodo = async (id) => {
    await api.delete(`/becarios/todos/${id}`);
    setTodos((prev) => prev.filter((t) => t._id !== id));
  };
  const handleMoveTodo = async (id, direction) => {
    const { data } = await api.put(`/becarios/todos/${id}/move`, { direction });
    setTodos(data.filter((t) => t.category !== 'reporte_semanal'));
  };
  const handleAddSubtask = async (id, text) => {
    const { data } = await api.post(`/becarios/todos/${id}/subtasks`, { text });
    setTodos((prev) => prev.map((t) => (t._id === id ? data : t)));
  };
  const handleToggleSubtask = async (id, subtaskId) => {
    const { data } = await api.put(`/becarios/todos/${id}/subtasks/${subtaskId}`);
    setTodos((prev) => prev.map((t) => (t._id === id ? data : t)));
  };

  const handleToggleTopic = async (moduleId, topicId) => {
    const { data } = await api.put(`/becarios/modules/${moduleId}/topics/${topicId}`);
    setModules((prev) => prev.map((m) => (m._id === moduleId ? data : m)));
    loadStats(); // el XP de la ruta de aprendizaje depende de los temas marcados
  };
  const handleAddTopic = async (moduleId, text) => {
    const { data } = await api.post(`/becarios/modules/${moduleId}/topics`, { text });
    setModules((prev) => prev.map((m) => (m._id === moduleId ? data : m)));
  };

  const handleFilesChange = (e) => {
    setFiles(Array.from(e.target.files || []));
  };

  const submitEntry = async (e) => {
    e.preventDefault();
    if (!body.trim()) return;
    setPosting(true);
    try {
      const fd = new FormData();
      fd.append('body', body.trim());
      files.forEach((f) => fd.append('attachments', f));
      await api.post('/becarios', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      setBody('');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
      load();
      loadStats();
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo publicar');
    } finally {
      setPosting(false);
    }
  };

  const handleDelete = async (id) => {
    if (!confirm('¿Eliminar esta entrada?')) return;
    await api.delete(`/becarios/${id}`);
    setEntries((prev) => prev.filter((e) => e._id !== id));
  };

  const handleReact = async (id, emoji) => {
    const { data } = await api.post(`/becarios/${id}/reactions`, { emoji });
    setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, reactions: data } : e)));
  };

  const handleComment = async (id, text) => {
    const { data } = await api.post(`/becarios/${id}/comments`, { text });
    setEntries((prev) => prev.map((e) => (e._id === id ? { ...e, comments: [...(e.comments || []), data] } : e)));
    loadStats(); // el XP de comentarios se refleja en el panel de progreso
  };

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loadingWrap}><div className={styles.spinner} /></div>
    </div>
  );

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>🚀 Bitácora de Becarios</h1>
        <p className={styles.pageSubtitle}>Tu ruta, tu progreso, tus pendientes — todo en un solo lugar.</p>
      </div>

      <ProgressBoard stats={stats} />

      <LearningPath modules={modules} onToggleTopic={handleToggleTopic} onAddTopic={handleAddTopic} />

      <MyWeeklyReportCard activity={myReportActivity} onOpen={() => setReportModalOpen(true)} />

      <TodoList
        todos={todos}
        currentUser={user}
        onAdd={handleAddTodo}
        onToggle={handleToggleTodo}
        onDelete={handleDeleteTodo}
        onMove={handleMoveTodo}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
      />

      <form className={styles.composer} onSubmit={submitEntry}>
        <textarea
          placeholder="¿Qué hiciste hoy? ¿Qué te falta?"
          value={body}
          onChange={(e) => setBody(e.target.value)}
          rows={3}
        />
        <div className={styles.composerActions}>
          <label className={styles.fileLabel}>
            📎 Adjuntar
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*,application/pdf"
              multiple
              onChange={handleFilesChange}
              className={styles.fileInputHidden}
            />
          </label>
          {files.length > 0 && <span className={styles.fileCount}>{files.length} archivo(s)</span>}
          <button type="submit" className={styles.postBtn} disabled={posting || !body.trim()}>
            {posting ? 'Publicando...' : 'Publicar'}
          </button>
        </div>
      </form>

      <div className={styles.feed}>
        {entries.length === 0 && <p className={styles.empty}>Todavía no hay ninguna entrada — sé el primero en publicar.</p>}
        {entries.map((entry) => (
          <Entry
            key={entry._id}
            entry={entry}
            currentUser={user}
            onDeleted={handleDelete}
            onReact={handleReact}
            onComment={handleComment}
            onOpenPdf={showPdf}
          />
        ))}
      </div>

      {pdf && <PdfViewerModal url={pdf.url} title={pdf.title} onClose={closePdf} />}

      {reportModalOpen && myReportActivity && (
        <ReporteSemanalModal
          activityId={myReportActivity._id}
          onClose={() => setReportModalOpen(false)}
          onUpdated={(updated) => setMyReportActivity(updated)}
        />
      )}
    </div>
  );
}
