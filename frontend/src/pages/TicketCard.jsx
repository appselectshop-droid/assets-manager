import {
  TICKET_TYPE_CONFIG, PRIORITY_CONFIG, SLA_LEVEL_CONFIG,
  assetsLabel, daysOpen, daysAgo, isOverdue, initials,
} from './ticketShared';
import styles from './Tickets.module.css';

// Tarjeta de un ticket dentro del tablero (TicketsBoard.jsx, tanto en
// "Todos" como en "Mis Tickets"), extraída de la vieja Tickets.jsx
// monolítica.
export default function TicketCard({ ticket, onClick }) {
  const tc = TICKET_TYPE_CONFIG[ticket.ticketType] || { label: ticket.ticketType, icon: '❓' };
  const asset = assetsLabel(ticket.assetRefs);
  const overdue = isOverdue(ticket);
  // Para resueltos se muestra hace cuánto se resolvió (recencia), no
  // cuánto tardó en resolverse — daysOpen() da 0 para cualquier ticket
  // resuelto el mismo día que se reportó, sin importar si eso fue ayer o
  // hace un mes (bug real reportado por Felipe, 2026-07-30: un ticket de
  // hace una semana se veía como "Hoy").
  const days = ticket.resolvedAt ? daysAgo(ticket.resolvedAt) : daysOpen(ticket);
  // Redirigido a Solicitud de Recursos (2026-08-07) — pedido explícito del
  // usuario: tarjeta en amarillo con el motivo, para que no se pierda de
  // vista que el trabajo real de esto vive en Solicitudes de Recursos,
  // aunque el ticket siga funcionando normal.
  const redirected = !!ticket.redirectedToResourceRequest;
  // Creado a partir de una Solicitud de Recursos redirigida (2026-08-11,
  // dirección contraria a la de arriba) — pedido explícito del usuario:
  // "si lo muevo de solicitudes a tickets debe verse así [amarillo] y
  // viceversa". Mismo trato visual que `redirected` — no son mutuamente
  // excluyentes en teoría, pero en la práctica nunca coinciden (un ticket
  // recién creado por un redirect no se vuelve a redirigir de inmediato).
  const fromResourceRequest = !!ticket.raw?.redirectedFromResourceRequest;
  return (
    <div className={`${styles.ticketCard} ${overdue ? styles.ticketCardOverdue : ''} ${(redirected || fromResourceRequest) ? styles.ticketCardRedirected : ''}`} onClick={onClick}>
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
          {ticket.awaitingCloseAuthorization && <span className={styles.cardBadge} title="Esperando autorización para cerrar por falta de respuesta">🔔</span>}
          {ticket.attachmentMimeType && <span className={styles.cardBadge} title="Tiene evidencia adjunta">📎</span>}
          {ticket.appRef && <span className={styles.cardBadge} title={`Aplicación: ${ticket.appRef.name}`}>🗂️</span>}
          {ticket.messages?.length > 0 && <span className={styles.cardBadge} title={`${ticket.messages.length} mensaje${ticket.messages.length !== 1 ? 's' : ''}`}>💬 {ticket.messages.length}</span>}
        </div>
      </div>
      {redirected && (
        <p className={styles.cardSubject} style={{ color: '#92400e', fontWeight: 700 }}>
          🟡 Redirigido a Solicitud de Recursos{ticket.redirectReason ? `: ${ticket.redirectReason}` : ''}
        </p>
      )}
      {fromResourceRequest && (
        <p className={styles.cardSubject} style={{ color: '#92400e', fontWeight: 700 }}>
          🟡 Creado a partir de una Solicitud de Recursos redirigida{ticket.raw?.redirectedFromReason ? `: ${ticket.raw.redirectedFromReason}` : ''}
        </p>
      )}
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
          {ticket.resolvedAt
            ? (days === 0 ? 'Resuelto hoy' : `Resuelto hace ${days}d`)
            : (days === 0 ? 'Hoy' : `${days}d`)}
        </span>
      </div>
    </div>
  );
}
