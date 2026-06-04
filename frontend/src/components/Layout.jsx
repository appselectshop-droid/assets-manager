import { useState, useEffect } from 'react';
import { Outlet, NavLink, useNavigate, useLocation } from 'react-router-dom';
import styles from './Layout.module.css';

export default function Layout() {
  const navigate = useNavigate();
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const user = JSON.parse(localStorage.getItem('user') || '{}');
  const initials = user.name ? user.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase() : 'U';

  // Cierra el drawer al cambiar de ruta
  useEffect(() => { setOpen(false); }, [location.pathname]);

  const handleLogout = () => {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    navigate('/login');
  };

  const navLink = (to, icon, label, end = false) => (
    <NavLink
      to={to}
      end={end}
      className={({ isActive }) => isActive ? `${styles.link} ${styles.active}` : styles.link}
    >
      <span className={styles.linkIcon}>{icon}</span>
      <span className={styles.linkLabel}>{label}</span>
    </NavLink>
  );

  return (
    <div className={styles.wrapper}>
      {/* Header móvil */}
      <header className={styles.mobileHeader}>
        <button className={styles.hamburger} onClick={() => setOpen(true)} aria-label="Menú">
          <span /><span /><span />
        </button>
        <div className={styles.mobileLogo}>
          <div className={styles.logoIcon}>📦</div>
          <span className={styles.logoText}>Assets Manager</span>
        </div>
        <div className={styles.mobileAvatar}>{initials}</div>
      </header>

      {/* Overlay */}
      {open && <div className={styles.overlay} onClick={() => setOpen(false)} />}

      {/* Sidebar */}
      <aside className={`${styles.sidebar} ${open ? styles.sidebarOpen : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoIcon}>📦</div>
          <div>
            <span className={styles.logoText}>Assets</span>
            <span className={styles.logoSub}>Manager</span>
          </div>
        </div>

        <nav className={styles.nav}>
          <span className={styles.navSection}>General</span>
          {navLink('/', '📊', 'Dashboard', true)}
          {navLink('/employees', '👥', 'Empleados')}
          {navLink('/assets', '💻', 'Activos')}
          {navLink('/assignments', '🔗', 'Asignaciones')}
          {user.role === 'admin' && (
            <>
              <span className={styles.navSection}>Administración</span>
              {navLink('/users', '⚙️', 'Usuarios')}
            </>
          )}
        </nav>

        <div className={styles.userSection}>
          <div className={styles.userAvatar}>{initials}</div>
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
