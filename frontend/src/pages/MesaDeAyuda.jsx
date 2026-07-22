import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import EmployeeLoginWidget from '../components/EmployeeLoginWidget';
import PortalLayout from '../components/PortalLayout';
import { searchTopics } from '../utils/helpSearch';
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
  manuales: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M2 4h6a4 4 0 014 4v13a3 3 0 00-3-3H2V4z" /><path d="M22 4h-6a4 4 0 00-4 4v13a3 3 0 013-3h7V4z" /></svg>
  ),
  offboarding: (
    <svg viewBox="0 0 24 24" fill="none" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="8" r="3.2" /><path d="M2 20c0-3.5 3.1-6 7-6s7 2.5 7 6" /><path d="M15 8h7M19 4l3 4-3 4" /></svg>
  ),
};

// Única pregunta: en lenguaje cotidiano, no en nombres de módulo — la
// persona no tiene que saber que "eso" se llama "Solicitud de Cuentas". Cada
// tarjeta navega DIRECTO al formulario real (un solo clic, no dos) — antes
// había una pantalla intermedia que volvía a preguntar "¿de qué tipo es?"
// con básicamente la misma lista que el formulario de destino ya pregunta
// (ej. Hardware/Software/Red/Cuenta/Otro se repetía en /reportar-ticket como
// "Tipo de soporte"), puro trabajo duplicado y confuso. El formulario de
// destino sigue siendo la única fuente real de esa clasificación.
const ROOT_OPTIONS = [
  {
    id: 'access',
    title: 'Acceso a un sistema o correo',
    desc: 'Gmail, una plataforma de venta o el ERP.',
    to: '/solicitar-cuenta',
  },
  {
    id: 'resource',
    title: 'Equipo, accesorio o servicio',
    desc: 'Monitor, mouse, línea telefónica, software o licencia...',
    to: '/solicitar-recurso',
  },
  {
    id: 'onboarding',
    title: 'Alta de un nuevo ingreso',
    desc: 'Alguien se integra al equipo (RH).',
    to: '/solicitar-ingreso',
  },
  {
    id: 'offboarding',
    title: 'Baja de personal',
    desc: 'Un jefe reporta una baja; RH la revisa y avisa a Sistemas.',
    to: '/baja-personal',
  },
  {
    id: 'ticket',
    title: 'Tengo un problema o algo no funciona',
    desc: 'Hardware, software, aplicaciones, red, cuenta/acceso, ERP...',
    to: '/reportar-ticket',
  },
  {
    id: 'manuales',
    title: 'Manuales y Políticas',
    desc: 'Cómo usar la Mesa de Ayuda y documentos de referencia.',
    to: '/manuales',
  },
];

// Un color por tarjeta (mismos 5 tonos ya definidos en portal-theme.css,
// reusados en ReportarTicket.jsx para las secciones de categoría) — pedido
// explícito del usuario: aplicar el mismo tratamiento de color+animación de
// Reportar Ticket a toda la Mesa de Ayuda, "de lo general a lo particular".
const ROOT_ACCENTS = {
  access: 'amber',
  resource: 'blue',
  onboarding: 'green',
  offboarding: 'gray',
  ticket: 'orange',
  manuales: 'gray',
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

// Fondo animado — íconos del propio tema de la Mesa de Ayuda (ticket,
// llave de acceso, laptop, celular, impresora, correo, herramienta...)
// cayendo despacio de arriba a abajo sin parar, en vez de manchas de color
// abstractas (primer intento, el usuario pidió algo "referente a la
// página" en vez de eso). Config fija (no aleatoria en cada render, para
// que no "salte" el layout entre renders) — cada ítem tiene su propia
// posición horizontal, tamaño, duración y delay de arranque para que no
// caigan todos a la vez ni en fila. Puro CSS `@keyframes infinite`, sin
// JS: igual que el fondo anterior, nunca se detiene ni necesita refrescar
// la pestaña.
// Mezcla pensada para que no se vea "gris" — varios de estos íconos
// (laptop, impresora, teléfono, mouse) son de por sí grises/oscuros en la
// mayoría de las fuentes de emoji, así que se balancean con más íconos de
// color de pleno tema de soporte/mesa de ayuda (llave, campana, foco,
// diadema, check, ticket).
const FALLING_ICONS = [
  { icon: '🎫', left: 4,  size: 1.5, duration: 19, delay: -3  },
  { icon: '🔑', left: 12, size: 1.2, duration: 23, delay: -14 },
  { icon: '🎧', left: 20, size: 1.6, duration: 27, delay: -8  },
  { icon: '💡', left: 29, size: 1.3, duration: 17, delay: -1  },
  { icon: '🔔', left: 37, size: 1.4, duration: 24, delay: -19 },
  { icon: '📧', left: 46, size: 1.2, duration: 20, delay: -11 },
  { icon: '💻', left: 54, size: 1.4, duration: 22, delay: -5  },
  { icon: '✅', left: 62, size: 1.2, duration: 18, delay: -16 },
  { icon: '🔑', left: 70, size: 1.3, duration: 25, delay: -9  },
  { icon: '🎫', left: 78, size: 1.4, duration: 21, delay: -2  },
  { icon: '💡', left: 86, size: 1.2, duration: 19, delay: -13 },
  { icon: '🔧', left: 93, size: 1.3, duration: 26, delay: -6  },
  { icon: '🔔', left: 17, size: 1.1, duration: 23, delay: -20 },
  { icon: '🖨️', left: 60, size: 1.1, duration: 20, delay: -17 },
  { icon: '🎧', left: 82, size: 1.5, duration: 18, delay: -10 },
  { icon: '✅', left: 41, size: 1.1, duration: 25, delay: -4  },
];

function AmbientBackground() {
  return (
    <div className={styles.ambientBg} aria-hidden="true">
      {FALLING_ICONS.map((it, i) => (
        <span
          key={i}
          className={styles.fallingIcon}
          style={{
            left: `${it.left}%`,
            fontSize: `${it.size}rem`,
            animationDuration: `${it.duration}s`,
            animationDelay: `${it.delay}s`,
          }}
        >
          {it.icon}
        </span>
      ))}
    </div>
  );
}

// Pantalla de bienvenida/login — es lo único que ve cualquiera sin sesión.
// No hay wizard ni opciones detrás a medias: hasta no iniciar sesión, no
// hay nada más que ver, a propósito (pedido explícito del usuario).
function WelcomeScreen({ onSuccess }) {
  return (
    <div className={`portalDark ${shared.page}`}>
      <AmbientBackground />
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
  const [employeeUser, setEmployeeUser] = useState(readEmployeeUser);
  const [myTickets, setMyTickets] = useState([]);
  const [loadingTickets, setLoadingTickets] = useState(false);
  const [query, setQuery] = useState('');
  const ticketsRef = useRef(null);

  useEffect(() => {
    if (!employeeUser) { setMyTickets([]); return; }
    setLoadingTickets(true);
    employeeApi.get('/tickets/mine')
      .then(({ data }) => setMyTickets(data.slice(0, 5)))
      .catch(() => setMyTickets([]))
      .finally(() => setLoadingTickets(false));
  }, [employeeUser]);

  // Catálogo de Aplicaciones Internas — el buscador lo necesita para poder
  // resolver una búsqueda hasta una app específica (ej. "no funciona
  // Cuentas por Pagar"), no solo hasta la categoría "Aplicaciones" en
  // general. Mismo endpoint que ya usa ReportarTicket.jsx.
  const [apps, setApps] = useState([]);
  useEffect(() => {
    employeeApi.get('/internal-apps/public').then(({ data }) => setApps(data)).catch(() => setApps([]));
  }, []);

  const searchMatches = useMemo(
    () => searchTopics(query, apps, employeeUser),
    [query, apps, employeeUser],
  );
  const showSearchResults = query.trim().length >= 3;

  if (!employeeUser) {
    return <WelcomeScreen onSuccess={setEmployeeUser} />;
  }

  // "Alta de un nuevo ingreso" solo la ve quien tiene el permiso de RH, y
  // "Baja de personal" solo quien es jefe o RH de bajas — el resto de
  // empleados ni se entera de que existen (ver Employees.jsx para activar
  // los permisos).
  const visibleRootOptions = ROOT_OPTIONS.filter((opt) => {
    if (opt.id === 'onboarding') return !!employeeUser.canManageOnboarding;
    if (opt.id === 'offboarding') return !!employeeUser.canRequestOffboarding || !!employeeUser.canManageOffboarding;
    return true;
  });

  return (
    <PortalLayout activeNav="solicitudes">
      <AmbientBackground />
      <div className={styles.mainHead}>
        <h1>¿Qué necesitas?</h1>
        <p>Hola, <b>{employeeUser.name}</b> 👋 busca tu problema o elige una opción abajo.</p>
      </div>

      <div className={styles.searchWrap}>
        <span className={styles.searchIcon}>🔎</span>
        <input
          type="search"
          className={styles.searchInput}
          placeholder="Ej. no me funciona la impresora, necesito un mouse, olvidé mi contraseña..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        {showSearchResults && (
          <div className={styles.searchResults}>
            {searchMatches.length > 0 ? (
              searchMatches.map((m) => (
                <button key={m.label} type="button" className={styles.searchResultItem} onClick={() => navigate(m.to)}>
                  <span className={styles.searchResultIcon}>{m.icon}</span>
                  <span>
                    <strong>{m.label}</strong>
                    <p>{m.hint}</p>
                  </span>
                </button>
              ))
            ) : (
              <p className={styles.searchEmpty}>No encontramos algo exacto para "{query}" — elige una opción abajo.</p>
            )}
          </div>
        )}
      </div>

      <div className={styles.needGrid}>
        {visibleRootOptions.map((opt) => {
          const accent = ROOT_ACCENTS[opt.id] || 'orange';
          return (
            <button
              key={opt.id}
              type="button"
              className={styles.needCard}
              style={{ '--accent': `var(--p-${accent})`, '--accent-soft': `var(--p-${accent}-soft)` }}
              onClick={() => navigate(opt.to)}
            >
              <div className={styles.iconBadge}>{ICONS[opt.id]}</div>
              <h3>{opt.title}</h3>
              <p>{opt.desc}</p>
            </button>
          );
        })}
      </div>

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
