import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { isErpOnlyUser } from '../components/Layout';
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
// aparte — y volver a presionar esconde/muestra esos botones (no es solo
// "aparece al llegar", es un desplegable real). El scope elegido se guarda
// en el query string (`?scope=`) de esa misma ruta — así
// TicketsBoard.jsx/TicketsChats.jsx solo leen `useSearchParams()` en vez de
// tener su propio estado, y la barra lateral es la única fuente de verdad
// de qué scope está activo.
//
// Aplicaciones Internas ya no es su propia categoría en el nav de arriba
// (components/Layout.jsx) — pedido explícito del usuario: vive aquí, como
// una página más de este mismo sidebar desplegable.
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
  { to: '/tickets/escalamiento', icon: '🚀', label: 'Escalamiento' },
  { to: '/tickets/aplicaciones', icon: '🗂️', label: 'Aplicaciones Internas' },
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
  // Qué sección (Tickets/Chats) tiene desplegados sus sub-botones
  // Todos/Mis... — se auto-abre la que corresponde a la ruta actual, pero
  // presionar ese mismo link de nuevo la esconde (pedido explícito del
  // usuario) sin tener que salir de la página.
  const [openSection, setOpenSection] = useState(null);

  useEffect(() => {
    const active = NAV_ITEMS.find((item) => (
      item.scopeOptions && (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))
    ));
    setOpenSection(active ? active.to : null);
  }, [location.pathname]);

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
    // GET /users es adminOnly — lider.erp/analista.erp (ERP-only) recibían
    // 403 ahí y se quedaban sin nadie en el selector de "Asignar a" (ni
    // ellos mismos). Este endpoint sí los deja entrar, acotado a con quién
    // de verdad pueden compartir un ticket (ver tickets.js).
    api.get('/tickets/assignable-users').then(({ data }) => setUsers(data)).catch(() => setUsers([]));
    api.get('/tickets/resolution-options').then(({ data }) => setResolutionOptions(data)).catch(() => setResolutionOptions([]));
  }, []);

  const handleDelete = async (t) => {
    if (!confirm(`¿Eliminar el ticket "${t.subject}"? Esta acción no se puede deshacer.`)) return;
    // Antes esto no tenía try/catch — un 403 (ej. alguien sin permiso real
    // intentándolo) fallaba en silencio: no pasaba nada visible, ni se
    // recargaba la lista ni se avisaba por qué. Bug real encontrado
    // investigando un ticket atorado 13 días (ver canManageTicket en
    // backend/src/routes/tickets.js).
    try {
      await api.delete(`/tickets/${t._id}`);
      load();
      setDetailTarget(null);
    } catch (err) {
      alert(err.response?.data?.message || 'No se pudo eliminar el ticket.');
    }
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
            const isOpen = item.scopeOptions && openSection === item.to;
            return (
              <div key={item.to}>
                <NavLink
                  to={item.to}
                  end={item.end}
                  onClick={(e) => {
                    // Ya estoy en esta sección — el clic no navega a ningún
                    // lado nuevo (NavLink ya me deja aquí), solo esconde o
                    // muestra sus sub-botones Todos/Mis...
                    if (item.scopeOptions && isActiveSection) {
                      e.preventDefault();
                      setOpenSection((prev) => (prev === item.to ? null : item.to));
                    }
                  }}
                  className={({ isActive }) => `${styles.navItem} ${isActive ? styles.navItemActive : ''}`}
                >
                  <span className={styles.navIcon}>{item.icon}</span>
                  {item.label}
                </NavLink>
                {item.scopeOptions && isOpen && (
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
          canDelete={currentUser.role === 'admin' || isErpOnlyUser(currentUser)}
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
