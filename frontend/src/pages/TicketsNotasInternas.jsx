import { useMemo, useState } from 'react';
import { useTicketsContext } from './TicketsLayout';
import { timeAgo } from './ticketShared';
import TicketNotesModal from './TicketNotesModal';
import styles from './Tickets.module.css';

// "Notas internas" — pedido explícito del usuario: categoría propia con el
// feed de TODAS las notas internas de TODOS los tickets, no solo las de un
// ticket a la vez (que es como ya se veían dentro del detalle).
//
// Agrupado por TICKET, no por nota (2026-07-24, pedido explícito): antes
// cada nota era su propio renglón (un ticket con 5 notas producía 5
// renglones casi idénticos) y al hacer clic se abría el ticket COMPLETO
// (estatus, asignación, SLA...) — pero lo que de verdad importa aquí es
// leer/agregar el procedimiento seguido en ese ticket, no administrarlo
// (para eso ya está el Buscador/Tablero). Ahora hay un renglón por ticket
// (con la nota más reciente como vista previa) y el clic abre
// TicketNotesModal (solo notas), no TicketDetailModal.
export default function TicketsNotasInternas() {
  const { tickets, loading, currentUser, load } = useTicketsContext();
  const [q, setQ] = useState('');
  const [notesTarget, setNotesTarget] = useState(null);

  const groups = useMemo(() => {
    return tickets
      .filter((t) => (t.internalNotes || []).length > 0)
      .map((t) => {
        const notes = [...t.internalNotes].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        return { ticket: t, notes, latest: notes[0] };
      })
      .sort((a, b) => new Date(b.latest.createdAt) - new Date(a.latest.createdAt));
  }, [tickets]);

  const filteredGroups = useMemo(() => {
    const query = q.trim().toLowerCase();
    if (!query) return groups;
    return groups.filter(({ ticket }) => (
      ticket.folio?.toLowerCase().includes(query)
      || ticket.subject?.toLowerCase().includes(query)
      || ticket.employeeName?.toLowerCase().includes(query)
    ));
  }, [groups, q]);

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

      <input
        className={styles.searchInput}
        type="text"
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Busca el seguimiento de un ticket: folio, asunto o quién lo reportó..."
      />

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : filteredGroups.length === 0 ? (
        <p className={styles.empty}>{q.trim() ? `Sin resultados para "${q.trim()}"` : 'Todavía no hay notas internas registradas'}</p>
      ) : (
        <div className={styles.notesFeed}>
          {filteredGroups.map(({ ticket, notes, latest }) => (
            <div key={ticket._id} className={styles.notesFeedItem} onClick={() => setNotesTarget(ticket)}>
              <div className={styles.notesFeedTop}>
                <span className={styles.notesFeedFolio}>{ticket.folio} · {ticket.subject}</span>
                <span className={styles.notesFeedTime}>{timeAgo(latest.createdAt)}</span>
              </div>
              <p className={styles.notesFeedText}>{latest.text || '📎 Adjunto sin texto'}</p>
              <p className={styles.notesFeedAuthor}>
                {latest.authorName} · {notes.length} {notes.length === 1 ? 'nota' : 'notas'}
              </p>
            </div>
          ))}
        </div>
      )}

      {notesTarget && (
        <TicketNotesModal
          ticket={notesTarget}
          currentUser={currentUser}
          onClose={() => { setNotesTarget(null); load(); }}
        />
      )}
    </div>
  );
}
