import { useEffect, useRef, useState } from 'react';
import api from '../services/api';
import ImageLightbox from '../components/ImageLightbox';
import PdfViewerModal from '../components/PdfViewerModal';
import usePdfViewer from '../hooks/usePdfViewer';
import dashboardStyles from './Dashboard.module.css';
import styles from './Becarios.module.css';

// Bitácora de becarios — pedido explícito del usuario (2026-09-05): dos
// becarios nuevos (Mariano Chavez, Italo Correa) necesitan retroalimentarse
// constantemente en actividades/pendientes. Se descartó a propósito un
// tablero tipo Kanban ("no me gusta que sean tarjetas, busca algo más
// didáctico donde puedan subir cosas") a favor de un feed de bitácora:
// cada entrada es "qué hice / qué me falta", puede traer archivos de
// evidencia, y la retroalimentación se da en comentarios y reacciones
// rápidas debajo de cada entrada — ver backend/src/routes/becarios.js.
const REACTIONS = ['👍', '✅', '⚠️'];
const IMAGE_MIME = ['image/jpeg', 'image/png', 'image/heic', 'image/heif', 'image/webp'];

function formatDate(d) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
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

// Panel de progreso (racha, total, insignias) — estilo "Activities Board" de
// AWS Skill Builder, pedido explícito del usuario (2026-09-07) para que el
// panel se sienta interactivo y no "muy equis". Todo lo calcula el backend
// (GET /becarios/stats) a partir de entradas + pendientes completados.
function ProgressBoard({ stats }) {
  if (stats.length === 0) return null;
  return (
    <div className={styles.progressBoard}>
      {stats.map((s) => (
        <div key={s.authorEmail} className={styles.progressCard}>
          <div className={styles.avatar}>{initials(s.authorName)}</div>
          <div className={styles.progressInfo}>
            <span className={styles.authorName}>{s.authorName}</span>
            <div className={styles.progressStatsRow}>
              <span className={styles.streakChip}>🔥 {s.currentStreak} {s.currentStreak === 1 ? 'día' : 'días'}</span>
              <span className={styles.statChip}>{s.totalEntries} publicaciones</span>
            </div>
            {s.badges.length > 0 && (
              <div className={styles.badgesRow}>
                {s.badges.map((b) => (
                  <span key={b.label} className={styles.badge} title={b.label}>{b.icon} {b.label}</span>
                ))}
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

// Pendientes (to-do) — pedido explícito del usuario (2026-09-07): "algo como
// to-do" para que se pueda "hacer cosas" y no solo leer un feed. Lista
// compartida: cualquiera marca/desmarca, solo el autor (o admin) borra.
function TodoList({ todos, currentUser, onAdd, onToggle, onDelete }) {
  const [text, setText] = useState('');
  const pending = todos.filter((t) => !t.done);
  const done = todos.filter((t) => t.done);
  const total = todos.length;
  const pct = total > 0 ? Math.round((done.length / total) * 100) : 0;

  const submit = (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    onAdd(text.trim());
    setText('');
  };

  return (
    <div className={styles.todoBox}>
      <div className={styles.todoHeader}>
        <h2 className={styles.todoTitle}>✅ Pendientes</h2>
        {total > 0 && (
          <div className={styles.todoProgress}>
            <div className={styles.todoProgressBar}><div className={styles.todoProgressFill} style={{ width: `${pct}%` }} /></div>
            <span className={styles.todoProgressLabel}>{done.length}/{total}</span>
          </div>
        )}
      </div>

      <form className={styles.todoForm} onSubmit={submit}>
        <input
          type="text"
          placeholder="Agregar un pendiente..."
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={!text.trim()}>Agregar</button>
      </form>

      <div className={styles.todoList}>
        {[...pending, ...done].map((t) => (
          <label key={t._id} className={`${styles.todoItem} ${t.done ? styles.todoDone : ''}`}>
            <input type="checkbox" checked={t.done} onChange={() => onToggle(t._id)} />
            <span className={styles.todoText}>{t.text}</span>
            <span className={styles.todoAuthor}>{t.authorName}</span>
            {(t.authorEmail === currentUser.email || currentUser.role === 'admin') && (
              <button type="button" className={styles.todoDelete} onClick={() => onDelete(t._id)} title="Eliminar">🗑️</button>
            )}
          </label>
        ))}
        {total === 0 && <p className={styles.empty}>Sin pendientes todavía.</p>}
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
  const fileInputRef = useRef(null);
  const { pdf, showPdf, closePdf } = usePdfViewer();

  const load = () => {
    api.get('/becarios').then(({ data }) => setEntries(data)).finally(() => setLoading(false));
  };
  const loadStats = () => api.get('/becarios/stats').then(({ data }) => setStats(data));
  const loadTodos = () => api.get('/becarios/todos').then(({ data }) => setTodos(data));
  useEffect(() => { load(); loadStats(); loadTodos(); }, []);

  const handleAddTodo = async (text) => {
    const { data } = await api.post('/becarios/todos', { text });
    setTodos((prev) => [data, ...prev]);
  };
  const handleToggleTodo = async (id) => {
    const { data } = await api.put(`/becarios/todos/${id}`);
    setTodos((prev) => prev.map((t) => (t._id === id ? data : t)));
    loadStats(); // la racha/insignias dependen de los pendientes completados
  };
  const handleDeleteTodo = async (id) => {
    await api.delete(`/becarios/todos/${id}`);
    setTodos((prev) => prev.filter((t) => t._id !== id));
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
    <div className={dashboardStyles.loadingWrap}>
      <div className={dashboardStyles.spinner} />
    </div>
  );

  return (
    <div className={dashboardStyles.page}>
      <div className={dashboardStyles.header}>
        <div>
          <h1 className={dashboardStyles.greeting}>Bitácora de becarios</h1>
          <p className={dashboardStyles.date}>Qué hiciste, qué te falta, qué evidencia traes — retroalimentación directa entre ustedes.</p>
        </div>
      </div>

      <ProgressBoard stats={stats} />

      <TodoList todos={todos} currentUser={user} onAdd={handleAddTodo} onToggle={handleToggleTodo} onDelete={handleDeleteTodo} />

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
    </div>
  );
}
