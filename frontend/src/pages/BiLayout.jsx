import { useEffect, useState } from 'react';
import { NavLink, Outlet, useOutletContext } from 'react-router-dom';
import api from '../services/api';
import BiRequestDetailModal from '../components/BiRequestDetailModal';
// Reutiliza el cascarón de Tickets (sidebar + contenido) a propósito —
// pedido explícito del usuario (2026-07-30): BI necesita "páginas propias"
// como las de Tickets, mismo lenguaje visual, mucho más chico (solo 2
// secciones, sin sub-scopes ni notificaciones push).
import styles from './TicketsLayout.module.css';

const NAV_ITEMS = [
  { to: '/bi/database-requests', icon: '🗄️', label: 'Bases de Datos' },
  { to: '/bi/projects', icon: '📊', label: 'Proyectos' },
];

export function useBiContext() {
  return useOutletContext();
}

// Shell compartido de BI — trae los tickets `soporte_bi` UNA sola vez y los
// reparte a "Bases de Datos"/"Proyectos" vía contexto, mismo patrón que
// TicketsLayout.jsx. El filtrado real por `ticketType`/`biRequestKind`
// ocurre acá y en cada sub-página; el backend ya acota lo que llega a un
// usuario BI-only a solo tickets `soporte_bi` (ver canViewTicket en
// tickets.js), pero se filtra igual del lado del cliente por si un admin
// normal entra aquí (ellos sí reciben todos los tipos de ticket).
export default function BiLayout() {
  const [tickets, setTickets] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailTarget, setDetailTarget] = useState(null);

  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const { data } = await api.get('/tickets');
    setTickets(data.filter((t) => t.ticketType === 'soporte_bi'));
    if (!silent) setLoading(false);
  };

  useEffect(() => { load(); }, []);

  // Mismo criterio que TicketsLayout.jsx: refresco de fondo silencioso cada
  // 20s, para que una solicitud nueva o un cambio de etapa de alguien más
  // aparezca solo sin tener que recargar a mano.
  useEffect(() => {
    const interval = setInterval(() => load(true), 20000);
    return () => clearInterval(interval);
  }, []);

  const context = { tickets, loading, load, setDetailTarget };

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>🗄️</span>
          <div>
            <p className={styles.headerTitle}>Soporte BI</p>
            <p className={styles.headerSubtitle}>Bases de Datos y Proyectos</p>
          </div>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
            >
              <span className={styles.navIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </NavLink>
          ))}
        </nav>
      </aside>

      <main className={styles.main}>
        <Outlet context={context} />
      </main>

      {detailTarget && (
        <BiRequestDetailModal
          ticket={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={(updated) => { setDetailTarget(updated); load(true); }}
        />
      )}
    </div>
  );
}
