import {
  TICKET_TYPE_CONFIG, PRIORITY_CONFIG, SLA_LEVEL_CONFIG,
  assetsLabel, daysOpen, isOverdue, initials,
} from './ticketShared';
import styles from './Tickets.module.css';

// Tarjeta de un ticket dentro del tablero — usada tanto por el tablero
// general (TicketsBoard.jsx) como por Mis Tickets (TicketsMisTickets.jsx),
// extraída de la vieja Tickets.jsx monolítica.
export default function TicketCard({ ticket, onClick }) {
  const tc = TICKET_TYPE_CONFIG[ticket.ticketType] || { label: ticket.ticketType, icon: '❓' };
  const asset = assetsLabel(ticket.assetRefs);
  const overdue = isOverdue(ticket);
  const days = daysOpen(ticket);
  return (
    <div className={`${styles.ticketCard} ${overdue ? styles.ticketCardOverdue : ''}`} onClick={onClick}>
      <div className={styles.cardTop}>
        <span className={styles.cardFolio}>{ticket.folio}</span>
        <div className={styles.cardBadges}>
          {ticket.priority && ticket.priority !== 'media' && (
            <span className={styles.cardBadge} title={`Prioridad ${PRIORITY_CONFIG[ticket.priority].label}`}>
              {PRIORITY_CONFIG[ticket.priority].icon}
            </span>
          )}
          {ticket.slaLevel && (
            <span className={styles.cardBadge} title={`Nivel de Servicio ${SLA_LEVEL_CONFIG[ticket.slaLevel].label}`}>
              {SLA_LEVEL_CONFIG[ticket.slaLevel].icon}
            </span>
          )}
          {ticket.blocksWork && <span className={styles.cardBadge} title="Le impide trabajar a alguien">⚠️</span>}
          {overdue && <span className={styles.cardBadge} title="Vencido">⏰</span>}
          {ticket.attachmentMimeType && <span className={styles.cardBadge} title="Tiene evidencia adjunta">📎</span>}
          {ticket.appRef && <span className={styles.cardBadge} title={`Aplicación: ${ticket.appRef.name}`}>🗂️</span>}
          {ticket.messages?.length > 0 && <span className={styles.cardBadge} title={`${ticket.messages.length} mensaje${ticket.messages.length !== 1 ? 's' : ''}`}>💬 {ticket.messages.length}</span>}
        </div>
      </div>
      <p className={styles.cardSubject}>{tc.icon} {ticket.subject}</p>
      <div className={styles.cardMeta}>
        <div>
          <p className={styles.cardEmployee}>{ticket.employeeName}</p>
          {asset && <p className={styles.cardAsset}>{asset}</p>}
        </div>
        {ticket.assignedTo && <div className={styles.cardAvatar} title={ticket.assignedTo.name}>{initials(ticket.assignedTo.name)}</div>}
      </div>
      <div className={styles.cardFooter}>
        <span className={`${styles.cardDays} ${overdue ? styles.cardDaysOverdue : ''}`}>
          {days === 0 ? 'Hoy' : `${days}d`}{ticket.resolvedAt ? ' (resuelto)' : ''}
        </span>
      </div>
    </div>
  );
}
