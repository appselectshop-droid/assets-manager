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

// Tarjeta visual compartida entre "ver una categoría" y "ver todo junto" — un
// solo componente para no repetir el JSX. `accent`/`bg` le dan a cada
// categoría su propio color (pedido explícito: que se sienta visual/
// interactivo, como el home de Facebook, no una lista plana). `bg` se pasa
// ya calculado desde JS (no con la función CSS color-mix(), que en algunos
// navegadores no está soportada y hacía que todo se viera gris).
function TileGrid({ items, onClick, activePath, accent, bg }) {
  return (
    <div className={styles.tileGrid}>
      {items.map((p) => (
        <button
          key={p.to}
          className={`${styles.tile} ${activePath === p.to ? styles.tileActive : ''}`}
          style={{ '--accent': accent, '--accent-bg': bg }}
          onClick={() => onClick(p.to)}
        >
          <span className={styles.tileIcon}>{p.icon}</span>
          <span className={styles.tileLabel}>{p.label}</span>
          {p.desc && <span className={styles.tileDesc}>{p.desc}</span>}
        </button>
      ))}
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
  const initials = user.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U';

  // Cerrar el menú solo al cambiar de página real (no en cada render) — así
  // elegir una tarjeta navega y el overlay se cierra solo.
  useEffect(() => { setMenuOpen(false); setMenuCategory(null); }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Alguien ERP-only no tiene Dashboard/Indicadores (ver NotErpOnlyRoute en
  // App.jsx, la redirige de cualquier forma) — el logo lo manda directo a su
  // única página real.
  const goHome = () => navigate(erpOnly ? '/platform-accounts-erp' : '/');

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

  // Auditoría, Planos de Red y Aplicaciones Internas viven aquí — pedido
  // explícito: no son "configuración", son operación del área.
  const operacionItems = user.role === 'admin' ? [
    { to: '/shipments', icon: '🚚', label: 'Envíos entre Sucursales', desc: 'Traslado de equipo' },
    { to: '/tickets', icon: '🎫', label: 'Tickets', desc: 'Soporte a empleados' },
    { to: '/onboarding-requests', icon: '🧑‍💼', label: 'Ingresos RH', desc: 'Altas de personal' },
    { to: '/resource-requests', icon: '📦', label: 'Solicitudes de Recursos', desc: 'Peticiones de equipo' },
    { to: '/audit', icon: '📋', label: 'Auditoría', desc: 'Bitácora de cambios' },
    { to: '/network-layouts', icon: '🛰️', label: 'Planos de Red', desc: 'Topología de red' },
    { to: '/internal-apps', icon: '🗂️', label: 'Aplicaciones Internas', desc: 'Catálogo de sistemas' },
  ] : [];

  const CATEGORIES = [
    { key: 'catalogos', title: 'Catálogos y Activos', items: catalogosItems, accent: '#2563eb', bg: '#eff6ff' },
    accountPages.length > 0 && { key: 'cuentas', title: 'Cuentas y Plataformas', items: accountPages, accent: '#7c3aed', bg: '#f5f3ff' },
    operacionItems.length > 0 && { key: 'operacion', title: 'Operación', items: operacionItems, accent: '#16a34a', bg: '#f0fdf4' },
  ].filter(Boolean);

  const indicadoresItem = { to: '/indicadores', icon: '🎯', label: 'Indicadores', desc: 'KPIs de servicio del área' };

  const erpOnlyPages = [
    { to: '/platform-accounts-erp', icon: '🏭', label: 'Cuentas Plataformas ERP' },
    { to: '/account-requests-erp', icon: '📝', label: 'Solicitudes ERP' },
    { to: '/responsivas', icon: '📄', label: 'Responsivas' },
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

        {/* Centro: botones de categoría repartidos a lo largo de la barra */}
        {!erpOnly && (
          <nav className={styles.topbarCats}>
            {CATEGORIES.map((c) => (
              <button key={c.key} className={styles.catBtn} style={{ '--accent': c.accent }} onClick={() => openMenu(c.key)}>{c.title}</button>
            ))}
            <button className={styles.catBtn} style={{ '--accent': '#E8431A' }} onClick={() => navigate('/indicadores')}>Indicadores</button>
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
              {!erpOnly && menuCategory && (
                <button className={styles.menuBack} onClick={() => setMenuCategory(null)}>← Volver</button>
              )}
              <h2 className={styles.menuTitle}>
                {erpOnly ? 'Menú' : activeCategory ? activeCategory.title : 'Menú'}
              </h2>
              <button className={styles.menuClose} onClick={closeMenu} aria-label="Cerrar">✕</button>
            </div>

            {erpOnly ? (
              <TileGrid items={erpOnlyPages} onClick={goTo} activePath={location.pathname} accent="#E8431A" bg="#fff5f2" />
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
                <div>
                  <h3 className={styles.pageGroupTitle}>Indicadores</h3>
                  <TileGrid items={[indicadoresItem]} onClick={goTo} activePath={location.pathname} accent="#E8431A" bg="#fff5f2" />
                </div>
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
