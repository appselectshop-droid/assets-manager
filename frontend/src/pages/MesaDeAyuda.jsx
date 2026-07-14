import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import EmployeeLoginWidget from '../components/EmployeeLoginWidget';
// Reutiliza el lenguaje visual de las páginas públicas (Solicitar
// Cuenta/Ingreso/Recurso, Reportar Ticket) — mismo .page/.card/.header.
import shared from './SolicitarCuenta.module.css';
import styles from './MesaDeAyuda.module.css';

// Lo que ve alguien sin sesión, a modo de vitrina — para que sepa qué hay
// aquí dentro antes de decidir iniciar sesión.
const TEASER_ITEMS = [
  { icon: '🔑', label: 'Cuentas y accesos' },
  { icon: '📦', label: 'Equipo y recursos' },
  { icon: '🎫', label: 'Reportar y seguir tus tickets' },
];

// Primera pregunta: en lenguaje cotidiano, no en nombres de módulo — la
// persona no tiene que saber que "eso" se llama "Solicitud de Cuentas".
const ROOT_OPTIONS = [
  {
    id: 'access',
    icon: '🔑',
    title: 'Acceso a un sistema o correo',
    desc: 'Gmail, una plataforma de venta o el ERP.',
  },
  {
    id: 'resource',
    icon: '📦',
    title: 'Equipo, accesorio o servicio',
    desc: 'Algo que Sistemas te puede entregar de su stock.',
  },
  {
    id: 'onboarding',
    icon: '🧑‍💼',
    title: 'Alta de un nuevo ingreso',
    desc: 'Alguien se integra al equipo (RH).',
  },
  {
    id: 'ticket',
    icon: '⚠️',
    title: 'Tengo un problema o algo no funciona',
    desc: 'Una falla, algo lento o que dejó de servir.',
  },
];

// Segundas preguntas: cada rama termina navegando al formulario real que ya
// existe, con el tipo correspondiente preseleccionado vía query param — la
// persona llega a llenar el mismo formulario de siempre, ya adelantado. Ya
// no hace falta marcar la rama de tickets como "necesita sesión": toda la
// pantalla la exige desde la entrada (ver export default de abajo).
const STEPS = {
  access: {
    question: '¿A qué necesitas acceso?',
    options: [
      { icon: '🔐', title: 'Correo Gmail', desc: 'Cuenta de Gmail para trabajo.', to: '/solicitar-cuenta?tipo=gmail' },
      { icon: '🌐', title: 'Plataforma de venta', desc: 'Amazon, Mercado Libre, Walmart...', to: '/solicitar-cuenta?tipo=platforms' },
      { icon: '🏭', title: 'Sistema ERP', desc: 'Acceso al sistema administrativo.', to: '/solicitar-cuenta?tipo=erp' },
    ],
  },
  resource: {
    question: '¿Qué necesitas exactamente?',
    options: [
      { icon: '🖱️', title: 'Equipo o accesorio', desc: 'Monitor, mouse, teclado, cable...', to: '/solicitar-recurso' },
      { icon: '📞', title: 'Línea telefónica', desc: 'Plan o número asignado por la empresa.', to: '/solicitar-recurso?tipo=telefono' },
      { icon: '💻', title: 'Software o licencia', desc: 'Un programa que necesitas instalado.', to: '/solicitar-recurso?tipo=software' },
    ],
  },
  // Mismos 5 tipos y mismo orden que TICKET_TYPES en ReportarTicket.jsx —
  // si esa lista cambia, actualizar también aquí para que sigan alineadas.
  ticket: {
    question: '¿De qué tipo es el problema?',
    options: [
      { icon: '🖥️', title: 'Hardware', desc: 'No enciende, pantalla, batería, teclado...', to: '/reportar-ticket?tipo=hardware' },
      { icon: '💾', title: 'Software', desc: 'Sistema operativo, un programa, lentitud...', to: '/reportar-ticket?tipo=software' },
      { icon: '📶', title: 'Red / Conectividad', desc: 'WiFi, impresora, VPN...', to: '/reportar-ticket?tipo=red' },
      { icon: '🔐', title: 'Cuenta / Acceso', desc: 'Contraseña, permisos...', to: '/reportar-ticket?tipo=cuenta_acceso' },
      { icon: '❓', title: 'Otro', desc: 'No encaja en las anteriores.', to: '/reportar-ticket?tipo=otro' },
    ],
  },
};

const TICKET_STATUS_CONFIG = {
  abierto:    { label: 'Abierto',    color: '#d97706', bg: '#fffbeb' },
  en_proceso: { label: 'En proceso', color: '#2563eb', bg: '#eff6ff' },
  resuelto:   { label: 'Resuelto',   color: '#16a34a', bg: '#f0fdf4' },
  cerrado:    { label: 'Cerrado',    color: '#6b7280', bg: '#f5f5f5' },
};

function readEmployeeUser() {
  try { return JSON.parse(localStorage.getItem('employeeUser') || 'null'); } catch { return null; }
}

// Pantalla de bienvenida/login — es lo único que ve cualquiera sin sesión.
// No hay wizard ni opciones detrás a medias: hasta no iniciar sesión, no
// hay nada más que ver, a propósito (pedido explícito del usuario).
function WelcomeScreen({ onSuccess }) {
  return (
    <div className={shared.page}>
      <div className={styles.loginCard}>
        <div className={shared.header}>
          <span className={shared.icon}>🛎️</span>
          <h1 className={shared.title}>Mesa de Ayuda</h1>
          <p className={shared.subtitle}>Select Shop MB</p>
        </div>

        <div className={styles.teaserGrid}>
          {TEASER_ITEMS.map((item) => (
            <div key={item.label} className={styles.teaserItem}>
              <span className={styles.teaserIcon}>{item.icon}</span>
              <span>{item.label}</span>
            </div>
          ))}
        </div>

        <p className={styles.loginIntro}>Inicia sesión con tu correo corporativo o no. de empleado para continuar.</p>
        <EmployeeLoginWidget onSuccess={onSuccess} />
      </div>
    </div>
  );
}

// Punto de entrada único para cualquier empleado, y su pantalla principal:
// requiere sesión desde la entrada (no solo para tickets) — quien no ha
// iniciado sesión solo ve WelcomeScreen, nada de opciones a medias. Ya
// dentro, ve de un vistazo todo lo que ofrece la plataforma: el wizard de
// solicitudes de siempre y una vista previa de sus propios tickets.
export default function MesaDeAyuda() {
  const navigate = useNavigate();
  const [step, setStep] = useState('root');
  const [employeeUser, setEmployeeUser] = useState(readEmployeeUser);
  const [myTickets, setMyTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const wizardRef = useRef(null);
  const ticketsRef = useRef(null);

  useEffect(() => {
    if (!employeeUser) { setMyTickets([]); return; }
    setLoadingTickets(true);
    employeeApi.get('/tickets/mine')
      .then(({ data }) => setMyTickets(data.slice(0, 3)))
      .catch(() => setMyTickets([]))
      .finally(() => setLoadingTickets(false));
  }, [employeeUser]);

  if (!employeeUser) {
    return <WelcomeScreen onSuccess={setEmployeeUser} />;
  }

  const handleRootPick = (id) => {
    if (id === 'onboarding') {
      navigate('/solicitar-ingreso');
      return;
    }
    setStep(id);
  };

  const handleLogout = () => {
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeUser');
    setEmployeeUser(null);
    setStep('root');
  };

  const scrollTo = (ref) => ref.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

  const stepMeta = step !== 'root' ? STEPS[step] : null;

  return (
    <div className={shared.page}>
      <div className={shared.card}>
        <div className={styles.homeHeader}>
          <div className={styles.homeHeaderLeft}>
            <span className={styles.homeIcon}>🛎️</span>
            <div>
              <h1 className={styles.homeTitle}>Mesa de Ayuda</h1>
              <p className={styles.homeGreeting}>Hola, {employeeUser.name} 👋</p>
            </div>
          </div>
          <button type="button" className={styles.logoutLink} onClick={handleLogout}>Cerrar sesión</button>
        </div>

        <div className={styles.navPills}>
          <button type="button" className={styles.navPill} onClick={() => scrollTo(wizardRef)}>🧭 Solicitudes</button>
          <button type="button" className={styles.navPill} onClick={() => scrollTo(ticketsRef)}>🎫 Mis tickets</button>
        </div>

        <div ref={wizardRef}>
          {step === 'root' ? (
            <>
              <p className={shared.sectionTitle}>¿Qué necesitas?</p>
              <div className={styles.grid}>
                {ROOT_OPTIONS.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    className={styles.optionCard}
                    onClick={() => handleRootPick(opt.id)}
                  >
                    <span className={styles.optionIcon}>{opt.icon}</span>
                    <span className={styles.optionTitle}>{opt.title}</span>
                    <span className={styles.optionDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </>
          ) : (
            <>
              <button type="button" className={styles.backLink} onClick={() => setStep('root')}>
                ← Volver
              </button>
              <p className={shared.sectionTitle}>{stepMeta.question}</p>
              <div className={styles.grid}>
                {stepMeta.options.map((opt) => (
                  <button key={opt.title} type="button" className={styles.optionCard} onClick={() => navigate(opt.to)}>
                    <span className={styles.optionIcon}>{opt.icon}</span>
                    <span className={styles.optionTitle}>{opt.title}</span>
                    <span className={styles.optionDesc}>{opt.desc}</span>
                  </button>
                ))}
              </div>
            </>
          )}
        </div>

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>Sistema de Tickets</span>
          <span className={styles.dividerLine} />
        </div>

        <div className={styles.ticketBox} ref={ticketsRef}>
          {loadingTickets ? (
            <p className={styles.ticketDesc}>Cargando tus tickets...</p>
          ) : myTickets.length === 0 ? (
            <p className={styles.ticketDesc}>Todavía no has reportado ningún ticket.</p>
          ) : (
            <div className={styles.previewList}>
              {myTickets.map((t) => {
                const sc = TICKET_STATUS_CONFIG[t.status] || TICKET_STATUS_CONFIG.abierto;
                return (
                  <Link key={t._id} to="/mis-tickets" className={styles.previewItem}>
                    <span className={styles.previewSubject}>{t.subject}</span>
                    <span className={styles.previewBadge} style={{ color: sc.color, background: sc.bg }}>{sc.label}</span>
                  </Link>
                );
              })}
            </div>
          )}

          <button type="button" className={styles.ticketBtn} onClick={() => navigate('/reportar-ticket')}>
            + Reportar un problema nuevo
          </button>
          <Link to="/mis-tickets" className={styles.viewAllLink}>Ver todos mis tickets →</Link>
        </div>
      </div>
    </div>
  );
}
