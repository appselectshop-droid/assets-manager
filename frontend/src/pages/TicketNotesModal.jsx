import InternalNotesPanel from '../components/InternalNotesPanel';
import styles from './Tickets.module.css';

// Modal ligero "solo Notas internas" — pedido explícito del usuario
// (2026-07-24): al buscar el procedimiento seguido en un ticket pasado
// (ver TicketsNotasInternas.jsx), lo que importa es leer/agregar las notas
// técnicas de ESE ticket, no administrarlo (estatus, asignación, SLA,
// conversación con el empleado) — para eso ya está el Buscador/Tablero,
// que sí abren el TicketDetailModal completo.
export default function TicketNotesModal({ ticket, currentUser, onClose }) {
  return (
    <div className={styles.overlay} onClick={onClose}>
      <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
        <div className={styles.modalHeader}>
          <span className={styles.modalIcon}>🔒</span>
          <h2 className={styles.modalTitle}>{ticket.folio} · {ticket.subject}</h2>
          <button className={styles.closeBtn} onClick={onClose}>✕</button>
        </div>
        <div className={styles.modalBody}>
          <InternalNotesPanel ticket={ticket} currentUser={currentUser} />
        </div>
      </div>
    </div>
  );
}
