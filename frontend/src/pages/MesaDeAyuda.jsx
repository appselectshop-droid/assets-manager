import { Link } from 'react-router-dom';
// Reutiliza el lenguaje visual de las páginas públicas (Solicitar
// Cuenta/Ingreso/Recurso, Reportar Ticket) — mismo .page/.card/.header.
import shared from './SolicitarCuenta.module.css';
import styles from './MesaDeAyuda.module.css';

const REQUEST_OPTIONS = [
  {
    to: '/solicitar-cuenta',
    icon: '🔑',
    title: 'Cuenta o acceso',
    desc: 'Gmail, plataformas de venta o ERP.',
  },
  {
    to: '/solicitar-ingreso',
    icon: '🧑‍💼',
    title: 'Ingreso de personal',
    desc: 'Alta de un nuevo colaborador (RH).',
  },
  {
    to: '/solicitar-recurso',
    icon: '📦',
    title: 'Recurso o servicio',
    desc: 'Equipo, accesorio o línea telefónica.',
  },
];

// Punto de entrada único para cualquier empleado: desde aquí se elige qué
// necesita (una solicitud, o reportar una falla) sin tener que saber que
// por debajo son formularios/módulos distintos. El sistema de Tickets se
// deja en un bloque aparte, a propósito — no es una "solicitud" más, es
// soporte por un problema.
export default function MesaDeAyuda() {
  return (
    <div className={shared.page}>
      <div className={shared.card}>
        <div className={shared.header}>
          <span className={shared.icon}>🛎️</span>
          <h1 className={shared.title}>Mesa de Ayuda</h1>
          <p className={shared.subtitle}>Select Shop MB — ¿qué necesitas hoy?</p>
        </div>

        <p className={shared.sectionTitle}>Solicitudes</p>
        <div className={styles.grid}>
          {REQUEST_OPTIONS.map((opt) => (
            <Link key={opt.to} to={opt.to} className={styles.optionCard}>
              <span className={styles.optionIcon}>{opt.icon}</span>
              <span className={styles.optionTitle}>{opt.title}</span>
              <span className={styles.optionDesc}>{opt.desc}</span>
            </Link>
          ))}
        </div>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>¿Tienes un problema técnico?</span>
          <span className={styles.dividerLine} />
        </div>

        <div className={styles.ticketBox}>
          <span className={styles.ticketIcon}>🎫</span>
          <p className={styles.ticketTitle}>Sistema de Tickets</p>
          <p className={styles.ticketDesc}>
            Hardware, software, red o algo que no te deja trabajar — reporta
            un ticket y Sistemas lo atiende.
          </p>
          <Link to="/reportar-ticket" className={styles.ticketBtn}>
            Reportar un ticket
          </Link>
        </div>
      </div>
    </div>
  );
}
