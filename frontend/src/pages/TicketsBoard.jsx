import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import TicketCard from './TicketCard';
import { useTicketsContext } from './TicketsLayout';
import { TICKET_TYPE_CONFIG, COLUMNS, PRIORITY_ORDER, oneAssetLabel } from './ticketShared';
import styles from './Tickets.module.css';

// Tablero general (kanban) — pedido explícito del usuario: mantenerlo tal
// cual estaba. El toggle "Todos / Mis Tickets" ya no vive en esta página —
// pedido explícito del usuario: se despliega en la MISMA barra lateral al
// presionar "Tickets" (ver TicketsLayout.jsx), así que aquí solo se LEE el
// scope elegido desde el query string (`?scope=`), no se decide aquí.
export default function TicketsBoard() {
  const { tickets, loading, currentUser, setDetailTarget, assetIdFilter, clearAssetFilter } = useTicketsContext();
  const [typeFilter, setTypeFilter] = useState('');
  const [searchParams] = useSearchParams();
  const scope = searchParams.get('scope') === 'mios' ? 'mios' : 'todos';

  const filteredAsset = assetIdFilter
    ? tickets.flatMap((t) => t.assetRefs || []).find((a) => a._id === assetIdFilter)
    : null;

  const scopedTickets = scope === 'mios' ? tickets.filter((t) => t.assignedTo?._id === currentUser.id) : tickets;
  const visibleTickets = typeFilter ? scopedTickets.filter((t) => t.ticketType === typeFilter) : scopedTickets;

  const board = useMemo(() => {
    const out = {};
    COLUMNS.forEach((c) => {
      out[c.key] = visibleTickets
        .filter((t) => t.status === c.key)
        .sort((a, b) => {
          const pDiff = PRIORITY_ORDER.indexOf(a.priority || 'media') - PRIORITY_ORDER.indexOf(b.priority || 'media');
          if (pDiff !== 0) return pDiff;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
    });
    return out;
  }, [visibleTickets]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🎫</div>
          <div>
            <h1 className={styles.title}>Tickets</h1>
            <p className={styles.subtitle}>Soporte reportado por el equipo — ligado al equipo específico, no a la persona.</p>
          </div>
        </div>
      </div>

      {assetIdFilter && (
        <div className={styles.assetFilterBar}>
          🎫 Filtrando por activo{filteredAsset ? `: ${oneAssetLabel(filteredAsset)}` : ''} ({tickets.length})
          <button type="button" className={styles.btnLink} onClick={clearAssetFilter}>✕ Quitar filtro</button>
        </div>
      )}

      <div className={styles.controlsRow}>
        <div className={styles.tabs}>
          <button className={`${styles.tab} ${!typeFilter ? styles.tabActive : ''}`} onClick={() => setTypeFilter('')}>Todos los tipos</button>
          {Object.entries(TICKET_TYPE_CONFIG).map(([key, cfg]) => (
            <button key={key} className={`${styles.tab} ${typeFilter === key ? styles.tabActive : ''}`} onClick={() => setTypeFilter(key)}>
              {cfg.icon} {cfg.label}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <div className={styles.board}>
          {COLUMNS.map((col) => (
            <div key={col.key} className={styles.column} style={{ '--col-accent': col.accent }}>
              <div className={styles.columnHeader}>
                <span className={styles.columnTitle}>{col.label}</span>
                <span className={styles.columnCount}>{board[col.key].length}</span>
              </div>
              <div className={styles.columnList}>
                {board[col.key].length === 0 ? (
                  <p className={styles.columnEmpty}>Sin tickets</p>
                ) : (
                  board[col.key].map((t) => (
                    <TicketCard key={t._id} ticket={t} onClick={() => setDetailTarget(t)} />
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
