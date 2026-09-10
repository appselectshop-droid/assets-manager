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
const TODO_REACTIONS = ['⭐', '👍', '✅'];
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];
const PRIORITY_CONFIG = {
  alta: { label: 'Alta', icon: '🔴' },
  media: { label: 'Media', icon: '🟡' },
  baja: { label: 'Baja', icon: '🟢' },
};
// Semanal/mensual (2026-09-10, pedido explícito del usuario: "actividades
// diarias, semanales y mensuales") — mismo mecanismo de racha que 'diaria'
// (ver periodKey()/RECURRING_TYPES en routes/becarios.js), solo cambia la
// etiqueta y la unidad de la racha.
const RECURRING_TYPES = ['diaria', 'semanal', 'mensual'];
const RECURRING_LABELS = { diaria: 'Diaria', semanal: 'Semanal', mensual: 'Mensual' };
const RECURRING_STREAK_UNIT = { diaria: 'días', semanal: 'semanas', mensual: 'meses' };
const TODO_FILTERS = [
  { key: 'hoy', label: 'Hoy' },
  { key: 'semana', label: 'Esta semana' },
  { key: 'atrasadas', label: 'Atrasadas' },
  { key: 'todas', label: 'Todas' },
];

function formatDate(d) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}
// BUG reportado por Felipe (2026-09-10): "le pongo el 14 de septiembre y
// solito lo cambia al 13" — un <input type="date"> manda "2026-09-14" sin
// hora; ese string SIN hora se guarda como medianoche UTC (a diferencia de
// un string con hora, que Date trata como hora LOCAL — asimetría real de
// JS). El intento de corrección anterior (mismo día) forzaba
// `timeZone: 'America/Mexico_City'`, pero eso es al revés: para un valor
// SOLO-fecha donde la medianoche UTC ya ES el día que se escribió, hay que
// mostrarlo en UTC — convertirlo a hora de México (UTC-6) sí lo recorre un
// día para atrás (verificado: 2026-09-14T00:00:00Z en hora de México cae en
// 13-sep, en UTC cae en 14-sep, que es lo correcto). Por eso el bug seguía
// igual para Felipe: su navegador ya está en hora de México, así que
// forzar esa misma zona no cambiaba nada.
function formatDueDate(d) {
  return new Date(d).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', timeZone: 'UTC' });
}
function dayKey(d) {
  return new Date(d).toISOString().slice(0, 10);
}
// "Hoy" en hora de México (UTC-6 fijo), no en UTC ni en la zona horaria del
// navegador — mismo BUG reportado por Felipe (2026-09-10): comparar
// instantes crudos contra `new Date()`/`toDateString()` del navegador
// desalinea un día entero contra un `dueDate` que siempre se guarda como
// medianoche UTC. Se compara por dayKey (string) en vez de por instante,
// igual que ya hace calendarActivities.js/businessHours.js en el backend.
function todayMxKey() {
  return dayKey(new Date(Date.now() - 6 * 60 * 60 * 1000));
}
function initials(name) {
  return (name || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]?.toUpperCase()).join('');
}

// Miniatura de un adjunto — imágenes/video se piden como blob (mismo patrón
// que AssetThumbnail.jsx); los PDF se piden al tocarlos y se abren en el
// visor embebido (usePdfViewer, mismo patrón que Responsivas/Solicitudes);
// el resto (documentos de Office) se descarga directo — las rutas de
// adjuntos requieren sesión, un <a href> directo no manda el token.
// `basePath` (2026-09-10, generalizado para reusar en Pendientes con
// adjuntos): antes recibía `entryId` fijo a la ruta del feed; ahora recibe
// la ruta completa (`/becarios/:id` o `/becarios/todos/:id`) para que sirva
// para las dos colecciones sin duplicar el componente.
function Attachment({ basePath, att, onOpenImage, onOpenPdf }) {
  const [url, setUrl] = useState(null);
  const [loadingFile, setLoadingFile] = useState(false);
  const isImage = IMAGE_MIME.includes(att.mimeType);
  const isVideo = (att.mimeType || '').startsWith('video/');

  useEffect(() => {
    if (!isImage && !isVideo) return;
    let objectUrl;
    let cancelled = false;
    api.get(`${basePath}/attachments/${att._id}`, { responseType: 'blob' })
      .then(({ data }) => { if (!cancelled) { objectUrl = URL.createObjectURL(data); setUrl(objectUrl); } })
      .catch(() => {});
    return () => { cancelled = true; if (objectUrl) URL.revokeObjectURL(objectUrl); };
  }, [basePath, att._id, isImage, isVideo]);

  if (isImage) {
    return url
      ? <img src={url} alt="" className={styles.attachmentThumb} onClick={() => onOpenImage(url)} />
      : <div className={styles.attachmentThumb} />;
  }
  if (isVideo) {
    return url
      ? <video src={url} controls className={styles.attachmentThumb} />
      : <div className={styles.attachmentThumb} />;
  }

  const openFile = async () => {
    setLoadingFile(true);
    try {
      const { data } = await api.get(`${basePath}/attachments/${att._id}`, { responseType: 'blob' });
      if (att.mimeType === 'application/pdf') {
        onOpenPdf(new Blob([data], { type: 'application/pdf' }), att.fileName || 'archivo');
        return;
      }
      // Documentos (Word/Excel/PowerPoint) — no hay visor embebido para
      // esto, se descargan directo.
      const blobUrl = URL.createObjectURL(new Blob([data], { type: att.mimeType }));
      const a = document.createElement('a');
      a.href = blobUrl;
      a.download = att.fileName || 'archivo';
      a.click();
      URL.revokeObjectURL(blobUrl);
    } catch {
      alert('No se pudo abrir el archivo');
    } finally {
      setLoadingFile(false);
    }
  };
  return (
    <button type="button" className={styles.attachmentFile} onClick={openFile} disabled={loadingFile}>
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

// Panel de progreso — puntos, insignia, racha y mapa de calor. Reconstruido
// (2026-09-08) siguiendo el documento de referencia (Habitica/TalentLMS):
// puntos según prioridad de cada tarea completada, no un XP inventado.
// Todo lo calcula el backend (GET /becarios/stats).
function ProgressBoard({ stats }) {
  if (stats.length === 0) return null;
  return (
    <div className={styles.progressBoard}>
      {stats.map((s) => (
        <div key={s.authorEmail} className={styles.progressCard}>
          <div className={styles.progressTop}>
            <div className={styles.avatar}>{initials(s.authorName)}</div>
            <div className={styles.progressInfo}>
              <span className={styles.authorName}>{s.authorName}</span>
              <span className={styles.levelTag}>{s.badge?.icon} {s.badge?.label}</span>
            </div>
            {s.bestStreak > 0 && (
              <div className={styles.streakBadge} title={`Mejor racha: ${s.bestStreak}`}>
                <span className={styles.streakFlame}>🔥</span>
                <span className={styles.streakNum}>{s.bestStreak}</span>
              </div>
            )}
          </div>

          <div className={styles.pointsRow}>
            <span className={styles.pointsBig}>{s.pointsTotal}</span>
            <span className={styles.pointsLabel}>puntos totales · {s.pointsWeek} esta semana</span>
          </div>

          <Heatmap data={s.heatmap} />
        </div>
      ))}
    </div>
  );
}

// Leaderboard — pedido explícito del documento de referencia: "Vista simple
// con los dos becarios ordenados por puntos de la semana". `stats` ya viene
// ordenado y con `rank` calculado por el backend.
function Leaderboard({ stats }) {
  const [range, setRange] = useState('semana'); // 'semana' | 'mes'
  if (stats.length < 2) return null; // no tiene sentido comparar contra uno mismo
  const field = range === 'semana' ? 'pointsWeek' : 'pointsMonth';
  const sorted = [...stats].sort((a, b) => b[field] - a[field]);
  return (
    <div className={styles.leaderboardBox}>
      <div className={styles.leaderboardHeader}>
        <h2 className={styles.sectionTitle}>🏆 Tabla de posiciones</h2>
        <div className={styles.filterTabs}>
          <button type="button" className={`${styles.filterTab} ${range === 'semana' ? styles.filterTabActive : ''}`} onClick={() => setRange('semana')}>Semana</button>
          <button type="button" className={`${styles.filterTab} ${range === 'mes' ? styles.filterTabActive : ''}`} onClick={() => setRange('mes')}>Mes</button>
        </div>
      </div>
      <div className={styles.leaderboardList}>
        {sorted.map((s, i) => (
          <div key={s.authorEmail} className={styles.leaderboardRow}>
            <span className={styles.leaderboardRank}>#{i + 1}</span>
            <div className={styles.avatar}>{initials(s.authorName)}</div>
            <span className={styles.leaderboardName}>{s.authorName}</span>
            <span className={styles.leaderboardPoints}>{s[field]} pts</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// Ruta de aprendizaje — estilo curso (AWS Skill Builder): módulos con temas
// que se marcan, cada uno con su barra de progreso. Pedido explícito del
// usuario (2026-09-08): "todo, hazlo muy padre".
function LearningPath({ modules, currentUser, onToggleTopic, onAddTopic }) {
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
      <p className={styles.pathHint}>Tu propio avance — cada quien marca sus temas por separado.</p>
      <div className={styles.moduleList}>
        {modules.map((m) => {
          const pct = m.pctMine ?? 0;
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
                  {m.topics.map((t) => {
                    const othersWhoFinished = (t.completedBy || []).filter((c) => c.email !== currentUser.email);
                    return (
                      <label key={t._id} className={`${styles.topicItem} ${t.doneByMe ? styles.topicDone : ''}`}>
                        <input type="checkbox" checked={t.doneByMe} onChange={() => onToggleTopic(m._id, t._id)} />
                        <span className={styles.topicText}>{t.text}</span>
                        {othersWhoFinished.length > 0 && (
                          <span className={styles.topicDoneBy} title="También lo completó">
                            ✓ {othersWhoFinished.map((c) => c.name).join(', ')}
                          </span>
                        )}
                      </label>
                    );
                  })}
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

// Un pendiente individual — asignación, prioridad/puntos, fecha límite o
// racha (según tipo), subtareas, subir/bajar, retroalimentación (comentarios
// + reacción). Reconstruido (2026-09-08) siguiendo el documento de
// referencia (Habitica/TalentLMS/ClickUp/TickTick). Sin drag-and-drop (no
// había ninguna librería de eso en el proyecto) — se suben/bajan con
// botones, intercambiando `order` con el vecino.
function TodoItem({ todo, currentUser, onToggle, onDelete, onMove, onAddSubtask, onToggleSubtask, onComment, onReact, onOpenPdf, isFirst, isLast }) {
  const [addingSubtask, setAddingSubtask] = useState(false);
  const [subtaskText, setSubtaskText] = useState('');
  const [commentText, setCommentText] = useState('');
  const [showFeedback, setShowFeedback] = useState(false);
  const [lightboxUrl, setLightboxUrl] = useState(null);
  const canDelete = todo.authorEmail === currentUser.email || currentUser.role === 'admin';
  const prio = PRIORITY_CONFIG[todo.priority] || PRIORITY_CONFIG.media;
  const isRecurring = RECURRING_TYPES.includes(todo.taskType);
  const isOverdue = !isRecurring && todo.dueDate && !todo.done && dayKey(todo.dueDate) < todayMxKey();
  const subtaskDone = todo.subtasks?.filter((s) => s.done).length || 0;
  const subtaskTotal = todo.subtasks?.length || 0;
  // assignedTo es un array (2026-09-10, tarea compartida entre uno o varios
  // becarios) — se soporta también la forma vieja (assignedToName/Email,
  // un solo string) por si algún documento de antes de esta migración
  // todavía no se actualizó en la base de datos.
  const assignees = (todo.assignedTo && todo.assignedTo.length)
    ? todo.assignedTo
    : (todo.assignedToName ? [{ name: todo.assignedToName, email: todo.assignedToEmail }] : []);
  const isSelfAssigned = assignees.length === 1 && assignees[0].email === todo.authorEmail;
  const assigneeNames = assignees.map((a) => a.name).join(', ');
  const myReaction = todo.reactions?.find((r) => r.authorEmail === currentUser.email)?.emoji;

  const submitSubtask = (e) => {
    e.preventDefault();
    if (!subtaskText.trim()) return;
    onAddSubtask(todo._id, subtaskText.trim());
    setSubtaskText('');
    setAddingSubtask(false);
  };
  const submitComment = (e) => {
    e.preventDefault();
    if (!commentText.trim()) return;
    onComment(todo._id, commentText.trim());
    setCommentText('');
  };

  return (
    <div className={`${styles.todoItem} ${todo.done ? styles.todoDone : ''} ${isOverdue ? styles.todoOverdue : ''}`}>
      <div className={styles.todoMain}>
        <div className={styles.todoMoveCol}>
          <button type="button" className={styles.moveBtn} disabled={isFirst} onClick={() => onMove(todo._id, 'up')}>▲</button>
          <button type="button" className={styles.moveBtn} disabled={isLast} onClick={() => onMove(todo._id, 'down')}>▼</button>
        </div>
        <input type="checkbox" checked={todo.done} onChange={() => onToggle(todo._id)} />
        <span className={styles.priorityChip} title={`Prioridad ${prio.label} · ${todo.points} pts`}>{prio.icon}</span>
        <div className={styles.todoTextCol}>
          <span className={styles.todoText}>{todo.text}</span>
          <div className={styles.todoMeta}>
            {isRecurring ? (
              <span className={styles.dailyChip} title={`Racha de ${todo.currentStreak} ${RECURRING_STREAK_UNIT[todo.taskType]} · ${todo.freezesAvailable} congelamiento(s) disponible(s)`}>
                🔁 {RECURRING_LABELS[todo.taskType]} · 🔥 {todo.currentStreak} {todo.freezesAvailable > 0 && '· ❄️'}
              </span>
            ) : todo.dueDate && (
              <span className={`${styles.dueChip} ${isOverdue ? styles.dueChipOverdue : ''}`}>📅 {formatDueDate(todo.dueDate)}</span>
            )}
            <span className={styles.pointsChip}>+{todo.points} pts</span>
            <span className={styles.todoAuthor}>
              {isSelfAssigned ? assigneeNames : `${todo.authorName} → ${assigneeNames}`}
            </span>
            {subtaskTotal > 0 && <span className={styles.subtaskCount}>☑ {subtaskDone}/{subtaskTotal}</span>}
          </div>
        </div>
        {canDelete && (
          <button type="button" className={styles.todoDelete} onClick={() => onDelete(todo._id)} title="Eliminar">🗑️</button>
        )}
      </div>

      {todo.attachments?.length > 0 && (
        <div className={styles.attachmentsRow}>
          {todo.attachments.map((att) => (
            <Attachment
              key={att._id}
              basePath={`/becarios/todos/${todo._id}`}
              att={att}
              onOpenImage={setLightboxUrl}
              onOpenPdf={onOpenPdf}
            />
          ))}
        </div>
      )}
      {lightboxUrl && <ImageLightbox src={lightboxUrl} onClose={() => setLightboxUrl(null)} />}

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

      <div className={styles.todoFooter}>
        {!addingSubtask && (
          <button type="button" className={styles.subtaskAddBtn} onClick={() => setAddingSubtask(true)}>+ subtarea</button>
        )}
        <div className={styles.todoReactions}>
          {TODO_REACTIONS.map((emoji) => (
            <button
              key={emoji}
              type="button"
              className={`${styles.miniReactionBtn} ${myReaction === emoji ? styles.miniReactionActive : ''}`}
              onClick={() => onReact(todo._id, emoji)}
            >
              {emoji}
            </button>
          ))}
          <button type="button" className={styles.feedbackToggle} onClick={() => setShowFeedback((v) => !v)}>
            💬 {todo.comments?.length > 0 ? todo.comments.length : ''}
          </button>
        </div>
      </div>

      {showFeedback && (
        <div className={styles.todoFeedback}>
          {todo.comments?.map((c) => (
            <div key={c._id} className={styles.comment}>
              <span className={styles.commentAuthor}>{c.authorName}:</span>
              <span className={styles.commentText}>{c.text}</span>
            </div>
          ))}
          <form className={styles.commentForm} onSubmit={submitComment}>
            <input
              type="text"
              placeholder="Retroalimentación..."
              value={commentText}
              onChange={(e) => setCommentText(e.target.value)}
            />
            <button type="submit" disabled={!commentText.trim()}>Enviar</button>
          </form>
        </div>
      )}
    </div>
  );
}

// Pendientes — asignación entre personas, tipo única/diaria, prioridad y
// fecha límite. Reconstruido (2026-09-08) siguiendo el documento de
// referencia: "cualquier mentor pueda crear y asignar tareas a un becario".
function TodoList({ todos, team, currentUser, onAdd, onToggle, onDelete, onMove, onAddSubtask, onToggleSubtask, onComment, onReact, onOpenPdf }) {
  const [filter, setFilter] = useState('todas');
  const [text, setText] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [priority, setPriority] = useState('media');
  const [taskType, setTaskType] = useState('unica');
  // Escoger a ambos o uno solo (2026-09-10, pedido explícito del usuario) —
  // checkboxes en vez de un <select> de una sola opción; por default
  // arranca con todo el equipo marcado (el caso más común es asignarle lo
  // mismo a los dos becarios a la vez).
  const [assignedEmails, setAssignedEmails] = useState(new Set());
  const teamLoadedRef = useRef(false);
  useEffect(() => {
    // `team` llega vacío en el primer render (todavía no responde
    // GET /becarios/team) — se marca todo el equipo apenas se puebla, pero
    // solo esa primera vez, para no pisar lo que el usuario ya haya
    // desmarcado a mano después.
    if (!teamLoadedRef.current && team.length > 0) {
      setAssignedEmails(new Set(team.map((p) => p.email)));
      teamLoadedRef.current = true;
    }
  }, [team]);
  const toggleAssignee = (email) => setAssignedEmails((prev) => {
    const next = new Set(prev);
    next.has(email) ? next.delete(email) : next.add(email);
    return next;
  });
  // Adjuntos (2026-09-10, pedido explícito del usuario: "déjame añadir
  // fotos, videos, documentos, etc.") — mismo patrón que el composer del
  // feed más abajo.
  const [files, setFiles] = useState([]);
  const fileInputRef = useRef(null);

  const today = todayMxKey();
  const weekAheadKey = dayKey(new Date(Date.now() - 6 * 60 * 60 * 1000 + 7 * 86400000));

  const filtered = todos.filter((t) => {
    if (filter === 'todas') return true;
    if (RECURRING_TYPES.includes(t.taskType)) return filter === 'hoy'; // las recurrentes siempre cuentan como "de hoy"
    if (!t.dueDate) return false;
    const due = dayKey(t.dueDate);
    if (filter === 'hoy') return due === today;
    if (filter === 'semana') return due <= weekAheadKey;
    if (filter === 'atrasadas') return !t.done && due < today;
    return true;
  });
  const done = filtered.filter((t) => t.done);
  const pct = filtered.length > 0 ? Math.round((done.length / filtered.length) * 100) : 0;

  const handleFilesChange = (e) => setFiles(Array.from(e.target.files || []));

  // BUG real reportado por el usuario (2026-09-10): "elijo 3 documentos a
  // subir y no me sube nada" — esto llamaba a onAdd() sin esperarlo ni
  // atrapar el error, y limpiaba el formulario de inmediato sin importar
  // si en verdad se había guardado — si la subida fallaba (archivo no
  // permitido, muy pesado, etc.), no había NINGÚN aviso: el texto/adjuntos
  // desaparecían del formulario como si se hubiera creado, pero nunca
  // aparecía nada en la lista.
  const [posting, setPosting] = useState(false);
  const submit = async (e) => {
    e.preventDefault();
    if (!text.trim() || posting) return;
    const assignees = team.filter((p) => assignedEmails.has(p.email));
    setPosting(true);
    try {
      await onAdd(text.trim(), dueDate || null, priority, taskType, assignees, files);
      setText('');
      setDueDate('');
      setPriority('media');
      setTaskType('unica');
      setFiles([]);
      if (fileInputRef.current) fileInputRef.current.value = '';
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo crear el pendiente');
    } finally {
      setPosting(false);
    }
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
        <div className={styles.assigneeChooser}>
          <span className={styles.assigneeChooserLabel}>Para:</span>
          {team.map((p) => (
            <label key={p.email} className={styles.choiceOption}>
              <input type="checkbox" checked={assignedEmails.has(p.email)} onChange={() => toggleAssignee(p.email)} />
              {p.name}
            </label>
          ))}
        </div>
        <select value={taskType} onChange={(e) => setTaskType(e.target.value)} className={styles.prioritySelect}>
          <option value="unica">Única</option>
          <option value="diaria">🔁 Diaria (racha)</option>
          <option value="semanal">🔁 Semanal (racha)</option>
          <option value="mensual">🔁 Mensual (racha)</option>
        </select>
        {taskType === 'unica' && (
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} className={styles.dueDateInput} />
        )}
        <select value={priority} onChange={(e) => setPriority(e.target.value)} className={styles.prioritySelect}>
          <option value="alta">🔴 Alta · 20pts</option>
          <option value="media">🟡 Media · 10pts</option>
          <option value="baja">🟢 Baja · 5pts</option>
        </select>
        <label className={styles.fileLabel}>
          📎 Adjuntar
          <input
            ref={fileInputRef}
            type="file"
            accept="image/*,video/*,application/pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx"
            multiple
            onChange={handleFilesChange}
            className={styles.fileInputHidden}
          />
        </label>
        {files.length > 0 && <span className={styles.fileCount}>{files.length} archivo(s)</span>}
        <button type="submit" disabled={posting || !text.trim() || assignedEmails.size === 0}>
          {posting ? 'Guardando...' : 'Agregar'}
        </button>
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
            onComment={onComment}
            onReact={onReact}
            onOpenPdf={onOpenPdf}
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
            <Attachment key={att._id} basePath={`/becarios/${entry._id}`} att={att} onOpenImage={setLightboxUrl} onOpenPdf={onOpenPdf} />
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
  const [team, setTeam] = useState([]);
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
  const loadTeam = () => api.get('/becarios/team').then(({ data }) => setTeam(data));
  const loadModules = () => api.get('/becarios/modules').then(({ data }) => setModules(data));
  const loadMyReport = () => {
    api.get('/calendar-activities').then(({ data }) => {
      const mine = data.find((a) => a.reportType === 'becario_semanal' && a.assignedTo?.some((u) => u.email === user.email));
      setMyReportActivity(mine || null);
    }).catch(() => {}); // sin acceso al Calendario (ej. sistemas.3 sin canManageTickets) — simplemente no se muestra la tarjeta
  };
  useEffect(() => { load(); loadStats(); loadTodos(); loadTeam(); loadModules(); loadMyReport(); }, []);

  // assignees: [{name,email}, ...] (uno o ambos becarios, COMPARTIENDO la
  // misma tarea) — multipart porque ahora también manda adjuntos
  // (2026-09-10, pedido explícito del usuario). El backend crea UN solo
  // documento con `assignedTo` de varios (ver POST /becarios/todos) y
  // regresa ese único objeto, no un array — corregido 2026-09-10 tras la
  // corrección de Felipe/el usuario ("uno lo inicia y el otro le da
  // seguimiento": una sola tarjeta compartida, no una copia por persona).
  const handleAddTodo = async (text, dueDate, priority, taskType, assignees, files) => {
    const fd = new FormData();
    fd.append('text', text);
    if (dueDate) fd.append('dueDate', dueDate);
    fd.append('priority', priority);
    fd.append('taskType', taskType);
    fd.append('assignees', JSON.stringify(assignees));
    (files || []).forEach((f) => fd.append('attachments', f));
    const { data } = await api.post('/becarios/todos', fd, { headers: { 'Content-Type': 'multipart/form-data' } });
    setTodos((prev) => [data, ...prev]);
  };
  const handleTodoComment = async (id, text) => {
    const { data } = await api.post(`/becarios/todos/${id}/comments`, { text });
    setTodos((prev) => prev.map((t) => (t._id === id ? data : t)));
  };
  const handleTodoReact = async (id, emoji) => {
    const { data } = await api.post(`/becarios/todos/${id}/reactions`, { emoji });
    setTodos((prev) => prev.map((t) => (t._id === id ? data : t)));
  };
  const handleToggleTodo = async (id) => {
    const { data } = await api.put(`/becarios/todos/${id}`);
    setTodos((prev) => prev.map((t) => (t._id === id ? data : t)));
    loadStats(); // los puntos/racha dependen de los pendientes completados
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
    loadStats(); // los puntos de la ruta de aprendizaje dependen de los temas marcados
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
  };

  if (loading) return (
    <div className={styles.page}>
      <div className={styles.loadingWrap}><div className={styles.spinner} /></div>
    </div>
  );

  // Vista de mentor (2026-09-10, pedido explícito del usuario): "a Mike, a
  // Felipe y a mí, quítennos la vista de lo que ven los becarios, pónganos
  // una vista exclusiva para poner actividades" — Miguel/Felipe/Lilly son
  // los 3 con `canViewBecariosPanel` Y role:'admin' (el resto — Mariano,
  // Italo — son los becarios reales, role:'viewer'; mismo criterio ya
  // usado en GET /becarios/stats para excluir admins del leaderboard). El
  // mentor ya no ve su propio progreso/racha/ruta de aprendizaje/feed —
  // que es contenido pensado para que el becario lo llene sobre sí mismo,
  // no para un mentor — solo la lista de Pendientes, que es como
  // asigna/da seguimiento a las actividades de Mariano e Italo.
  const isMentor = user.role === 'admin';

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <h1 className={styles.pageTitle}>🚀 Bitácora de Becarios</h1>
        <p className={styles.pageSubtitle}>
          {isMentor
            ? 'Asigna y da seguimiento a las actividades de los becarios.'
            : 'Tu ruta, tu progreso, tus pendientes — todo en un solo lugar.'}
        </p>
      </div>

      {!isMentor && (
        <>
          <ProgressBoard stats={stats} />
          <Leaderboard stats={stats} />
          <LearningPath modules={modules} currentUser={user} onToggleTopic={handleToggleTopic} onAddTopic={handleAddTopic} />
          <MyWeeklyReportCard activity={myReportActivity} onOpen={() => setReportModalOpen(true)} />
        </>
      )}

      <TodoList
        todos={todos}
        team={team.length > 0 ? team : [{ name: user.name, email: user.email }]}
        currentUser={user}
        onAdd={handleAddTodo}
        onToggle={handleToggleTodo}
        onDelete={handleDeleteTodo}
        onMove={handleMoveTodo}
        onAddSubtask={handleAddSubtask}
        onToggleSubtask={handleToggleSubtask}
        onComment={handleTodoComment}
        onReact={handleTodoReact}
        onOpenPdf={showPdf}
      />

      {!isMentor && (
        <>
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
        </>
      )}

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
