import { useState, useEffect } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

// Un usuario cuyo ÚNICO permiso es Plataformas ERP (nada de Gmail, Plataformas
// generales ni rol admin) no tiene por qué ver el resto de la aplicación —
// solo su página de cuentas y su propio historial de Responsivas.
export function isErpOnlyUser(user) {
  return user.role !== 'admin'
    && !user.canManageGmailAccounts
    && !user.canManagePlatformAccounts
    && !!user.canManagePlatformAccountsErp;
}

// Mismo criterio, para BI (2026-07-30) — alguien que solo tiene el permiso
// de Soporte BI entra restringido a sus propias páginas de Bases de
// Datos/Proyectos, sin gestionar cuentas ni ver el resto del panel.
export function isBiOnlyUser(user) {
  return user.role !== 'admin' && !!user.canManageBiRequests;
}

// Tarjeta visual compartida entre "ver una categoría" y "ver todo junto" — un
// solo componente para no repetir el JSX. `accent`/`bg` le dan a cada
// categoría su propio color (pedido explícito: que se sienta visual/
// interactivo, como el home de Facebook, no una lista plana). `bg` se pasa
// ya calculado desde JS (no con la función CSS color-mix(), que en algunos
// navegadores no está soportada y hacía que todo se viera gris).
function TileGrid({ items, onClick, activePath, accent, bg }) {
  return (
    <div className={styles.tileGrid}>
      {items.map((p) => {
        // Coincidencia exacta o de "prefijo + /" — necesario desde que Tickets
        // se volvió una mini-app con sub-rutas (/tickets/general, /tickets/chats,
        // etc.): sin esto, el tile se apagaba en cuanto se navegaba a cualquier
        // sub-página en vez de quedarse en /tickets (el índice).
        const isActive = activePath === p.to || activePath.startsWith(`${p.to}/`);
        return (
        <button
          key={p.to}
          className={`${styles.tile} ${isActive ? styles.tileActive : ''}`}
          style={{ '--accent': accent, '--accent-bg': bg }}
          onClick={() => onClick(p.to)}
        >
          <span className={styles.tileIcon}>{p.icon}</span>
          <span className={styles.tileLabel}>{p.label}</span>
          {p.desc && <span className={styles.tileDesc}>{p.desc}</span>}
        </button>
        );
      })}
    </div>
  );
}

// Sin sidebar fijo a propósito — pedido explícito de dirección: "que ya no se
// vea el recuadro lateral enlistando las cosas". Segunda vuelta de feedback:
// las categorías (antes sub-encabezados dentro de un solo bloque
// "Administración") ahora son botones directos en la barra superior — como
// los íconos del home de Facebook, pero con el nombre en vez de ícono — y el
// botón "Menú" se conserva para ver TODO junto en una sola pantalla visual
// (sin números — eso es trabajo de Indicadores, no del menú). El engranaje
// (⚙️) es su propio botón aparte, solo para Usuarios — Auditoría/Planos de
// Red/Aplicaciones Internas NO son configuración, viven en Operación.
export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuCategory, setMenuCategory] = useState(null); // null = todo junto | key de una categoría

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const erpOnly = isErpOnlyUser(user);
  const biOnly = isBiOnlyUser(user);
  const initials = user.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U';

  // Cerrar el menú solo al cambiar de página real (no en cada render) — así
  // elegir una tarjeta navega y el overlay se cierra solo.
  useEffect(() => { setMenuOpen(false); setMenuCategory(null); }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Alguien ERP-only o BI-only no tiene Dashboard/Indicadores (ver
  // NotErpOnlyRoute/BiRoute en App.jsx, la redirige de cualquier forma) —
  // el logo lo manda directo a su única página real.
  const goHome = () => navigate(erpOnly ? '/platform-accounts-erp' : biOnly ? '/bi/database-requests' : '/');

  const openMenu = (category = null) => { setMenuOpen(true); setMenuCategory(category); };
  const closeMenu = () => { setMenuOpen(false); setMenuCategory(null); };
  const goTo = (to) => { navigate(to); closeMenu(); };

  // Páginas de cuentas — mismo criterio de permisos que ya existía (por
  // categoría: Gmail/Plataformas/ERP, cada quien ve solo lo suyo).
  const accountPages = [
    user.canManageGmailAccounts        && { to: '/gmail-accounts',        icon: '🔐', label: 'Gmail', desc: 'Cuentas de correo' },
    user.canManagePlatformAccounts     && { to: '/platform-accounts',     icon: '🌐', label: 'Plataformas', desc: 'Cuentas de plataformas externas' },
    user.canManagePlatformAccountsErp  && { to: '/platform-accounts-erp', icon: '🏭', label: 'Plataformas ERP', desc: 'Accesos al ERP' },
    (user.canManageGmailAccounts || user.canManagePlatformAccounts) && { to: '/account-requests', icon: '📝', label: 'Solicitudes de Cuentas', desc: 'Altas pendientes' },
    user.canManagePlatformAccountsErp  && { to: '/account-requests-erp', icon: '📝', label: 'Solicitudes ERP', desc: 'Altas ERP pendientes' },
  ].filter(Boolean);

  const catalogosItems = [
    { to: '/stock', icon: '📈', label: 'Disponibilidad', desc: 'Inventario por sucursal' },
    { to: '/employees', icon: '👥', label: 'Empleados', desc: 'Catálogo de personal' },
    { to: '/assets', icon: '💻', label: 'Activos', desc: 'Equipos de cómputo' },
    { to: '/accessories', icon: '🖱️', label: 'Accesorios', desc: 'Periféricos y consumibles' },
    { to: '/assignments', icon: '🔗', label: 'Asignaciones', desc: 'Equipo asignado a personal' },
    (user.role === 'admin' || user.canManageGmailAccounts || user.canManagePlatformAccounts || user.canManagePlatformAccountsErp) &&
      { to: '/responsivas', icon: '📄', label: 'Responsivas', desc: 'Documentos de resguardo' },
  ].filter(Boolean);

  // Auditoría, Planos de Red y Sucursales viven aquí — pedido explícito: no
  // son "configuración", son operación del área. Tickets (con Aplicaciones
  // Internas adentro) vive en su propio link directo (ver ticketsItem
  // abajo) — pedido explícito del usuario: el sistema de tickets ya creció
  // bastante y vivía escondido aquí mezclado con cosas que no son tickets.
  const operacionItems = user.role === 'admin' ? [
    { to: '/shipments', icon: '🚚', label: 'Envíos entre Sucursales', desc: 'Traslado de equipo' },
    { to: '/onboarding-requests', icon: '🧑‍💼', label: 'Ingresos RH', desc: 'Altas de personal' },
    { to: '/offboarding-requests', icon: '📤', label: 'Bajas RH', desc: 'Bajas y devolución de activos' },
    { to: '/resource-requests', icon: '📦', label: 'Solicitudes de Recursos', desc: 'Peticiones de equipo' },
    { to: '/audit', icon: '📋', label: 'Auditoría', desc: 'Bitácora de cambios' },
    { to: '/network-layouts', icon: '🛰️', label: 'Planos de Red', desc: 'Topología de red' },
  ] : [];

  // El sistema de tickets ya tiene su propio sidebar desplegable adentro
  // (ver TicketsLayout.jsx, incluye ahí mismo Aplicaciones Internas) — pedido
  // explícito del usuario: ya no necesita ser una categoría más aquí arriba
  // con un dropdown, es un solo link directo, igual que Indicadores. Mismo
  // gate que tenía antes (solo admin — el acceso ERP-only tiene su propio
  // nav aparte, ver erpOnlyPages).
  const ticketsItem = user.role === 'admin'
    ? { to: '/tickets', icon: '🎫', label: 'Tickets', desc: 'Tablero, SLA, chats, escalamiento...' }
    : null;

  const CATEGORIES = [
    { key: 'catalogos', title: 'Catálogos y Activos', items: catalogosItems, accent: '#2563eb', bg: '#eff6ff' },
    accountPages.length > 0 && { key: 'cuentas', title: 'Cuentas y Plataformas', items: accountPages, accent: '#7c3aed', bg: '#f5f3ff' },
    operacionItems.length > 0 && { key: 'operacion', title: 'Operación', items: operacionItems, accent: '#16a34a', bg: '#f0fdf4' },
  ].filter(Boolean);

  const indicadoresItem = { to: '/indicadores', icon: '🎯', label: 'Indicadores', desc: 'KPIs de servicio del área' };

  // Solo el gerente (o quien tenga este permiso) ve este link — pedido
  // explícito del usuario (2026-07-30): "un botón de categoría donde
  // monitoree a Sistemas y ERP" con todo lo que un jefe quiere ver de su
  // equipo (tickets, envíos, altas, bajas, cuentas, recursos,
  // responsivas) — mismo patrón directo que Tickets/Indicadores, no un
  // dropdown de categoría. Primer intento (una pestaña "Equipo" dentro de
  // Tickets) quedó mal ubicado, ver CHANGELOG.
  const gerenciaItem = user.canViewManagerDashboard
    ? { to: '/gerencia', icon: '🧭', label: 'Gerencia', desc: 'Supervisión de Sistemas + ERP' }
    : null;

  // BI — pedido explícito del usuario (2026-07-30): "hacerle páginas en
  // donde revisen los temas de las bases de datos que les solicitan y los
  // proyectos". Mismo link directo que Tickets/Indicadores/Gerencia para
  // un admin normal; BI-only entra por su propio nav plano (ver
  // biOnlyPages) en vez de por aquí.
  const biItem = user.role === 'admin'
    ? { to: '/bi/database-requests', icon: '🗄️', label: 'BI', desc: 'Bases de Datos y Proyectos' }
    : null;

  const biOnlyPages = [
    { to: '/bi/database-requests', icon: '🗄️', label: 'Bases de Datos', desc: 'Solicitudes de bases de datos' },
    { to: '/bi/projects', icon: '📊', label: 'Proyectos', desc: 'Proyectos de análisis de datos' },
    { to: '/bi/soporte', icon: '❓', label: 'Soporte', desc: 'Dudas o problemas puntuales' },
  ];

  const erpOnlyPages = [
    { to: '/platform-accounts-erp', icon: '🏭', label: 'Cuentas Plataformas ERP' },
    { to: '/account-requests-erp', icon: '📝', label: 'Solicitudes ERP' },
    { to: '/responsivas', icon: '📄', label: 'Responsivas' },
    { to: '/tickets', icon: '🎫', label: 'Tickets ERP', desc: 'Solo los tickets de tipo ERP' },
    // Solo lectura — pedido explícito del usuario (2026-07-24): para
    // correlacionar un correo corporativo con el empleado y ver si ya
    // tiene acceso ERP, sin activos ni otras cuentas (ver EmployeesErp.jsx).
    { to: '/employees', icon: '👥', label: 'Empleados', desc: 'Solo lectura' },
  ];

  const activeCategory = CATEGORIES.find((c) => c.key === menuCategory);

  return (
    <div className={styles.wrapper}>
      <header className={styles.topbar}>
        {/* Grupo izquierdo: logo + Menú, uno al lado del otro */}
        <div className={styles.topbarLeft}>
          <button className={styles.topbarLogo} onClick={goHome}>
            <div className={styles.logoIcon}>📦</div>
            <span className={styles.logoText}>Assets Manager</span>
          </button>
          <button className={styles.menuBtn} onClick={() => openMenu(null)}>
            <span className={styles.menuIcon}>☰</span>
            <span>Menú</span>
          </button>
        </div>

        {/* Centro: botones de categoría repartidos a lo largo de la barra.
            Un usuario ERP-only no tiene categorías con sub-páginas (ver
            CATEGORIES arriba) — sus 4 páginas reales (erpOnlyPages) van
            directas como botones sueltos, mismo patrón que ya usan
            Tickets/Indicadores para el resto, en vez de quedar escondidas
            solo detrás de "Menú". */}
        {erpOnly ? (
          <nav className={styles.topbarCats}>
            {erpOnlyPages.map((p) => (
              <button key={p.to} className={styles.catBtn} style={{ '--accent': '#E8431A' }} onClick={() => navigate(p.to)}>{p.label}</button>
            ))}
          </nav>
        ) : biOnly ? (
          <nav className={styles.topbarCats}>
            {biOnlyPages.map((p) => (
              <button key={p.to} className={styles.catBtn} style={{ '--accent': '#7c3aed' }} onClick={() => navigate(p.to)}>{p.label}</button>
            ))}
          </nav>
        ) : (
          <nav className={styles.topbarCats}>
            {CATEGORIES.map((c) => (
              <button key={c.key} className={styles.catBtn} style={{ '--accent': c.accent }} onClick={() => openMenu(c.key)}>{c.title}</button>
            ))}
            {ticketsItem && (
              <button className={styles.catBtn} style={{ '--accent': '#0d9488' }} onClick={() => navigate('/tickets')}>Tickets</button>
            )}
            <button className={styles.catBtn} style={{ '--accent': '#E8431A' }} onClick={() => navigate('/indicadores')}>Indicadores</button>
            {gerenciaItem && (
              <button className={styles.catBtn} style={{ '--accent': '#7c3aed' }} onClick={() => navigate('/gerencia')}>Gerencia</button>
            )}
            {biItem && (
              <button className={styles.catBtn} style={{ '--accent': '#7c3aed' }} onClick={() => navigate('/bi/database-requests')}>BI</button>
            )}
          </nav>
        )}

        {/* Grupo derecho: engranaje justo al lado del usuario/admin */}
        <div className={styles.topbarRight}>
          {user.role === 'admin' && !erpOnly && (
            <button className={styles.gearBtn} onClick={() => navigate('/users')} title="Configuración — Usuarios">⚙️</button>
          )}
          <div className={styles.topbarUser}>
            <div className={styles.userAvatar} title={user.name}>{initials}</div>
            <span className={styles.userName}>{user.name}</span>
            <button className={styles.logoutBtn} onClick={handleLogout} title="Cerrar sesión">⏻</button>
          </div>
        </div>
      </header>

      {menuOpen && (
        <div className={styles.menuBackdrop} onClick={closeMenu}>
          <div className={styles.menuPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.menuHeader}>
              {!erpOnly && !biOnly && menuCategory && (
                <button className={styles.menuBack} onClick={() => setMenuCategory(null)}>← Volver</button>
              )}
              <h2 className={styles.menuTitle}>
                {erpOnly || biOnly ? 'Menú' : activeCategory ? activeCategory.title : 'Menú'}
              </h2>
              <button className={styles.menuClose} onClick={closeMenu} aria-label="Cerrar">✕</button>
            </div>

            {erpOnly ? (
              <TileGrid items={erpOnlyPages} onClick={goTo} activePath={location.pathname} accent="#E8431A" bg="#fff5f2" />
            ) : biOnly ? (
              <TileGrid items={biOnlyPages} onClick={goTo} activePath={location.pathname} accent="#7c3aed" bg="#f5f3ff" />
            ) : activeCategory ? (
              <TileGrid items={activeCategory.items} onClick={goTo} activePath={location.pathname} accent={activeCategory.accent} bg={activeCategory.bg} />
            ) : (
              <div className={styles.allGroups}>
                <div>
                  <h3 className={styles.pageGroupTitle}>Inicio</h3>
                  <TileGrid
                    items={[{ to: '/', icon: '🏠', label: 'Inicio', desc: 'Accesos directos y pendientes' }]}
                    onClick={goTo}
                    activePath={location.pathname}
                    accent="#374151"
                    bg="#f3f4f6"
                  />
                </div>
                {CATEGORIES.map((c) => (
                  <div key={c.key}>
                    <h3 className={styles.pageGroupTitle}>{c.title}</h3>
                    <TileGrid items={c.items} onClick={goTo} activePath={location.pathname} accent={c.accent} bg={c.bg} />
                  </div>
                ))}
                {ticketsItem && (
                  <div>
                    <h3 className={styles.pageGroupTitle}>Tickets</h3>
                    <TileGrid items={[ticketsItem]} onClick={goTo} activePath={location.pathname} accent="#0d9488" bg="#f0fdfa" />
                  </div>
                )}
                <div>
                  <h3 className={styles.pageGroupTitle}>Indicadores</h3>
                  <TileGrid items={[indicadoresItem]} onClick={goTo} activePath={location.pathname} accent="#E8431A" bg="#fff5f2" />
                </div>
                {gerenciaItem && (
                  <div>
                    <h3 className={styles.pageGroupTitle}>Gerencia</h3>
                    <TileGrid items={[gerenciaItem]} onClick={goTo} activePath={location.pathname} accent="#7c3aed" bg="#f5f3ff" />
                  </div>
                )}
                {biItem && (
                  <div>
                    <h3 className={styles.pageGroupTitle}>BI</h3>
                    <TileGrid items={biOnlyPages} onClick={goTo} activePath={location.pathname} accent="#7c3aed" bg="#f5f3ff" />
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
