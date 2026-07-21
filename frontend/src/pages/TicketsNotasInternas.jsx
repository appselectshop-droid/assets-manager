import { useMemo } from 'react';
import { useTicketsContext } from './TicketsLayout';
import { timeAgo } from './ticketShared';
import styles from './Tickets.module.css';

// "Notas internas" — pedido explícito del usuario: categoría propia con el
// feed de TODAS las notas internas de TODOS los tickets, no solo las de un
// ticket a la vez (que es como ya se veían dentro del detalle). Es de solo
// lectura aquí; para agregar una nota nueva se sigue abriendo el ticket.
export default function TicketsNotasInternas() {
  const { tickets, loading, setDetailTarget } = useTicketsContext();

  const notes = useMemo(() => {
    return tickets
      .flatMap((t) => (t.internalNotes || []).map((n) => ({ ticket: t, note: n })))
      .sort((a, b) => new Date(b.note.createdAt) - new Date(a.note.createdAt));
  }, [tickets]);

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>🔒</div>
          <div>
            <h1 className={styles.title}>Notas internas</h1>
            <p className={styles.subtitle}>Bitácora técnica de todos los tickets — solo la ve el equipo de Sistemas.</p>
          </div>
        </div>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : notes.length === 0 ? (
        <p className={styles.empty}>Todavía no hay notas internas registradas</p>
      ) : (
        <div className={styles.notesFeed}>
          {notes.map(({ ticket, note }, i) => (
            <div key={note._id || i} className={styles.notesFeedItem} onClick={() => setDetailTarget(ticket)}>
              <div className={styles.notesFeedTop}>
                <span className={styles.notesFeedFolio}>{ticket.folio} · {ticket.subject}</span>
                <span className={styles.notesFeedTime}>{timeAgo(note.createdAt)}</span>
              </div>
              <p className={styles.notesFeedText}>{note.text}</p>
              <p className={styles.notesFeedAuthor}>{note.authorName}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
