import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import TicketDetailModal from './TicketDetailModal';
import styles from './TicketsLayout.module.css';

// Pedido explícito del usuario: que el sistema de tickets se sienta como su
// propia página individual dentro de Assets Manager, con su propia barra
// lateral y categorías (Dashboard, Tickets, Monitoreo, Chats, Notas
// internas, Buscador, SLA, Calificaciones) — mismo patrón que ya usa
// PortalLayout.jsx para Mesa de Ayuda (su propio cascarón con sidebar),
// pero con la identidad visual clara del panel admin (no oscura), porque
// este vive DENTRO del panel de Sistemas, no es un portal aparte.
//
// Los datos (tickets/usuarios/catálogo de resoluciones) se piden UNA sola
// vez aquí y se comparten con todas las sub-páginas vía el context de
// React Router (`useOutletContext`) — antes cada vista hubiera tenido que
// pedir lo mismo por su cuenta. El modal de detalle también vive aquí por
// el mismo motivo: cualquier sub-página puede abrir un ticket.
//
// "Todos / Mis Tickets" y "Todos / Mis Chats" — pedido explícito del
// usuario (corrigiendo un intento anterior con un toggle dentro de la
// página): al presionar "Tickets" o "Chats" en ESTA MISMA barra lateral se
// despliegan sus dos botones (Todos / Mis...) justo debajo, sin abrir nada
// aparte. El scope elegido se guarda en el query string (`?scope=`) de esa
// misma ruta — así TicketsBoard.jsx/TicketsChats.jsx solo leen
// `useSearchParams()` en vez de tener su propio estado, y la barra lateral
// es la única fuente de verdad de qué scope está activo.
const NAV_ITEMS = [
  { to: '/tickets', end: true, icon: '📊', label: 'Dashboard' },
  {
    to: '/tickets/general', icon: '🎫', label: 'Tickets',
    scopeOptions: [{ value: 'todos', label: 'Todos' }, { value: 'mios', label: 'Mis Tickets' }],
  },
  { to: '/tickets/monitoreo', icon: '🛰️', label: 'Monitoreo' },
  {
    to: '/tickets/chats', icon: '💬', label: 'Chats',
    scopeOptions: [{ value: 'todos', label: 'Todos' }, { value: 'mios', label: 'Mis Chats' }],
  },
  { to: '/tickets/notas', icon: '🔒', label: 'Notas internas' },
  { to: '/tickets/buscar', icon: '🔎', label: 'Buscador' },
  { to: '/tickets/sla', icon: '📐', label: 'SLA' },
  { to: '/tickets/calificaciones', icon: '⭐', label: 'Calificaciones' },
];

export default function TicketsLayout() {
  const currentUser = JSON.parse(localStorage.getItem('user') || '{}');
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const currentScope = searchParams.get('scope') === 'mios' ? 'mios' : 'todos';
  const assetIdFilter = searchParams.get('assetId') || '';
  const [tickets, setTickets] = useState([]);
  const [users, setUsers] = useState([]);
  const [resolutionOptions, setResolutionOptions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [detailTarget, setDetailTarget] = useState(null);

  const load = async () => {
    setLoading(true);
    const params = {};
    if (assetIdFilter) params.assetRef = assetIdFilter;
    const { data } = await api.get('/tickets', { params });
    setTickets(data);
    setLoading(false);
  };

  useEffect(() => { load(); }, [assetIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    api.get('/users').then(({ data }) => setUsers(data)).catch(() => setUsers([]));
    api.get('/tickets/resolution-options').then(({ data }) => setResolutionOptions(data)).catch(() => setResolutionOptions([]));
  }, []);

  const handleDelete = async (t) => {
    if (!confirm(`¿Eliminar el ticket "${t.subject}"? Esta acción no se puede deshacer.`)) return;
    await api.delete(`/tickets/${t._id}`);
    load();
    setDetailTarget(null);
  };

  const clearAssetFilter = () => { searchParams.delete('assetId'); setSearchParams(searchParams); };

  const context = {
    currentUser, tickets, users, resolutionOptions, loading,
    load, setDetailTarget, assetIdFilter, clearAssetFilter,
  };

  return (
    <div className={styles.wrapper}>
      <aside className={styles.sidebar}>
        <div className={styles.header}>
          <span className={styles.headerIcon}>🎫</span>
          <div>
            <p className={styles.headerTitle}>Tickets</p>
            <p className={styles.headerSubtitle}>Soporte a empleados</p>
          </div>
        </div>
        <nav className={styles.nav}>
          {NAV_ITEMS.map((item) => {
            const isActiveSection = item.end ? location.pathname === item.to : location.pathname.startsWith(item.to);
            return (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {item.label}
                </NavLink>
                {item.scopeOptions && isActiveSection && (
                  <div className={styles.navSubRow}>
                    {item.scopeOptions.map((opt) => (
                      <Link
                        key={opt.value}
                        to={`${item.to}?scope=${opt.value}`}
                        className={`${styles.navSubBtn} ${currentScope === opt.value ? styles.navSubBtnActive : ''}`}
                      >
                        {opt.label}
                      </Link>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </nav>
      </aside>

      <main className={styles.main}>
        <Outlet context={context} />
      </main>

      {detailTarget && (
        <TicketDetailModal
          ticket={detailTarget}
          currentUser={currentUser}
          users={users}
          resolutionOptions={resolutionOptions}
          canDelete={currentUser.role === 'admin'}
          onDelete={() => handleDelete(detailTarget)}
          onClose={() => setDetailTarget(null)}
          onDone={() => { setDetailTarget(null); load(); }}
          onSilentUpdate={load}
        />
      )}
    </div>
  );
}

// Atajo para que cada sub-página no repita `useOutletContext()` a mano.
export function useTicketsContext() {
  return useOutletContext();
}
