import { useEffect, useState } from 'react';
import { Link, NavLink, Outlet, useLocation, useOutletContext, useSearchParams } from 'react-router-dom';
import api from '../services/api';
import { isErpOnlyUser, isBiOnlyUser } from '../components/Layout';
import usePushSubscription from '../hooks/usePushSubscription';
import PushNotificationBanner from '../components/PushNotificationBanner';
import TicketDetailModal from './TicketDetailModal';
import styles from './TicketsLayout.module.css';
import pushBannerStyles from '../components/PushNotificationBanner.module.css';

// Rutas de suscripción del lado admin (Sistemas) — ver
// backend/src/routes/adminPushSubscriptions.js.
const PUSH_SUBSCRIBE_PATH = '/admin-push-subscriptions';
const PUSH_UNSUBSCRIBE_PATH = '/admin-push-subscriptions/unsubscribe';

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
  // "Inicio" (feed) + "Indicadores" (analítica a fondo) — pedido explícito
  // del usuario (2026-07-30): "es lo mismo que indicadores, deja el
  // dashboard bien hecho para indicadores, a ese inicio hazlo tipo
  // Facebook, Instagram o LinkedIn" — mismo criterio que ya se usó para el
  // Inicio/Indicadores general de la app (ver Dashboard.jsx/Indicadores.jsx).
  { to: '/tickets', end: true, icon: '🏠', label: 'Inicio' },
  { to: '/tickets/indicadores', icon: '🎯', label: 'Indicadores' },
  {
    to: '/tickets/general', icon: '🎫', label: 'Tickets',
    scopeOptions: [{ value: 'todos', label: 'Todos' }, { value: 'mios', label: 'Mis Tickets' }],
  },
  // erpHidden/biHidden: true — pedido explícito del usuario (2026-07-24,
  // ampliado 2026-07-30 para BI): un usuario ERP-only o BI-only solo debe
  // ver/atender sus propios tickets (ver canViewTicket en
  // backend/src/routes/tickets.js) — Monitoreo, Aplicaciones Internas,
  // Cuentas Compartidas e Impresoras no tienen nada que ver con eso, son
  // catálogos/herramientas generales de Infraestructura y Soporte.
  { to: '/tickets/monitoreo', icon: '🛰️', label: 'Monitoreo', erpHidden: true, biHidden: true },
  {
    to: '/tickets/chats', icon: '💬', label: 'Chats',
    scopeOptions: [{ value: 'todos', label: 'Todos' }, { value: 'mios', label: 'Mis Chats' }],
  },
  { to: '/tickets/notas', icon: '🔒', label: 'Notas internas' },
  { to: '/tickets/buscar', icon: '🔎', label: 'Buscador' },
  { to: '/tickets/sla', icon: '📐', label: 'SLA' },
  { to: '/tickets/calificaciones', icon: '⭐', label: 'Calificaciones' },
  // biLeaderOnly (2026-08-03) — pedido explícito del usuario: solo
  // lider.bi puede escalar; nadie más del equipo de BI debe ni ver esta
  // categoría (ERP y Sistemas sí la ven completa, sin restricción extra).
  { to: '/tickets/escalamiento', icon: '🚀', label: 'Escalamiento', biLeaderOnly: true },
  { to: '/tickets/aplicaciones', icon: '🗂️', label: 'Aplicaciones Internas', erpHidden: true, biHidden: true },
  // Vivía en Catálogos y Activos — pedido explícito del usuario
  // (2026-07-24): son cuentas para reportar tickets desde una tablet
  // compartida en Mesa de Ayuda (ver CuentasCompartidas.jsx), no equipo ni
  // personal real, así que pertenecen aquí y no en el catálogo de activos.
  { to: '/tickets/cuentas-compartidas', icon: '🧑‍🤝‍🧑', label: 'Cuentas Compartidas', erpHidden: true, biHidden: true },
  // Antes hardcodeado en config/printerCatalog.js — pedido explícito del
  // usuario (2026-07-24): editable aquí sin tener que entrar a Mongo Atlas.
  { to: '/tickets/impresoras', icon: '🖨️', label: 'Impresoras', erpHidden: true, biHidden: true },
  // "Entrar como" un empleado, sin ver/guardar su contraseña real (esa la
  // maneja cada quien, y de todos modos es bcrypt — irrecuperable). Pedido
  // explícito del usuario (2026-08-03). Admin-only también en el backend
  // (POST /employee-auth/:id/impersonate) y en la ruta (ver App.jsx).
  { to: '/tickets/accesos', icon: '🔑', label: 'Accesos de Empleados', erpHidden: true, biHidden: true },
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
  const { status: pushStatus, subscribe: subscribePush, unsubscribe: unsubscribePush } = usePushSubscription({
    api, subscribePath: PUSH_SUBSCRIBE_PATH, unsubscribePath: PUSH_UNSUBSCRIBE_PATH,
  });
  // ERP-only (lider.erp/analista.erp) no ve las categorías marcadas
  // `erpHidden` — solo le corresponde el ticket tipo 'erp' (ver
  // canViewTicket en backend/src/routes/tickets.js), no el resto de
  // herramientas generales del área.
  // "lider.bi@selectshop.com.mx" hardcodeado — mismo criterio que
  // GERENTE_SISTEMAS_EMAIL/etc. en el backend (ver getEscalationTargets en
  // tickets.js): no existe un campo de rol granular, son cuentas reales.
  const isBiTeamNonLeader = isBiOnlyUser(currentUser) && currentUser.email !== 'lider.bi@selectshop.com.mx';
  const visibleNavItems = NAV_ITEMS.filter((item) => (
    (!item.erpHidden || !isErpOnlyUser(currentUser))
    && (!item.biHidden || !isBiOnlyUser(currentUser))
    && (!item.biLeaderOnly || !isBiTeamNonLeader)
  ));

  useEffect(() => {
    const active = NAV_ITEMS.find((item) => (
      item.scopeOptions && (item.end ? location.pathname === item.to : location.pathname.startsWith(item.to))
    ));
    setOpenSection(active ? active.to : null);
  }, [location.pathname]);

  // `silent` — pedido explícito del usuario: la lista de tickets se queda
  // vieja hasta que alguien le da Ctrl+R a mano (ej. un ticket nuevo del
  // empleado no aparecía solo). El refresco de fondo de abajo llama
  // `load(true)` para traer los datos sin tapar el tablero con "Cargando..."
  // cada vez — eso sí pasa en la carga inicial y tras acciones del usuario
  // (borrar, etc.), donde el aviso de carga es esperado.
  const load = async (silent = false) => {
    if (!silent) setLoading(true);
    const params = {};
    if (assetIdFilter) params.assetRef = assetIdFilter;
    const { data } = await api.get('/tickets', { params });
    // Pedido explícito del usuario (2026-08-03): la conversación de los 3
    // caminos de BI (Soporte/Bases de Datos/Proyecto) ya solo vive en el
    // Tablero de Tickets — antes (2026-07-30) BI-only solo veía "Soporte"
    // aquí porque Bases de Datos/Proyectos tenían su propia conversación en
    // sus páginas especializadas (ver BiLayout.jsx); ahora que esas páginas
    // ya no muestran chat (ver BiRequestDetailModal.jsx), BI necesita ver
    // sus 3 caminos aquí para poder platicar con quien reportó. Las páginas
    // especializadas siguen siendo donde BI aprueba/rechaza/avanza etapas/
    // entrega el archivo — ya no se duplican entre sí.
    setTickets(data);
    if (!silent) setLoading(false);

    // ?ticket=<id> (ver notificación push cuando el empleado responde un
    // ticket asignado, POST /tickets/:id/messages en el backend) — que el
    // clic en el aviso de verdad abra ese ticket. Mismo patrón que
    // MisTickets.jsx del lado empleado. Se quita de la URL de inmediato
    // para que un `load()` posterior (ej. tras borrar un ticket, o el
    // onDone del propio modal) no lo vuelva a abrir solo.
    const ticketId = searchParams.get('ticket');
    if (ticketId) {
      const found = data.find((t) => t._id === ticketId);
      if (found) setDetailTarget(found);
      searchParams.delete('ticket');
      setSearchParams(searchParams, { replace: true });
    }
  };

  useEffect(() => { load(); }, [assetIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-refresco de fondo — pedido explícito del usuario (2026-07-24): que
  // un ticket nuevo (o una respuesta del empleado) aparezca solo, sin tener
  // que recargar la página a mano. Silencioso (no toca `loading`, así que
  // no interrumpe si hay un modal abierto o se está llenando un formulario).
  // Bajado de 20s a 8s (2026-08-05, pedido explícito del usuario: "tampoco
  // es en tiempo real") para que un ticket nuevo/cambio de estatus se sienta
  // prácticamente instantáneo sin tener que forzar Ctrl+R.
  useEffect(() => {
    const interval = setInterval(() => load(true), 8000);
    return () => clearInterval(interval);
  }, [assetIdFilter]); // eslint-disable-line react-hooks/exhaustive-deps

  // `scope` separa el catálogo de BI ("Ayuda con Excel") del genérico de
  // Sistemas — se pide de nuevo cada vez que se abre un ticket distinto
  // (ver el efecto de abajo), no una sola vez al montar, porque un admin
  // normal puede abrir tanto un ticket soporte_bi como uno de hardware
  // desde el mismo Tablero.
  const loadResolutionOptions = (scope = 'general') => {
    api.get('/tickets/resolution-options', { params: { scope } }).then(({ data }) => setResolutionOptions(data)).catch(() => setResolutionOptions([]));
  };

  useEffect(() => {
    // GET /users es adminOnly — lider.erp/analista.erp (ERP-only) recibían
    // 403 ahí y se quedaban sin nadie en el selector de "Asignar a" (ni
    // ellos mismos). Este endpoint sí los deja entrar, acotado a con quién
    // de verdad pueden compartir un ticket (ver tickets.js).
    api.get('/tickets/assignable-users').then(({ data }) => setUsers(data)).catch(() => setUsers([]));
    loadResolutionOptions();
  }, []);

  // Recarga el catálogo con el scope correcto cada vez que se abre un
  // ticket distinto — soporte_bi usa el catálogo de BI, erp el suyo propio
  // (agregado 2026-08-03: antes compartía el genérico de Sistemas, mismo
  // motivo que separar canManageTicket — "sistemas no debería estar en ERP
  // y viceversa"), todo lo demás el genérico (ver loadResolutionOptions
  // arriba).
  const resolutionScopeFor = (ticket) => (
    ticket.ticketType === 'soporte_bi' ? 'bi' : ticket.ticketType === 'erp' ? 'erp' : 'general'
  );

  useEffect(() => {
    if (detailTarget) loadResolutionOptions(resolutionScopeFor(detailTarget));
  }, [detailTarget?._id]); // eslint-disable-line react-hooks/exhaustive-deps

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
            {pushStatus === 'subscribed' && (
              <button
                type="button"
                onClick={unsubscribePush}
                style={{ background: 'none', border: 'none', padding: 0, marginTop: '0.2rem', fontSize: '0.7rem', color: '#999', cursor: 'pointer' }}
              >
                🔔 Desactivar notificaciones
              </button>
            )}
          </div>
        </div>
        <nav className={styles.nav}>
          {visibleNavItems.map((item) => {
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
        <PushNotificationBanner
          status={pushStatus}
          subscribe={subscribePush}
          className={pushBannerStyles.adminTheme}
          message={<><strong>Entérate al instante</strong> cuando el empleado responda un ticket que tienes asignado.</>}
        />
        <Outlet context={context} />
      </main>

      {detailTarget && (
        <TicketDetailModal
          ticket={detailTarget}
          currentUser={currentUser}
          users={users}
          resolutionOptions={resolutionOptions}
          onResolutionOptionsChange={() => loadResolutionOptions(resolutionScopeFor(detailTarget))}
          // Eliminar es exclusivo de Administrador — pedido explícito del
          // usuario (2026-08-04): antes ERP-only/BI-only también podían.
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
