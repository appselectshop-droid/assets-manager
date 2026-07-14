import { useEffect, useState } from 'react';
import employeeApi from '../services/employeeApi';
import PortalLayout from '../components/PortalLayout';
import styles from './MisTickets.module.css';

const TICKET_TYPE_LABELS = {
  hardware: '🖥️ Hardware', software: '💾 Software', red: '📶 Red / Conectividad',
  cuenta_acceso: '🔐 Cuenta / Acceso', otro: '❓ Otro',
};
const STATUS_CONFIG = {
  abierto: { label: 'Abierto', color: 'var(--p-amber)', bg: 'var(--p-amber-soft)', pillClass: 'pillAmber' },
  en_proceso: { label: 'En proceso', color: 'var(--p-orange)', bg: 'var(--p-orange-soft)', pillClass: 'pillOrange' },
  resuelto: { label: 'Resuelto', color: 'var(--p-green)', bg: 'var(--p-green-soft)', pillClass: 'pillGreen' },
  cerrado: { label: 'Cerrado', color: 'var(--p-gray)', bg: 'var(--p-gray-soft)', pillClass: 'pillGray' },
};

function formatDate(d) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Cada ticket como una conversación real: el reporte inicial, cualquier
// mensaje de ida y vuelta (ticket.messages — el empleado puede seguir
// escribiendo, Sistemas puede responder sin marcarlo resuelto todavía) y,
// al final, la resolución formal si ya la hay. Un mensaje nuevo sobre un
// ticket resuelto lo reabre solo (ver backend/src/routes/tickets.js).
function TicketThread({ ticket, onUpdate }) {
  const [text, setText] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.abierto;

  const handleSend = async (e) => {
    e.preventDefault();
    if (!text.trim()) return;
    setError('');
    setSending(true);
    try {
      const { data } = await employeeApi.post(`/tickets/${ticket._id}/messages`, { text: text.trim() });
      onUpdate({ ...data, appRef: ticket.appRef }); // el POST no puebla appRef, se conserva el que ya se tenía
      setText('');
    } catch (err) {
      setError(err.response?.data?.message || 'No se pudo enviar tu mensaje.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className={styles.ticketCard}>
      <div className={styles.ticketHead}>
        <div>
          <p className={styles.folio}>{ticket.folio}</p>
          <p className={styles.subject}>
            {TICKET_TYPE_LABELS[ticket.ticketType] || ticket.ticketType} · {ticket.subject}
          </p>
        </div>
        <div className={styles.badges}>
          <span className={styles.statusBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
          {ticket.appRef && <span className={styles.appBadge}>🗂️ {ticket.appRef.name}</span>}
        </div>
      </div>

      <div className={styles.bubbleRow}>
        <div className={styles.bubbleGroup}>
          <p className={styles.bubbleAuthor}>Tú</p>
          <div className={`${styles.bubble} ${styles.bubbleMine}`}>
            {ticket.description || ticket.subject}
          </div>
          <p className={styles.bubbleMeta}>{formatDate(ticket.createdAt)}</p>
        </div>
      </div>

      {(ticket.messages || []).map((m) => {
        const isMine = m.from === 'employee';
        return (
          <div key={m._id} className={`${styles.bubbleRow} ${isMine ? '' : styles.bubbleRowRight}`}>
            <div className={`${styles.bubbleGroup} ${isMine ? '' : styles.bubbleGroupRight}`}>
              <p className={styles.bubbleAuthor}>{isMine ? 'Tú' : 'Sistemas'}</p>
              <div className={`${styles.bubble} ${isMine ? styles.bubbleMine : styles.bubbleTheirs}`}>
                {m.text}
              </div>
              <p className={styles.bubbleMeta}>{formatDate(m.createdAt)}</p>
            </div>
          </div>
        );
      })}

      {ticket.resolvedAt ? (
        <div className={`${styles.bubbleRow} ${styles.bubbleRowRight}`}>
          <div className={`${styles.bubbleGroup} ${styles.bubbleGroupRight}`}>
            <p className={styles.bubbleAuthor}>Sistemas — resolución</p>
            <div className={`${styles.bubble} ${styles.bubbleTheirs}`}>
              {ticket.resolution}{ticket.resolutionNotes ? ` — ${ticket.resolutionNotes}` : ''}
            </div>
            <p className={styles.bubbleMeta}>{formatDate(ticket.resolvedAt)}</p>
          </div>
        </div>
      ) : (
        <p className={styles.waiting}>
          {ticket.status === 'en_proceso' ? 'Sistemas ya lo está atendiendo...' : 'Todavía sin respuesta de Sistemas...'}
        </p>
      )}

      {ticket.status === 'cerrado' ? (
        <p className={styles.waiting} style={{ marginTop: '0.6rem' }}>
          Este ticket ya está cerrado — reporta uno nuevo si el problema sigue.
        </p>
      ) : (
        <form onSubmit={handleSend} className={styles.composer}>
          {error && <p className={styles.composerError}>{error}</p>}
          <textarea
            className={styles.composerInput}
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={ticket.status === 'resuelto' ? '¿Sigue el problema? Cuéntanos y lo reabrimos...' : 'Escribe un mensaje de seguimiento...'}
            rows={2}
          />
          <button type="submit" className={styles.composerBtn} disabled={sending || !text.trim()}>
            {sending ? 'Enviando...' : 'Enviar'}
          </button>
        </form>
      )}
    </div>
  );
}

// Portal del empleado (requiere sesión — ver EmployeeLogin.jsx): su propio
// historial de tickets, ligado a su identidad real (Ticket.employeeRef), no a
// un nombre escrito a mano como en la versión anterior sin login. Se ve como
// lista/tabla (folio, asunto, estatus, fecha) — la conversación completa
// (TicketThread) se abre en una ventana flotante al hacer clic en un renglón.
export default function MisTickets() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedId, setSelectedId] = useState(null);

  useEffect(() => {
    employeeApi.get('/tickets/mine')
      .then(({ data }) => setTickets(data))
      .finally(() => setLoading(false));
  }, []);

  const handleUpdate = (updated) => {
    setTickets((prev) => prev.map((t) => (t._id === updated._id ? updated : t)));
  };

  const selectedTicket = tickets.find((t) => t._id === selectedId) || null;

  return (
    <PortalLayout activeNav="tickets">
      <div className={styles.mainHead}>
        <h1>Mis tickets</h1>
        <p>Tu historial de reportes y su seguimiento.</p>
      </div>

      {loading && <p className={styles.tableEmpty}>Cargando tu historial...</p>}
      {!loading && tickets.length === 0 && (
        <div className={styles.tableEmpty}>Todavía no has reportado ningún ticket.</div>
      )}

      {!loading && tickets.length > 0 && (
        <div className={styles.tablePanel}>
          <table>
            <thead>
              <tr><th>Folio</th><th>Ticket</th><th>Estatus</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {tickets.map((t) => {
                const sc = STATUS_CONFIG[t.status] || STATUS_CONFIG.abierto;
                return (
                  <tr key={t._id} onClick={() => setSelectedId(t._id)}>
                    <td><span className={styles.folioLink}>{t.folio}</span></td>
                    <td>{TICKET_TYPE_LABELS[t.ticketType] || t.ticketType} · {t.subject}</td>
                    <td><span className={`${styles.pill} ${styles[sc.pillClass]}`}><span className={styles.dot} />{sc.label.toLowerCase()}</span></td>
                    <td className={styles.date}>{formatDate(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {selectedTicket && (
        <div className={styles.overlay} onClick={() => setSelectedId(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={() => setSelectedId(null)} aria-label="Cerrar">✕</button>
            <div className={styles.modalScroll}>
              <TicketThread ticket={selectedTicket} onUpdate={handleUpdate} />
            </div>
          </div>
        </div>
      )}
    </PortalLayout>
  );
}
