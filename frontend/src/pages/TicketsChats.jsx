import { useMemo } from 'react';
import { useTicketsContext } from './TicketsLayout';
import { TICKET_TYPE_CONFIG, timeAgo } from './ticketShared';
import styles from './Tickets.module.css';

// "Chats" — pedido explícito del usuario, inspirado en la bandeja de
// conversaciones de la imagen que compartió: bandeja de tickets con
// conversación activa, ordenada por el mensaje más reciente. "No leído" es
// una heurística simple: si el ÚLTIMO mensaje lo mandó el empleado, todavía
// no hay respuesta de Sistemas.
export default function TicketsChats() {
  const { tickets, loading, setDetailTarget } = useTicketsContext();

  const conversations = useMemo(() => {
    return tickets
      .filter((t) => (t.messages || []).length > 0)
      .map((t) => {
        const lastMessage = t.messages[t.messages.length - 1];
        return { ticket: t, lastMessage, unread: lastMessage.from === 'employee' };
      })
      .sort((a, b) => new Date(b.lastMessage.createdAt) - new Date(a.lastMessage.createdAt));
  }, [tickets]);

  const unreadCount = conversations.filter((c) => c.unread).length;

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>💬</div>
          <div>
            <h1 className={styles.title}>Chats</h1>
            <p className={styles.subtitle}>Bandeja de conversaciones activas{unreadCount > 0 ? ` — ${unreadCount} sin responder` : ''}.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : conversations.length === 0 ? (
        <p className={styles.empty}>Todavía no hay conversaciones en ningún ticket</p>
      ) : (
        <div className={styles.chatList}>
          {conversations.map(({ ticket, lastMessage, unread }) => {
            const tc = TICKET_TYPE_CONFIG[ticket.ticketType] || { label: ticket.ticketType, icon: '❓' };
            return (
              <div
                key={ticket._id}
                className={`${styles.chatItem} ${unread ? styles.chatItemUnread : ''}`}
                onClick={() => setDetailTarget(ticket)}
              >
                <div className={styles.chatAvatar}>{tc.icon}</div>
                <div className={styles.chatBody}>
                  <div className={styles.chatTop}>
                    <span className={styles.chatName}>{ticket.employeeName}</span>
                    <span className={styles.chatTime}>{timeAgo(lastMessage.createdAt)}</span>
                  </div>
                  <p className={styles.chatSubject}>{ticket.folio} · {ticket.subject}</p>
                  <p className={styles.chatSnippet}>
                    {lastMessage.from === 'admin' ? `${lastMessage.authorName}: ` : ''}{lastMessage.text || '📎 Imagen adjunta'}
                  </p>
                </div>
                {unread && <span className={styles.chatUnreadDot} title="Esperando respuesta de Sistemas" />}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
