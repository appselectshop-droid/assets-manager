import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import EmployeeLoginWidget from '../components/EmployeeLoginWidget';
import PortalLayout from '../components/PortalLayout';
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

// Íconos de línea de las 4 tarjetas principales — mismo lenguaje visual que
// el resto del portal (trazo, no relleno).
const ICONS = {
  access: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="8" cy="15" r="3.5" /><path d="M10.5 12.5L20 3M20 3h-4M20 3v4" /></svg>
  ),
  resource: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 8l-9-5-9 5 9 5 9-5z" /><path d="M3 8v8l9 5 9-5V8" /><path d="M12 13v8" /></svg>
  ),
  onboarding: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="8" r="3.2" /><path d="M5 20c0-3.5 3.1-6 7-6s7 2.5 7 6" /></svg>
  ),
  ticket: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 4L2 20h20L12 4z" /><path d="M12 10v4" /><circle cx="12" cy="17" r="0.6" fill="currentColor" /></svg>
  ),
};

// Primera pregunta: en lenguaje cotidiano, no en nombres de módulo — la
// persona no tiene que saber que "eso" se llama "Solicitud de Cuentas".
const ROOT_OPTIONS = [
  {
    id: 'access',
    title: 'Acceso a un sistema o correo',
    desc: 'Gmail, una plataforma de venta o el ERP.',
  },
  {
    id: 'resource',
    title: 'Equipo, accesorio o servicio',
    desc: 'Algo que Sistemas te puede entregar de su stock.',
  },
  {
    id: 'onboarding',
    title: 'Alta de un nuevo ingreso',
    desc: 'Alguien se integra al equipo (RH).',
  },
  {
    id: 'ticket',
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
  abierto:    { label: 'abierto',    pillClass: 'pillAmber' },
  en_proceso: { label: 'en proceso', pillClass: 'pillOrange' },
  resuelto:   { label: 'resuelto',   pillClass: 'pillGreen' },
  cerrado:    { label: 'cerrado',    pillClass: 'pillGray' },
};

function formatRelative(dateStr) {
  const diffMs = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diffMs / 60000);
  if (mins < 60) return mins <= 1 ? 'hace un momento' : `hace ${mins} min`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `hace ${hours} h`;
  const days = Math.floor(hours / 24);
  if (days < 30) return days === 1 ? 'hace 1 día' : `hace ${days} días`;
  const months = Math.floor(days / 30);
  return months === 1 ? 'hace 1 mes' : `hace ${months} meses`;
}

function readEmployeeUser() {
  try { return JSON.parse(localStorage.getItem('employeeUser') || 'null'); } catch { return null; }
}

// Pantalla de bienvenida/login — es lo único que ve cualquiera sin sesión.
// No hay wizard ni opciones detrás a medias: hasta no iniciar sesión, no
// hay nada más que ver, a propósito (pedido explícito del usuario).
function WelcomeScreen({ onSuccess }) {
  return (
    <div className={`portalDark ${shared.page}`}>
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
  const ticketsRef = useRef(null);

  useEffect(() => {
    if (!employeeUser) { setMyTickets([]); return; }
    setLoadingTickets(true);
    employeeApi.get('/tickets/mine')
      .then(({ data }) => setMyTickets(data.slice(0, 5)))
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

  const stepMeta = step !== 'root' ? STEPS[step] : null;

  return (
    <PortalLayout activeNav="solicitudes">
      <div className={styles.mainHead}>
        <h1>¿Qué necesitas?</h1>
        <p>Hola, <b>{employeeUser.name}</b> 👋 elige una opción o revisa tus tickets abajo.</p>
      </div>

      {step === 'root' ? (
        <div className={styles.needGrid}>
          {ROOT_OPTIONS.map((opt) => (
            <button key={opt.id} type="button" className={styles.needCard} onClick={() => handleRootPick(opt.id)}>
              <div className={styles.iconBadge}>{ICONS[opt.id]}</div>
              <h3>{opt.title}</h3>
              <p>{opt.desc}</p>
            </button>
          ))}
        </div>
      ) : (
        <>
          <button type="button" className={styles.backLink} onClick={() => setStep('root')}>← Volver</button>
          <p className={styles.eyebrow}>{stepMeta.question}</p>
          <div className={styles.needGrid}>
            {stepMeta.options.map((opt) => (
              <button key={opt.title} type="button" className={styles.needCard} onClick={() => navigate(opt.to)}>
                <span className={styles.emojiBadge}>{opt.icon}</span>
                <h3>{opt.title}</h3>
                <p>{opt.desc}</p>
              </button>
            ))}
          </div>
        </>
      )}

      <div className={styles.tablePanel} ref={ticketsRef}>
        <div className={styles.tableHead}>
          <h2>Sistema de tickets</h2>
        </div>

        {loadingTickets ? (
          <p className={styles.tableEmpty}>Cargando tus tickets...</p>
        ) : myTickets.length === 0 ? (
          <p className={styles.tableEmpty}>Todavía no has reportado ningún ticket.</p>
        ) : (
          <table>
            <thead>
              <tr><th>Folio</th><th>Ticket</th><th>Estatus</th><th>Fecha</th></tr>
            </thead>
            <tbody>
              {myTickets.map((t) => {
                const sc = TICKET_STATUS_CONFIG[t.status] || TICKET_STATUS_CONFIG.abierto;
                return (
                  <tr key={t._id} onClick={() => navigate('/mis-tickets')}>
                    <td><span className={styles.folioLink}>{t.folio}</span></td>
                    <td>{t.subject}</td>
                    <td><span className={`${styles.pill} ${styles[sc.pillClass]}`}><span className={styles.dot} />{sc.label}</span></td>
                    <td className={styles.date}>{formatRelative(t.createdAt)}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
        <button type="button" className={styles.seeAll} onClick={() => navigate('/mis-tickets')}>Ver todos mis tickets →</button>
      </div>
    </PortalLayout>
  );
}
