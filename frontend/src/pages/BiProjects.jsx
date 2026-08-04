import { useMemo, useState } from 'react';
import api from '../services/api';
import { useBiContext } from './BiLayout';
import styles from './Tickets.module.css';

// Kanban de "Solicitud de Proyecto" BI — mismo patrón que TicketsBoard.jsx
// (agrupar en columnas + tarjetas), agrupando por `biStage` en vez de
// `status`. Las tarjetas son propias (no TicketCard.jsx, que está pensada
// para tickets normales con assetRefs/SLA/etc., datos que un proyecto BI
// no tiene) — muestran lo que sí importa acá: nombre del reporte,
// solicitante y prioridad (del formulario de proyecto).
const STAGE_COLUMNS = [
  { key: 'recibido',      label: 'Recibido',       accent: '#6b7280' },
  { key: 'en_definicion', label: 'En definición',  accent: '#d97706' },
  { key: 'en_desarrollo', label: 'En desarrollo',  accent: '#2563eb' },
  { key: 'en_revision',   label: 'En revisión',    accent: '#7c3aed' },
  { key: 'entregado',     label: 'Entregado',      accent: '#16a34a' },
];

const PRIORITY_CONFIG = {
  alta:  { label: 'Alta',  color: '#dc2626' },
  media: { label: 'Media', color: '#d97706' },
  baja:  { label: 'Baja',  color: '#16a34a' },
};

function ProjectCard({ ticket, onClick, onDragStart, onDragEnd, dragging }) {
  const data = ticket.biProjectData || {};
  const priority = PRIORITY_CONFIG[data.prioridad];
  return (
    <div
      className={`${styles.ticketCard} ${dragging ? styles.ticketCardDragging : ''}`}
      draggable
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onClick={onClick}
    >
      <div className={styles.cardTop}>
        <span className={styles.cardFolio}>{ticket.folio}</span>
        {priority && (
          <span className={styles.cardBadge} title={`Prioridad ${priority.label}`} style={{ color: priority.color }}>●</span>
        )}
      </div>
      {/* Etiquetas + conteo de comentarios estilo Trello — pedido explícito
          del usuario (2026-08-04). */}
      {(ticket.projectLabelIds || []).length > 0 && (
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.25rem', marginBottom: '0.35rem' }}>
          {ticket.projectLabelIds.filter((l) => typeof l === 'object').map((l) => (
            <span key={l._id} style={{ background: l.color, color: '#fff', padding: '0.1rem 0.5rem', borderRadius: '999px', fontSize: '0.66rem', fontWeight: 700 }}>{l.name}</span>
          ))}
        </div>
      )}
      <p className={styles.cardSubject}>📊 {data.nombreReporte || ticket.subject}</p>
      <div className={styles.cardMeta}>
        <div>
          <p className={styles.cardEmployee}>{ticket.employeeName}</p>
          {data.fechaRequerida && <p className={styles.cardAsset}>Requerida: {data.fechaRequerida}</p>}
        </div>
        {(ticket.projectComments || []).length > 0 && (
          <span className={styles.cardBadge} title="Comentarios">💬 {ticket.projectComments.length}</span>
        )}
      </div>
    </div>
  );
}

export default function BiProjects() {
  const { tickets, loading, load, setDetailTarget } = useBiContext();
  const projects = useMemo(() => tickets.filter((t) => t.biRequestKind === 'proyecto'), [tickets]);

  // Drag-and-drop estilo Trello — pedido explícito del usuario
  // (2026-07-31): mover tarjetas entre columnas de etapa. No hay ninguna
  // librería de DnD en el repo, así que se usan eventos nativos de HTML5
  // (draggable/onDragStart/onDragOver/onDrop), llamando la MISMA ruta que
  // ya usa el selector de etapa del modal (PUT /:id/bi-stage) — sin tocar
  // el backend.
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [moveError, setMoveError] = useState('');

  const board = useMemo(() => {
    const out = {};
    STAGE_COLUMNS.forEach((c) => {
      out[c.key] = projects
        .filter((t) => (t.biStage || 'recibido') === c.key)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });
    return out;
  }, [projects]);

  const handleDrop = async (col) => {
    setDragOverKey(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const ticket = projects.find((t) => t._id === id);
    if (!ticket || (ticket.biStage || 'recibido') === col.key) return;
    setMoveError('');
    try {
      await api.put(`/tickets/${id}/bi-stage`, { biStage: col.key });
      load(true);
    } catch (err) {
      setMoveError(err.response?.data?.message || 'No se pudo mover la tarjeta');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>📊</div>
          <div>
            <h1 className={styles.title}>Proyectos</h1>
            <p className={styles.subtitle}>Solicitudes de proyectos de análisis de datos, por etapa. Arrastra una tarjeta para cambiarla de etapa.</p>
          </div>
        </div>
      </div>

      {moveError && <p className={styles.formError}>{moveError}</p>}

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <div className={styles.board}>
          {STAGE_COLUMNS.map((col) => (
            <div
              key={col.key}
              className={`${styles.column} ${dragOverKey === col.key ? styles.columnDragOver : ''}`}
              style={{ '--col-accent': col.accent }}
              onDragOver={(e) => { e.preventDefault(); if (dragOverKey !== col.key) setDragOverKey(col.key); }}
              onDragLeave={() => setDragOverKey((k) => (k === col.key ? null : k))}
              onDrop={(e) => { e.preventDefault(); handleDrop(col); }}
            >
              <div className={styles.columnHeader}>
                <span className={styles.columnTitle}>{col.label}</span>
                <span className={styles.columnCount}>{board[col.key].length}</span>
              </div>
              <div className={styles.columnList}>
                {board[col.key].length === 0 ? (
                  <p className={styles.columnEmpty}>Sin proyectos</p>
                ) : (
                  board[col.key].map((t) => (
                    <ProjectCard
                      key={t._id}
                      ticket={t}
                      dragging={draggingId === t._id}
                      onClick={() => setDetailTarget(t)}
                      onDragStart={(e) => { e.dataTransfer.setData('text/plain', t._id); setDraggingId(t._id); }}
                      onDragEnd={() => { setDraggingId(null); setDragOverKey(null); }}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
