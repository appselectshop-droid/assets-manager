import { NavLink, useNavigate } from 'react-router-dom';
import styles from './PortalLayout.module.css';

// Cascarón del portal de empleado (Mesa de Ayuda / Mis Tickets) — sidebar
// fija a pantalla completa, igual de patrón que components/Layout.jsx (el
// del panel admin), pero con la identidad visual oscura del portal. Envuelve
// únicamente páginas donde ya existe sesión de empleado (MesaDeAyuda
// logueado, MisTickets, ReportarTicket) — WelcomeScreen/EmployeeLogin y los
// formularios públicos (SolicitarCuenta/Ingreso/Recurso) no la usan porque no
// siempre hay employeeUser todavía.
function readEmployeeUser() {
  try { return JSON.parse(localStorage.getItem('employeeUser') || 'null'); } catch { return null; }
}

export default function PortalLayout({ activeNav, children }) {
  const navigate = useNavigate();
  const employeeUser = readEmployeeUser();
  const initials = employeeUser?.name
    ? employeeUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const handleLogout = () => {
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeUser');
    navigate('/empleado/login');
  };

  return (
    <div className={`portalDark ${styles.wrapper}`}>
      <aside className={styles.sidebar}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>
            <svg viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M6 18L18 6M18 6H9M18 6V15" stroke="#fff" strokeWidth="2.6" strokeLinecap="round" strokeLinejoin="round" />
            </svg>
          </div>
          <div className={styles.logoText}>Mesa <span>Ayuda</span></div>
        </div>

        <nav className={styles.nav}>
          <NavLink
            to="/mesa-de-ayuda"
            className={({ isActive }) => `${styles.navItem} ${isActive || activeNav === 'solicitudes' ? styles.navItemActive : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4" /><circle cx="12" cy="12" r="9" /></svg>
            Solicitudes
          </NavLink>
          <NavLink
            to="/mis-tickets"
            className={({ isActive }) => `${styles.navItem} ${isActive || activeNav === 'tickets' ? styles.navItemActive : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v13H7l-3 3V4z" /></svg>
            Mis tickets
          </NavLink>
          <NavLink
            to="/mis-solicitudes"
            className={({ isActive }) => `${styles.navItem} ${isActive || activeNav === 'solicitudes-mias' ? styles.navItemActive : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6l3 3v15H6V3z" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>
            Mis solicitudes
          </NavLink>
        </nav>

        <div className={styles.userBlock}>
          <div className={styles.userAvatar}>{initials}</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{employeeUser?.name || 'Invitado'}</span>
            <button type="button" className={styles.userSignout} onClick={handleLogout}>Cerrar sesión</button>
          </div>
        </div>
      </aside>

      <main className={styles.main}>{children}</main>
    </div>
  );
}
