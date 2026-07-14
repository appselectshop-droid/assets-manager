import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import styles from './MisTickets.module.css';

const TICKET_TYPE_LABELS = {
  hardware: '🖥️ Hardware', software: '💾 Software', red: '📶 Red / Conectividad',
  cuenta_acceso: '🔐 Cuenta / Acceso', otro: '❓ Otro',
};
const STATUS_CONFIG = {
  abierto: { label: 'Abierto', color: '#d97706', bg: '#fffbeb' },
  en_proceso: { label: 'En proceso', color: '#2563eb', bg: '#eff6ff' },
  resuelto: { label: 'Resuelto', color: '#16a34a', bg: '#f0fdf4' },
  cerrado: { label: 'Cerrado', color: '#666', bg: '#f5f5f5' },
};

function formatDate(d) {
  return new Date(d).toLocaleString('es-MX', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' });
}

// Cada ticket como una mini-conversación: el reporte inicial (siempre) y la
// resolución de Sistemas (si ya la hay) — reutiliza los campos que el
// ticket ya tenía (subject/description/resolution/resolutionNotes), sin
// modelo de mensajes nuevo. Ver CHANGELOG: primera versión, solo visual.
function TicketThread({ ticket }) {
  const sc = STATUS_CONFIG[ticket.status] || STATUS_CONFIG.abierto;
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

      {ticket.resolvedAt ? (
        <div className={`${styles.bubbleRow} ${styles.bubbleRowRight}`}>
          <div className={`${styles.bubbleGroup} ${styles.bubbleGroupRight}`}>
            <p className={styles.bubbleAuthor}>Sistemas</p>
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
    </div>
  );
}

// Portal del empleado (requiere sesión — ver EmployeeLogin.jsx): su propio
// historial de tickets, ligado a su identidad real (Ticket.employeeRef),
// no a un nombre escrito a mano como en la versión anterior sin login.
export default function MisTickets() {
  const navigate = useNavigate();
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const user = JSON.parse(localStorage.getItem('employeeUser') || '{}');

  useEffect(() => {
    employeeApi.get('/tickets/mine')
      .then(({ data }) => setTickets(data))
      .finally(() => setLoading(false));
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeUser');
    navigate('/empleado/login');
  };

  return (
    <div className={styles.page}>
      <div className={styles.wrap}>
        <div className={styles.topBar}>
          <p className={styles.greeting}>Hola, {user.name || ''} 👋</p>
          <button className={styles.logoutBtn} onClick={handleLogout}>Cerrar sesión</button>
        </div>

        <Link to="/reportar-ticket" className={styles.newBtn}>+ Reportar un problema nuevo</Link>

        {loading && <p className={styles.empty}>Cargando tu historial...</p>}
        {!loading && tickets.length === 0 && (
          <div className={styles.empty}>Todavía no has reportado ningún ticket.</div>
        )}
        {!loading && tickets.map((t) => <TicketThread key={t._id} ticket={t} />)}
      </div>
    </div>
  );
}
