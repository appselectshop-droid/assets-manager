import { NavLink } from 'react-router-dom';
import Icon from './Icon';
import styles from './SettingsTabs.module.css';

// Pestañas de ⚙️ Configuración (2026-11-23): antes el engrane llevaba directo
// a Usuarios; ahora también tiene "Conexión con Claude" (llaves del conector MCP).
const TABS = [
  { to: '/users', icon: '👥', label: 'Usuarios' },
  { to: '/configuracion/claude', icon: '🔌', label: 'Conexión con Claude' },
];

export default function SettingsTabs() {
  return (
    <nav className={styles.tabs} aria-label="Configuración">
      {TABS.map((t) => (
        <NavLink key={t.to} to={t.to} className={({ isActive }) => `${styles.tab} ${isActive ? styles.active : ''}`}>
          <Icon e={t.icon} /> {t.label}
        </NavLink>
      ))}
    </nav>
  );
}
