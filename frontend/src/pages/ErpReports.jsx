import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import api from '../services/api';
import ErpReportDetailModal from '../components/ErpReportDetailModal';
import styles from './Tickets.module.css';

// Kanban de "Reporte ERP" — mismo patrón que BiProjects.jsx (pedido
// explícito de ERP: "manéjalo como los proyectos de BI" porque los
// tiempos los afectan). A diferencia de BI, esta página no vive dentro de
// un layout compartido con sub-secciones (ERP solo tiene esta, no
// "Bases de Datos"/"Proyectos"/"Mi Equipo") — trae sus propios datos y su
// propio modal, en vez de un contexto de React Router compartido.
const STAGE_COLUMNS = [
  { key: 'recibido',      label: 'Recibido',       accent: '#6b7280' },
  { key: 'en_definicion', label: 'En definición',  accent: '#d97706' },
  { key: 'en_desarrollo', label: 'En desarrollo',  accent: '#2563eb' },
  { key: 'en_revision',   label: 'En revisión',    accent: '#7c3aed' },
  { key: 'entregado',     label: 'Entregado',      accent: '#16a34a' },
];

function ReportCard({ ticket, onClick, onDragStart, onDragEnd, dragging }) {
  const data = ticket.erpReportData || {};
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
      </div>
      <p className={styles.cardSubject}>📈 {data.reportName || ticket.subject}</p>
      <div className={styles.cardMeta}>
        <div>
          <p className={styles.cardEmployee}>{ticket.employeeName}</p>
          {data.module && <p className={styles.cardAsset}>{data.module}</p>}
          {data.deadline && <p className={styles.cardAsset}>Límite: {data.deadline}</p>}
        </div>
      </div>
    </div>
  );
}

export default function ErpReports() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailTarget, setDetailTarget] = useState(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const [draggingId, setDraggingId] = useState(null);
  const [dragOverKey, setDragOverKey] = useState(null);
  const [moveError, setMoveError] = useState('');

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await api.get('/tickets');
    const reports = data.filter((t) => t.ticketType === 'reporte_erp');
    setTickets(reports);
    if (!silent) setLoading(false);

    // ?ticket=<id> (viene de la campanita de notificaciones, ver
    // components/NotificationBell.jsx) — mismo patrón que TicketsLayout.jsx.
    const ticketId = searchParams.get('ticket');
    if (ticketId) {
      const found = reports.find((t) => t._id === ticketId);
      if (found) setDetailTarget(found);
      searchParams.delete('ticket');
      setSearchParams(searchParams, { replace: true });
    }
  };

  useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Mismo criterio que BiLayout.jsx/TicketsLayout.jsx: refresco de fondo
  // silencioso, para que una solicitud nueva o un cambio de etapa de
  // alguien más aparezca solo sin recargar a mano.
  useEffect(() => {
    const interval = setInterval(() => load(true), 8000);
    return () => clearInterval(interval);
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const board = useMemo(() => {
    const out = {};
    STAGE_COLUMNS.forEach((c) => {
      out[c.key] = tickets
        .filter((t) => (t.erpStage || 'recibido') === c.key)
        .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
    });
    return out;
  }, [tickets]);

  const handleDrop = async (col) => {
    setDragOverKey(null);
    const id = draggingId;
    setDraggingId(null);
    if (!id) return;
    const ticket = tickets.find((t) => t._id === id);
    if (!ticket || (ticket.erpStage || 'recibido') === col.key) return;
    setMoveError('');
    try {
      await api.put(`/tickets/${id}/erp-stage`, { erpStage: col.key });
      load(true);
    } catch (err) {
      setMoveError(err.response?.data?.message || 'No se pudo mover la tarjeta');
    }
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>📈</div>
          <div>
            <h1 className={styles.title}>Reportes ERP</h1>
            <p className={styles.subtitle}>Solicitudes de reporte, por etapa. Arrastra una tarjeta para cambiarla de etapa.</p>
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
                  <p className={styles.columnEmpty}>Sin reportes</p>
                ) : (
                  board[col.key].map((t) => (
                    <ReportCard
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

      {detailTarget && (
        <ErpReportDetailModal
          ticket={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={(updated) => { setDetailTarget(updated); load(true); }}
        />
      )}
    </div>
  );
}
