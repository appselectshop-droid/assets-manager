import { useMemo } from 'react';
import TicketCard from './TicketCard';
import { useTicketsContext } from './TicketsLayout';
import { COLUMNS, PRIORITY_ORDER } from './ticketShared';
import styles from './Tickets.module.css';

// "Mis Tickets" — pedido explícito del usuario: su propia página en el
// sidebar con solo lo que tengo asignado a mí, en vez del toggle que antes
// vivía dentro del tablero general.
export default function TicketsMisTickets() {
  const { tickets, loading, currentUser, setDetailTarget } = useTicketsContext();

  const myTickets = useMemo(
    () => tickets.filter((t) => t.assignedTo?._id === currentUser.id),
    [tickets, currentUser.id],
  );

  const board = useMemo(() => {
    const out = {};
    COLUMNS.forEach((c) => {
      out[c.key] = myTickets
        .filter((t) => t.status === c.key)
        .sort((a, b) => {
          const pDiff = PRIORITY_ORDER.indexOf(a.priority || 'media') - PRIORITY_ORDER.indexOf(b.priority || 'media');
          if (pDiff !== 0) return pDiff;
          return new Date(b.createdAt) - new Date(a.createdAt);
        });
    });
    return out;
  }, [myTickets]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>👤</div>
          <div>
            <h1 className={styles.title}>Mis Tickets</h1>
            <p className={styles.subtitle}>Tickets asignados a ti ({myTickets.length}).</p>
          </div>
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
