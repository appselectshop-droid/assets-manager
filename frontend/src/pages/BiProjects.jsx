import { useMemo } from 'react';
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

function ProjectCard({ ticket, onClick }) {
  const data = ticket.biProjectData || {};
  const priority = PRIORITY_CONFIG[data.prioridad];
  return (
    <div className={styles.ticketCard} onClick={onClick}>
      <div className={styles.cardTop}>
        <span className={styles.cardFolio}>{ticket.folio}</span>
        {priority && (
          <span className={styles.cardBadge} title={`Prioridad ${priority.label}`} style={{ color: priority.color }}>●</span>
        )}
      </div>
      <p className={styles.cardSubject}>📊 {data.nombreReporte || ticket.subject}</p>
      <div className={styles.cardMeta}>
        <div>
          <p className={styles.cardEmployee}>{ticket.employeeName}</p>
          {data.fechaRequerida && <p className={styles.cardAsset}>Requerida: {data.fechaRequerida}</p>}
        </div>
      </div>
    </div>
  );
}

export default function BiProjects() {
  const { tickets, loading, setDetailTarget } = useBiContext();
  const projects = useMemo(() => tickets.filter((t) => t.biRequestKind === 'proyecto'), [tickets]);

  const board = useMemo(() => {
    const out = {};
    STAGE_COLUMNS.forEach((c) => {
      out[c.key] = projects
        .filter((t) => (t.biStage || 'recibido') === c.key)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });
    return out;
  }, [projects]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>📊</div>
          <div>
            <h1 className={styles.title}>Proyectos</h1>
            <p className={styles.subtitle}>Solicitudes de proyectos de análisis de datos, por etapa.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <div className={styles.board}>
          {STAGE_COLUMNS.map((col) => (
            <div key={col.key} className={styles.column} style={{ '--col-accent': col.accent }}>
              <div className={styles.columnHeader}>
                <span className={styles.columnTitle}>{col.label}</span>
                <span className={styles.columnCount}>{board[col.key].length}</span>
              </div>
              <div className={styles.columnList}>
                {board[col.key].length === 0 ? (
                  <p className={styles.columnEmpty}>Sin proyectos</p>
                ) : (
                  board[col.key].map((t) => (
                    <ProjectCard key={t._id} ticket={t} onClick={() => setDetailTarget(t)} />
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
