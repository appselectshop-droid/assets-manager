import { useState } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import usePushSubscription from '../hooks/usePushSubscription';
import PushNotificationBanner from './PushNotificationBanner';
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

// Se guarda en localStorage (no en el state de cada página) porque
// PortalLayout se vuelve a montar en cada navegación (cada página envuelve
// la suya) — sin esto, el sidebar se abriría de nuevo solo con cambiar de
// pestaña, pedido explícito del usuario: que se pueda ocultar y mostrar.
const COLLAPSE_KEY = 'mesaDeAyudaSidebarCollapsed';

export default function PortalLayout({ activeNav, children }) {
  const navigate = useNavigate();
  const employeeUser = readEmployeeUser();
  const [collapsed, setCollapsed] = useState(() => localStorage.getItem(COLLAPSE_KEY) === 'true');
  const { status: pushStatus, unsubscribe: unsubscribePush } = usePushSubscription();
  const toggleCollapsed = () => {
    setCollapsed((prev) => {
      const next = !prev;
      localStorage.setItem(COLLAPSE_KEY, String(next));
      return next;
    });
  };
  const initials = employeeUser?.name
    ? employeeUser.name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase()
    : '?';
  const handleLogout = () => {
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeUser');
    navigate('/mesa-de-ayuda/empleado/login');
  };

  return (
    <div className={`portalDark ${styles.wrapper}`}>
      <button
        type="button"
        className={`${styles.toggleBtn} ${collapsed ? styles.toggleBtnCollapsed : ''}`}
        onClick={toggleCollapsed}
        aria-label={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
        title={collapsed ? 'Mostrar menú' : 'Ocultar menú'}
      >
        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <path d={collapsed ? 'M9 6l6 6-6 6' : 'M15 6l-6 6 6 6'} />
        </svg>
      </button>

      <aside className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ''}`}>
        <div className={styles.logo}>
          <div className={styles.logoMark}>
            <img src="/icons/mesa-ayuda-logo.png" alt="" />
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
            to="/mesa-de-ayuda/mis-tickets"
            className={({ isActive }) => `${styles.navItem} ${isActive || activeNav === 'tickets' ? styles.navItemActive : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 4h16v13H7l-3 3V4z" /></svg>
            Mis tickets
          </NavLink>
          <NavLink
            to="/mesa-de-ayuda/mis-solicitudes"
            className={({ isActive }) => `${styles.navItem} ${isActive || activeNav === 'solicitudes-mias' ? styles.navItemActive : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3h6l3 3v15H6V3z" /><path d="M9 9h6M9 13h6M9 17h3" /></svg>
            Mis solicitudes
          </NavLink>
          <NavLink
            to="/mesa-de-ayuda/manuales"
            className={({ isActive }) => `${styles.navItem} ${isActive || activeNav === 'manuales' ? styles.navItemActive : ''}`}
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M2 4h6a4 4 0 014 4v13a3 3 0 00-3-3H2V4z" /><path d="M22 4h-6a4 4 0 00-4 4v13a3 3 0 013-3h7V4z" /></svg>
            Manuales
          </NavLink>
        </nav>

        <div className={styles.userBlock}>
          <div className={styles.userAvatar}>{initials}</div>
          <div className={styles.userInfo}>
            <span className={styles.userName}>{employeeUser?.name || 'Invitado'}</span>
            <div className={styles.userLinks}>
              {pushStatus === 'subscribed' && (
                <button type="button" className={styles.userSignout} onClick={unsubscribePush}>🔔 Desactivar notificaciones</button>
              )}
              <button type="button" className={styles.userSignout} onClick={handleLogout}>Cerrar sesión</button>
            </div>
          </div>
        </div>
      </aside>

      <main className={`${styles.main} ${collapsed ? styles.mainExpanded : ''}`}>
        <PushNotificationBanner />
        {children}
      </main>
    </div>
  );
}
