import { useMemo } from 'react';
import { useTicketsContext } from './TicketsLayout';
import { TICKET_TYPE_CONFIG, STATUS_CONFIG, timeAgo } from './ticketShared';
import styles from './Tickets.module.css';

// "Escalamiento" — pedido explícito del usuario: categoría propia para
// tickets que se salen del alcance/control del área (garantía con
// fabricante, soporte de un proveedor externo, aprobación de otra área) y
// necesitan quedarse marcados aparte. Se marca desde el modal de detalle
// (ticket.escalated, ver TicketDetailModal.jsx) — esta página solo lista lo
// ya marcado.
export default function TicketsEscalamiento() {
  const { tickets, loading, setDetailTarget } = useTicketsContext();

  const escalated = useMemo(() => (
    tickets.filter((t) => t.escalated).sort((a, b) => new Date(b.escalatedAt || b.createdAt) - new Date(a.escalatedAt || a.createdAt))
  ), [tickets]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🚀</div>
          <div>
            <h1 className={styles.title}>Escalamiento</h1>
            <p className={styles.subtitle}>Tickets que se salen del alcance del área y necesitan escalarse ({escalated.length}).</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : escalated.length === 0 ? (
        <p className={styles.empty}>Ningún ticket está marcado para escalar</p>
      ) : (
        <div className={styles.notesFeed}>
          {escalated.map((t) => {
            const tc = TICKET_TYPE_CONFIG[t.ticketType] || { label: t.ticketType, icon: '❓' };
            const sc = STATUS_CONFIG[t.status];
            return (
              <div key={t._id} className={styles.notesFeedItem} onClick={() => setDetailTarget(t)} style={{ background: '#fef2f2', borderColor: '#fecaca' }}>
                <div className={styles.notesFeedTop}>
                  <span className={styles.notesFeedFolio} style={{ color: '#b91c1c' }}>{tc.icon} {t.folio} · {t.subject}</span>
                  <span className={styles.notesFeedTime} style={{ color: '#dc2626' }}>{t.escalatedAt ? timeAgo(t.escalatedAt) : ''}</span>
                </div>
                {t.escalationReason && <p className={styles.notesFeedText}>{t.escalationReason}</p>}
                <p className={styles.notesFeedAuthor} style={{ color: '#dc2626' }}>
                  Escalado por {t.escalatedByName || '—'}
                  <span className={styles.statusBadge} style={{ marginLeft: '0.6rem', color: sc.color, background: sc.bg }}>{sc.label}</span>
                </p>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
