import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
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

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem('sidebarCollapsed') === 'true');
  const onEmployees = location.pathname === '/employees';
  const employeesEstado = new URLSearchParams(location.search).get('estado');
  const onAssetsGroup = location.pathname === '/assets' || location.pathname === '/accessories';

  // Al volver a apretar el enlace del grupo estando ya en esa sección, se oculta
  // la lista de sub-enlaces en vez de simplemente recargar la misma página. Se
  // resetea (vuelve a mostrarse) en cuanto se sale de la sección, para que la
  // próxima vez que se entre aparezca de nuevo por default.
  const [employeesHidden, setEmployeesHidden] = useState(false);
  const [assetsHidden, setAssetsHidden] = useState(false);
  const [accountsHidden, setAccountsHidden] = useState(false);
  useEffect(() => { if (!onEmployees) setEmployeesHidden(false); }, [onEmployees]);
  useEffect(() => { if (!onAssetsGroup) setAssetsHidden(false); }, [onAssetsGroup]);

  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const accountLinks = [
    user.canManageGmailAccounts        && { to: '/gmail-accounts',        icon: '🔐', label: 'Gmail' },
    user.canManagePlatformAccounts     && { to: '/platform-accounts',     icon: '🌐', label: 'Plataformas' },
    user.canManagePlatformAccountsErp  && { to: '/platform-accounts-erp', icon: '🏭', label: 'Plataformas ERP' },
  ].filter(Boolean);
  // Si puede gestionar al menos un tipo de cuenta, también puede revisar
  // solicitudes — se agrega como un elemento más del mismo grupo.
  const accountsMenu = accountLinks.length > 0
    ? [...accountLinks, { to: '/account-requests', icon: '📝', label: 'Solicitudes' }]
    : [];
  const onAccountsGroup = accountsMenu.some((l) => l.to === location.pathname);
  useEffect(() => { if (!onAccountsGroup) setAccountsHidden(false); }, [onAccountsGroup]);
  const erpOnly = isErpOnlyUser(user);
  const initials = user.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U';

  useEffect(() => { setMobileOpen(false); }, [location.pathname]);

  const toggleCollapse = () => {
    setCollapsed((prev) => {
      localStorage.setItem('sidebarCollapsed', String(!prev));
      return !prev;
    });
  };

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const navLink = (to, icon, label, end = false) => (
    <NavLink
      to={to}
      end={end}
      title={collapsed ? label : undefined}
      className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
    >
      <span className={styles.linkIcon}>{icon}</span>
      <span className={styles.linkLabel}>{label}</span>
    </NavLink>
  );

  const groupLink = (to, icon, label, isOn, onToggle) => (
    <NavLink
      to={to}
      title={collapsed ? label : undefined}
      className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
      onClick={(e) => { if (isOn) { e.preventDefault(); onToggle(); } }}
    >
      <span className={styles.linkIcon}>{icon}</span>
      <span className={styles.linkLabel}>{label}</span>
    </NavLink>
  );

  // A diferencia de Empleados/Activos, "Cuentas" no es una página real —
  // agrupa 3 páginas independientes (Gmail/Plataformas/ERP, cada una con su
  // propio permiso). El botón navega a la primera disponible si aún no estás
  // en el grupo, o solo togglea la lista si ya estás dentro de alguna de ellas.
  const groupButton = (icon, label, isOn, primaryTo, onToggle) => (
    <button
      className={`${styles.link} ${styles.groupButton} ${isOn ? styles.active : ''}`}
      title={collapsed ? label : undefined}
      onClick={() => { if (isOn) onToggle(); else navigate(primaryTo); }}
    >
      <span className={styles.linkIcon}>{icon}</span>
      <span className={styles.linkLabel}>{label}</span>
    </button>
  );

  const subLink = (to, label, isActive) => (
    <button
      key={to}
      className={`${styles.subLink} ${isActive ? styles.active : ''}`}
      onClick={() => navigate(to)}
    >
      <span className={styles.linkLabel}>{label}</span>
    </button>
  );

  return (
    <div className={`${styles.wrapper} ${collapsed ? styles.wrapperCollapsed : ''}`}>
      {/* Header móvil */}
      <header className={styles.mobileHeader}>
        <button className={styles.hamburger} onClick={() => setMobileOpen(true)} aria-label="Menú">
          <span /><span /><span />
        </button>
        <div className={styles.mobileLogo}>
          <div className={styles.logoIcon}>📦</div>
          <span className={styles.logoText}>Assets Manager</span>
        </div>
        <div className={styles.mobileAvatar}>{initials}</div>
      </header>

      {/* Overlay móvil */}
      {mobileOpen && <div className={styles.overlay} onClick={() => setMobileOpen(false)} />}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${mobileOpen ? styles.sidebarOpen : ''} ${collapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>📦</div>
          <div className={styles.logoTexts}>
            <span className={styles.logoText}>Assets</span>
            <span className={styles.logoSub}>Manager</span>
          </div>
        </div>

        <nav className={styles.nav}>
          {erpOnly ? (
            <>
              <span className={styles.navSection}>Plataformas ERP</span>
              {navLink('/platform-accounts-erp', '🏭', 'Cuentas Plataformas ERP')}
              {navLink('/responsivas', '📄', 'Responsivas')}
            </>
          ) : (
            <>
              <span className={styles.navSection}>General</span>
              {navLink('/', '📊', 'Dashboard', true)}
              {navLink('/stock', '📈', 'Disponibilidad')}

              {groupLink('/employees', '👥', 'Empleados', onEmployees, () => setEmployeesHidden((v) => !v))}
              {!collapsed && onEmployees && !employeesHidden && (
                <>
                  {subLink('/employees', 'Activos', employeesEstado !== 'baja')}
                  {subLink('/employees?estado=baja', 'Bajas', employeesEstado === 'baja')}
                </>
              )}

              {groupLink('/assets', '💻', 'Activos', onAssetsGroup, () => setAssetsHidden((v) => !v))}
              {!collapsed && onAssetsGroup && !assetsHidden && (
                <>
                  {subLink('/assets', 'Equipos', location.pathname === '/assets')}
                  {subLink('/accessories', 'Accesorios', location.pathname === '/accessories')}
                </>
              )}
              {navLink('/assignments', '🔗', 'Asignaciones')}
              {(user.role === 'admin' || user.canManageGmailAccounts || user.canManagePlatformAccounts || user.canManagePlatformAccountsErp) && (
                <span className={styles.navSection}>Administración</span>
              )}
              {user.role === 'admin' && (
                <>
                  {navLink('/users',  '⚙️', 'Usuarios')}
                  {navLink('/audit',  '📋', 'Auditoría')}
                </>
              )}
              {(user.role === 'admin' || user.canManageGmailAccounts || user.canManagePlatformAccounts || user.canManagePlatformAccountsErp) &&
                navLink('/responsivas', '📄', 'Responsivas')}
              {accountsMenu.length > 0 && (
                <>
                  {groupButton('🔑', 'Cuentas', onAccountsGroup, accountsMenu[0].to, () => setAccountsHidden((v) => !v))}
                  {!collapsed && onAccountsGroup && !accountsHidden && accountsMenu.map((l) =>
                    subLink(l.to, l.label, location.pathname === l.to)
                  )}
                </>
              )}
            </>
          )}
        </nav>

        <button className={styles.collapseBtn} onClick={toggleCollapse} title={collapsed ? 'Expandir menú' : 'Colapsar menú'}>
          <span className={styles.collapseIcon}>{collapsed ? '→' : '←'}</span>
          <span className={styles.linkLabel}>Ocultar menú</span>
        </button>

        <div className={styles.userSection}>
          <div className={styles.userAvatar} title={user.name}>{initials}</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{user.name}</span>
            <span className={styles.userRole}>{user.role}</span>
          </div>
          <button className={styles.logoutBtn} onClick={handleLogout} title="Cerrar sesión">⏻</button>
        </div>
      </aside>

      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
