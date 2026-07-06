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
  const [empExpanded, setEmpExpanded] = useState(onEmployees);
  useEffect(() => { if (onEmployees) setEmpExpanded(true); }, [onEmployees]);
  const employeesEstado = new URLSearchParams(location.search).get('estado');
  const user = JSON.parse(localStorage.getItem('user') || '{}');
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

  const subLink = (to, label, isActive) => (
    <button
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

              <div className={styles.linkGroup}>
                <NavLink
                  to="/employees"
                  title={collapsed ? 'Empleados' : undefined}
                  className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
                >
                  <span className={styles.linkIcon}>👥</span>
                  <span className={styles.linkLabel} style={{ flex: 1 }}>Empleados</span>
                </NavLink>
                {!collapsed && (
                  <button
                    className={styles.expandBtn}
                    onClick={() => setEmpExpanded((v) => !v)}
                    title={empExpanded ? 'Ocultar' : 'Mostrar sucursales'}
                  >
                    {empExpanded ? '▾' : '▸'}
                  </button>
                )}
              </div>
              {!collapsed && empExpanded && (
                <>
                  {subLink('/employees', 'Activos', onEmployees && employeesEstado !== 'baja')}
                  {subLink('/employees?estado=baja', 'Bajas', onEmployees && employeesEstado === 'baja')}
                </>
              )}

              {navLink('/assets', '💻', 'Activos')}
              {navLink('/assignments', '🔗', 'Asignaciones')}
              <span className={styles.navSection}>Accesorios TI</span>
              {navLink('/accessories', '📦', 'Accesorios')}
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
              {user.canManageGmailAccounts && navLink('/gmail-accounts', '🔐', 'Cuentas Gmail')}
              {user.canManagePlatformAccounts && navLink('/platform-accounts', '🌐', 'Cuentas de Plataformas')}
              {user.canManagePlatformAccountsErp && navLink('/platform-accounts-erp', '🏭', 'Cuentas Plataformas ERP')}
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
