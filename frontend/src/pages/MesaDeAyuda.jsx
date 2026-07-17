import { useEffect, useMemo, useRef, useState } from 'react';
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
    id: 'ticket',
    title: 'Tengo un problema o algo no funciona',
    desc: 'Hardware, software, aplicaciones, red, cuenta/acceso, ERP...',
    to: '/reportar-ticket',
  },
];

// Buscador tipo "centro de ayuda": la persona escribe en sus propias
// palabras (ej. "no me funciona la macros") y se le sugiere a dónde ir,
// en vez de tener que adivinar en cuál de las 4 tarjetas encaja. Cada tema
// tiene frases/palabras clave curadas a mano — nada de IA ni servicio
// externo, solo coincidencia de texto, suficiente para un catálogo chico y
// controlado como este. Los temas de "reportar algo roto" (tickets) y los
// de "pedir algo nuevo" (solicitudes) se distinguen por sus propias
// palabras clave (ej. "no funciona"/"olvidé" vs "necesito"/"nuevo").
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const SEARCH_TOPICS = [
  {
    icon: '🖥️', label: 'Hardware — reportar ticket', to: '/reportar-ticket?tipo=hardware',
    hint: 'Un equipo que ya tienes falló: no enciende, pantalla, batería, teclado...',
    keywords: ['no enciende', 'no prende', 'pantalla', 'bateria', 'teclado', 'no carga', 'cargador', 'se apaga', 'esta roto', 'esta rota', 'no jala el mouse', 'hardware'],
  },
  {
    icon: '💾', label: 'Software — reportar ticket', to: '/reportar-ticket?tipo=software',
    hint: 'El sistema operativo o un programa instalado en tu equipo: lento, error, no abre...',
    keywords: ['lento', 'lenta', 'no abre', 'error', 'programa', 'windows', 'excel', 'word', 'office', 'macro', 'macros', 'se congela', 'pantalla azul', 'actualizacion', 'no responde', 'software'],
  },
  {
    // Software (arriba) NO incluye "aplicacion" a propósito — son categorías
    // distintas (pedido explícito del usuario): un programa instalado en tu
    // equipo vs. una página/sistema interno de la empresa.
    icon: '🗂️', label: 'Aplicaciones — reportar ticket', to: '/reportar-ticket?tipo=aplicacion',
    hint: 'Una página o sistema interno de la empresa que no te funciona (no un programa de tu equipo).',
    keywords: ['aplicacion', 'pagina', 'portal', 'sistema interno', 'no carga la pagina', 'error 404', 'no abre la pagina'],
  },
  {
    icon: '📶', label: 'Red / Conectividad — reportar ticket', to: '/reportar-ticket?tipo=red',
    hint: 'WiFi, internet, impresora o VPN que no funcionan.',
    keywords: ['wifi', 'internet', 'no conecta', 'no hay internet', 'impresora', 'imprimir', 'vpn', 'sin senal', 'no navega', 'red'],
  },
  {
    icon: '🔐', label: 'Cuenta / Acceso — reportar ticket', to: '/reportar-ticket?tipo=cuenta_acceso',
    hint: 'Ya tienes la cuenta pero no puedes entrar: contraseña, bloqueo, permisos.',
    keywords: ['contrasena', 'password', 'no puedo entrar', 'bloqueado', 'bloqueada', 'olvide mi contrasena', 'no me deja entrar', 'permisos', 'cuenta bloqueada'],
  },
  {
    icon: '🛡️', label: 'Seguridad — reportar ticket', to: '/reportar-ticket?tipo=seguridad',
    hint: 'Un correo sospechoso, un enlace raro o crees que alguien entró a tu cuenta.',
    keywords: ['phishing', 'correo sospechoso', 'me hackearon', 'hackearon mi cuenta', 'entraron a mi cuenta', 'virus', 'enlace sospechoso', 'correo raro', 'suplantacion'],
  },
  {
    icon: '🏭', label: 'ERP — reportar ticket', to: '/reportar-ticket?tipo=erp',
    hint: 'Algo del ERP no funciona: módulos, reportes, accesos.',
    keywords: ['erp', 'modulo', 'modulos', 'reporte del erp', 'sistema administrativo'],
  },
  {
    icon: '🔐', label: 'Correo Gmail — solicitar cuenta nueva', to: '/solicitar-cuenta?tipo=gmail',
    hint: 'Pedir una cuenta de Gmail nueva (no un problema con una que ya tienes).',
    keywords: ['nueva cuenta de correo', 'necesito gmail', 'alta de correo', 'correo nuevo', 'quiero un correo', 'dar de alta correo'],
  },
  {
    icon: '🌐', label: 'Plataforma de venta — solicitar cuenta nueva', to: '/solicitar-cuenta?tipo=platforms',
    hint: 'Pedir acceso nuevo a Mercado Libre, Amazon, Walmart, etc.',
    keywords: ['mercado libre', 'amazon', 'walmart', 'plataforma de venta', 'nueva cuenta de plataforma'],
  },
  {
    icon: '🏭', label: 'Acceso al ERP — solicitar cuenta nueva', to: '/solicitar-cuenta?tipo=erp',
    hint: 'Pedir que te den de alta como usuario nuevo del ERP.',
    keywords: ['necesito acceso al erp', 'nuevo usuario erp', 'alta usuario erp', 'quiero acceso al erp', 'dar de alta en el erp'],
  },
  {
    icon: '🖱️', label: 'Equipo o accesorio — solicitar recurso', to: '/solicitar-recurso',
    hint: 'Pedir un equipo o accesorio nuevo (no reportar uno que ya tienes y falló).',
    keywords: ['necesito un mouse', 'necesito un teclado', 'monitor nuevo', 'necesito una laptop', 'accesorio nuevo', 'necesito equipo', 'necesito una diadema', 'audifonos nuevos'],
  },
  {
    icon: '📞', label: 'Línea telefónica — solicitar recurso', to: '/solicitar-recurso?tipo=telefono',
    hint: 'Pedir una línea o plan telefónico de la empresa.',
    keywords: ['linea telefonica', 'numero de telefono', 'plan celular', 'chip nuevo'],
  },
  {
    icon: '💻', label: 'Software o licencia — solicitar recurso', to: '/solicitar-recurso?tipo=software',
    hint: 'Pedir que te instalen un programa o una licencia nueva.',
    keywords: ['necesito instalar', 'licencia de', 'quiero un programa nuevo', 'necesito una licencia', 'instalar un programa'],
  },
  {
    icon: '🧑‍💼', label: 'Alta de nuevo ingreso', to: '/solicitar-ingreso',
    hint: 'Alguien nuevo se integra al equipo (RH).',
    keywords: ['nuevo empleado', 'alta de personal', 'se integra alguien', 'ingreso nuevo', 'nuevo integrante', 'nuevo ingreso'],
  },
];

// Coincidencia simple por texto: frase completa dentro de la búsqueda pesa
// más que una palabra suelta parecida — así "no me funciona la macros"
// prioriza "Software" (por "macros") sobre coincidencias débiles de otros
// temas.
function searchTopics(rawQuery) {
  const q = normalize(rawQuery);
  if (q.length < 3) return [];
  // Umbral de 4+ letras para el matching "flojo" (por palabra suelta) —
  // con 3 letras palabras comunes como "que"/"ver" salían como substring de
  // keywords sin relación (ej. "que" dentro de "bloqueada") y disparaban
  // falsos positivos. La frase completa (arriba, score 3) no tiene este
  // límite: keywords cortas como "red" siguen encontrándose bien ahí.
  const words = q.split(/\s+/).filter((w) => w.length >= 4);
  const scored = SEARCH_TOPICS.map((topic) => {
    let score = 0;
    for (const kw of topic.keywords) {
      const nkw = normalize(kw);
      if (q.includes(nkw)) score += 3;
      else if (nkw.length >= 4 && words.some((w) => nkw.includes(w) || w.includes(nkw))) score += 1;
    }
    return { topic, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((s) => s.topic);
}

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

  const searchMatches = useMemo(() => searchTopics(query), [query]);
  const showSearchResults = query.trim().length >= 3;

  if (!employeeUser) {
    return <WelcomeScreen onSuccess={setEmployeeUser} />;
  }

  return (
    <PortalLayout activeNav="solicitudes">
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
        {ROOT_OPTIONS.map((opt) => (
          <button key={opt.id} type="button" className={styles.needCard} onClick={() => navigate(opt.to)}>
            <div className={styles.iconBadge}>{ICONS[opt.id]}</div>
            <h3>{opt.title}</h3>
            <p>{opt.desc}</p>
          </button>
        ))}
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
