import { useEffect, useRef, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import EmployeeLoginWidget from '../components/EmployeeLoginWidget';
// Reutiliza el lenguaje visual de las páginas públicas (Solicitar
// Cuenta/Ingreso/Recurso, Reportar Ticket) — mismo .page/.card/.header.
import shared from './SolicitarCuenta.module.css';
import styles from './MesaDeAyuda.module.css';

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
// persona llega a llenar el mismo formulario de siempre, ya adelantado.
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
  // A diferencia de access/resource, esta rama requiere sesión — ver
  // handleLeafPick.
  ticket: {
    question: '¿De qué tipo es el problema?',
    needsAuth: true,
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

// Punto de entrada único para cualquier empleado — y ahora también su
// pantalla principal: el login del portal vive aquí mismo (sin navegar a
// /empleado/login), y en cuanto hay sesión se ve de un vistazo todo lo que
// ofrece la plataforma — las solicitudes de siempre más una vista previa de
// sus propios tickets. En vez de mostrar botones con nombres de módulo, hace
// 1-2 preguntas en lenguaje simple y navega sola al formulario correcto.
export default function MesaDeAyuda() {
  const navigate = useNavigate();
  const [step, setStep] = useState('root');
  const [employeeUser, setEmployeeUser] = useState(readEmployeeUser);
  const [myTickets, setMyTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  // A dónde ir en cuanto termine de iniciar sesión — se llena cuando la
  // persona ya eligió algo de tickets (el wizard o el acceso directo) sin
  // tener sesión todavía, para no perder esa elección.
  const [pendingPath, setPendingPath] = useState(null);
  const ticketBoxRef = useRef(null);

  useEffect(() => {
    if (!employeeUser) { setMyTickets([]); return; }
    setLoadingTickets(true);
    employeeApi.get('/tickets/mine')
      .then(({ data }) => setMyTickets(data.slice(0, 3)))
      .catch(() => setMyTickets([]))
      .finally(() => setLoadingTickets(false));
  }, [employeeUser]);

  const handleRootPick = (id) => {
    if (id === 'onboarding') {
      navigate('/solicitar-ingreso');
      return;
    }
    setStep(id);
  };

  const handleLeafPick = (opt) => {
    if (step === 'ticket' && !employeeUser) {
      setPendingPath(opt.to);
      ticketBoxRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      return;
    }
    navigate(opt.to);
  };

  const handleLoginSuccess = (user) => {
    setEmployeeUser(user);
    if (pendingPath) {
      const dest = pendingPath;
      setPendingPath(null);
      navigate(dest);
    }
  };

  const handleLogout = () => {
    localStorage.removeItem('employeeToken');
    localStorage.removeItem('employeeUser');
    setEmployeeUser(null);
    setPendingPath(null);
  };

  const stepMeta = step !== 'root' ? STEPS[step] : null;

  return (
    <div className={shared.page}>
      <div className={shared.card}>
        <div className={shared.header}>
          <span className={shared.icon}>🛎️</span>
          <h1 className={shared.title}>Mesa de Ayuda</h1>
          <p className={shared.subtitle}>Select Shop MB — ¿qué necesitas hoy?</p>
        </div>

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
                <button key={opt.title} type="button" className={styles.optionCard} onClick={() => handleLeafPick(opt)}>
                  <span className={styles.optionIcon}>{opt.icon}</span>
                  <span className={styles.optionTitle}>{opt.title}</span>
                  <span className={styles.optionDesc}>{opt.desc}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>{employeeUser ? 'Sistema de Tickets' : '¿Ya sabes que es un ticket?'}</span>
          <span className={styles.dividerLine} />
        </div>

        <div className={styles.ticketBox} ref={ticketBoxRef}>
          {employeeUser ? (
            <>
              <div className={styles.ticketGreetingRow}>
                <p className={styles.ticketGreeting}>Hola, {employeeUser.name} 👋</p>
                <button type="button" className={styles.logoutLink} onClick={handleLogout}>Cerrar sesión</button>
              </div>

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
            </>
          ) : (
            <>
              <span className={styles.ticketIcon}>🎫</span>
              <p className={styles.ticketTitle}>Sistema de Tickets</p>
              <p className={styles.ticketDesc}>
                {pendingPath
                  ? 'Inicia sesión para continuar con tu reporte.'
                  : 'Repórtalo directo aquí o revisa tu historial — inicia sesión con tu correo o no. de empleado.'}
              </p>
              <EmployeeLoginWidget onSuccess={handleLoginSuccess} />
            </>
          )}
        </div>
      </div>
    </div>
  );
}
