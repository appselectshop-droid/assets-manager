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

// Sin sidebar fijo a propósito — pedido explícito de dirección: "que ya no se
// vea el recuadro lateral enlistando las cosas", una barra superior delgada +
// un botón "Menú" que abre una pantalla de selección (como el menú de
// Facebook), en vez de una lista permanente en todas las pantallas. Mesa de
// Ayuda ya NO aparece aquí — es el portal del EMPLEADO, Sistemas no navega
// hacia allá desde su propio panel.
export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [menuOpen, setMenuOpen] = useState(false);
  const [menuBlock, setMenuBlock] = useState(null); // null = eligiendo bloque | 'admin' = viendo sus páginas

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const erpOnly = isErpOnlyUser(user);
  const initials = user.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U';

  // Cerrar el menú solo al cambiar de página real (no en cada render) — así
  // elegir una tarjeta navega y el overlay se cierra solo.
  useEffect(() => { setMenuOpen(false); setMenuBlock(null); }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  // Alguien ERP-only no tiene Dashboard/Indicadores (ver NotErpOnlyRoute en
  // App.jsx, la redirige de cualquier forma) — el logo lo manda directo a su
  // única página real.
  const goHome = () => navigate(erpOnly ? '/platform-accounts-erp' : '/');

  const openMenu = () => { setMenuOpen(true); setMenuBlock(null); };
  const closeMenu = () => { setMenuOpen(false); setMenuBlock(null); };
  const goTo = (to) => { navigate(to); closeMenu(); };

  // Páginas de cuentas — mismo criterio de permisos que ya existía (por
  // categoría: Gmail/Plataformas/ERP, cada quien ve solo lo suyo).
  const accountPages = [
    user.canManageGmailAccounts        && { to: '/gmail-accounts',        icon: '🔐', label: 'Gmail' },
    user.canManagePlatformAccounts     && { to: '/platform-accounts',     icon: '🌐', label: 'Plataformas' },
    user.canManagePlatformAccountsErp  && { to: '/platform-accounts-erp', icon: '🏭', label: 'Plataformas ERP' },
    (user.canManageGmailAccounts || user.canManagePlatformAccounts) && { to: '/account-requests', icon: '📝', label: 'Solicitudes de Cuentas' },
    user.canManagePlatformAccountsErp  && { to: '/account-requests-erp', icon: '📝', label: 'Solicitudes ERP' },
  ].filter(Boolean);

  // Todo dentro de "Administración de Usuarios y Activos" es un solo nivel de
  // navegación (clic y llegas) — los grupos de abajo son solo encabezados
  // visuales para no ver 18 tarjetas sueltas sin ningún orden.
  const adminGroups = [
    {
      title: 'Catálogos y Activos',
      items: [
        { to: '/stock', icon: '📈', label: 'Disponibilidad' },
        { to: '/employees', icon: '👥', label: 'Empleados' },
        { to: '/assets', icon: '💻', label: 'Activos' },
        { to: '/accessories', icon: '🖱️', label: 'Accesorios' },
        { to: '/assignments', icon: '🔗', label: 'Asignaciones' },
        (user.role === 'admin' || user.canManageGmailAccounts || user.canManagePlatformAccounts || user.canManagePlatformAccountsErp) &&
          { to: '/responsivas', icon: '📄', label: 'Responsivas' },
      ].filter(Boolean),
    },
    accountPages.length > 0 && { title: 'Cuentas y Plataformas', items: accountPages },
    user.role === 'admin' && {
      title: 'Operación',
      items: [
        { to: '/shipments', icon: '🚚', label: 'Envíos entre Sucursales' },
        { to: '/tickets', icon: '🎫', label: 'Tickets' },
        { to: '/onboarding-requests', icon: '🧑‍💼', label: 'Ingresos RH' },
        { to: '/resource-requests', icon: '📦', label: 'Solicitudes de Recursos' },
      ],
    },
    user.role === 'admin' && {
      title: 'Sistema',
      items: [
        { to: '/users', icon: '⚙️', label: 'Usuarios' },
        { to: '/audit', icon: '📋', label: 'Auditoría' },
        { to: '/network-layouts', icon: '🛰️', label: 'Planos de Red' },
        { to: '/internal-apps', icon: '🗂️', label: 'Aplicaciones Internas' },
      ],
    },
  ].filter(Boolean);

  const erpOnlyPages = [
    { to: '/platform-accounts-erp', icon: '🏭', label: 'Cuentas Plataformas ERP' },
    { to: '/account-requests-erp', icon: '📝', label: 'Solicitudes ERP' },
    { to: '/responsivas', icon: '📄', label: 'Responsivas' },
  ];

  return (
    <div className={styles.wrapper}>
      <header className={styles.topbar}>
        <button className={styles.topbarLogo} onClick={goHome}>
          <div className={styles.logoIcon}>📦</div>
          <span className={styles.logoText}>Assets Manager</span>
        </button>

        <button className={styles.menuBtn} onClick={openMenu}>
          <span className={styles.menuIcon}>☰</span>
          <span>Menú</span>
        </button>

        <div className={styles.topbarUser}>
          <div className={styles.userAvatar} title={user.name}>{initials}</div>
          <span className={styles.userName}>{user.name}</span>
          <button className={styles.logoutBtn} onClick={handleLogout} title="Cerrar sesión">⏻</button>
        </div>
      </header>

      {menuOpen && (
        <div className={styles.menuBackdrop} onClick={closeMenu}>
          <div className={styles.menuPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.menuHeader}>
              {!erpOnly && menuBlock && (
                <button className={styles.menuBack} onClick={() => setMenuBlock(null)}>← Volver</button>
              )}
              <h2 className={styles.menuTitle}>
                {erpOnly ? 'Menú' : menuBlock === 'admin' ? 'Administración de Usuarios y Activos' : 'Menú'}
              </h2>
              <button className={styles.menuClose} onClick={closeMenu} aria-label="Cerrar">✕</button>
            </div>

            {erpOnly ? (
              <div className={styles.tileGrid}>
                {erpOnlyPages.map((p) => (
                  <button
                    key={p.to}
                    className={`${styles.tile} ${location.pathname === p.to ? styles.tileActive : ''}`}
                    onClick={() => goTo(p.to)}
                  >
                    <span className={styles.tileIcon}>{p.icon}</span>
                    <span className={styles.tileLabel}>{p.label}</span>
                  </button>
                ))}
              </div>
            ) : menuBlock === 'admin' ? (
              <div className={styles.pageGroups}>
                {adminGroups.map((g) => (
                  <div key={g.title}>
                    <h3 className={styles.pageGroupTitle}>{g.title}</h3>
                    <div className={styles.tileGrid}>
                      {g.items.map((p) => (
                        <button
                          key={p.to}
                          className={`${styles.tile} ${location.pathname === p.to ? styles.tileActive : ''}`}
                          onClick={() => goTo(p.to)}
                        >
                          <span className={styles.tileIcon}>{p.icon}</span>
                          <span className={styles.tileLabel}>{p.label}</span>
                        </button>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className={styles.blockGrid}>
                <button className={styles.blockTile} onClick={() => setMenuBlock('admin')}>
                  <span className={styles.blockIcon}>🗂️</span>
                  <span className={styles.blockLabel}>Administración de Usuarios y Activos</span>
                  <span className={styles.blockSub}>Catálogos, activos, cuentas, envíos, usuarios</span>
                </button>
                <button className={styles.blockTile} onClick={() => goTo('/indicadores')}>
                  <span className={styles.blockIcon}>🎯</span>
                  <span className={styles.blockLabel}>Indicadores</span>
                  <span className={styles.blockSub}>KPIs de servicio del área</span>
                </button>
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
