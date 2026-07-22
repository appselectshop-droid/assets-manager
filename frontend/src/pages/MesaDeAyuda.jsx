import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import EmployeeLoginWidget from '../components/EmployeeLoginWidget';
import PortalLayout from '../components/PortalLayout';
import { CATEGORIES, problemLabel, problemNote, problemKeywords, findSpecialSubareas } from '../config/ticketCategories';
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

// Buscador tipo "centro de ayuda": la persona escribe en sus propias
// palabras (ej. "no me funciona la macros") y se le sugiere a dónde ir, en
// vez de tener que adivinar en cuál tarjeta encaja. Nada de IA ni servicio
// externo, solo coincidencia de texto contra un catálogo curado a mano.
//
// Los temas de tickets (reportar algo roto) YA NO viven aquí por separado —
// se generan de `CATEGORIES` (config/ticketCategories.js), la MISMA lista
// que usa el wizard de Reportar Ticket. Antes había 2 catálogos de palabras
// clave (uno para el buscador, otro para el wizard) y se desincronizaban
// solos cada vez que se agregaba una categoría nueva. Con un solo catálogo
// eso ya no puede pasar.
//
// Además, el buscador ahora llega hasta lo particular, no solo hasta la
// categoría: si el texto coincide con un problema específico (ej. "no me
// llegan correos de outlook" -> el problema exacto de Software, no solo
// "Software" en general), el resultado salta DIRECTO al formulario con ese
// problema ya precargado (`?problema=...`, resuelto en ReportarTicket.jsx).
// Si solo hay señal de la categoría en general, el resultado lleva al paso
// 2 de esa categoría (como antes). Los temas de "pedir algo nuevo"
// (solicitudes) no son tickets - se quedan como su propio catálogo aparte,
// sin este nivel de detalle porque no lo necesitan.
function normalize(s) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim();
}

const SOLICITUD_TOPICS = [
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
    // Pedido explícito: solo RH (canManageOnboarding) debe encontrar esto,
    // ni siquiera vía buscador — si no, cualquiera lo descubre escribiendo
    // "nuevo empleado" aunque la tarjeta esté escondida del menú principal.
    restricted: 'canManageOnboarding',
  },
  {
    icon: '📤', label: 'Baja de personal', to: '/baja-personal',
    hint: 'Un jefe reporta que alguien de su equipo causa baja (jefes y RH).',
    keywords: ['baja de personal', 'dar de baja', 'causa baja', 'renuncia', 'despido', 'termino de contrato', 'devolucion de activos'],
    // Mismo criterio que Alta de Ingreso: invisible incluso por buscador
    // para quien no tenga ninguno de los 2 permisos (jefe o RH).
    restricted: (u) => !!u?.canRequestOffboarding || !!u?.canManageOffboarding,
  },
];

// Frase completa dentro de la búsqueda pesa más que una palabra suelta
// parecida. `fullWeight`/`wordWeight` más altos para problemas específicos
// que para la categoría en general — así, si ambos matchean, gana siempre
// el más particular (justo el criterio que se pidió).
function scoreKeywords(keywords, q, words, fullWeight, wordWeight) {
  let score = 0;
  // Pedido explícito del usuario: buscar solo "correo" (una palabra
  // genérica, sin ninguna frase alrededor) no encontraba nada — los
  // keywords son casi siempre frases largas ("no me llegan correos",
  // "firma de correo"), más largas que la búsqueda, así que nunca "cabían"
  // dentro de ella. Se limita a búsquedas de UNA sola palabra (ver abajo)
  // para no reabrir el problema que ya evita la rama de "matching flojo":
  // una búsqueda de VARIAS palabras enganchando por una palabra genérica
  // compartida (ej. "necesito") con una frase sin relación real.
  const isSingleWordQuery = words.length === 1 && words[0] === q;
  for (const kw of keywords) {
    const nkw = normalize(kw);
    if (!nkw) continue;
    if (q.includes(nkw)) score += fullWeight;
    // El matching "flojo" solo aplica a keywords de UNA palabra. Con frases
    // de varias palabras (ej. "necesito un mouse"), permitir esta rama
    // dejaba que una sola palabra genérica compartida (ej. "necesito") la
    // disparara igual, aunque el resto de la frase no tuviera nada que ver
    // — una categoría con muchas frases que empiezan igual ("necesito...")
    // terminaba ganando por cantidad, no por relevancia real. Además,
    // umbral de 4+ letras: con 3, palabras comunes como "que"/"ver" salían
    // como substring de keywords sin relación (ej. "que" dentro de
    // "bloqueada"). La frase completa (arriba) no tiene ninguno de estos 2
    // límites.
    else if (!nkw.includes(' ') && nkw.length >= 4 && words.some((w) => nkw.includes(w) || w.includes(nkw))) score += wordWeight;
    // La búsqueda es una sola palabra (>=4 letras): compárala contra CADA
    // palabra del keyword (aunque sea una frase de varias), en ambos
    // sentidos — cubre tanto "correo" encontrando "...correos" (la query es
    // más corta) como "proveedores" encontrando "...proveedor..." (la query
    // es más larga, por el plural). Antes ninguno de los 2 casos se cubría
    // para keywords de más de una palabra.
    else if (isSingleWordQuery) {
      const kwWords = nkw.split(' ').filter((w) => w.length >= 4);
      if (kwWords.some((w) => w.includes(q) || q.includes(w))) score += wordWeight;
    }
  }
  return score;
}

// Por categoría, se queda con el MEJOR resultado posible: un problema
// específico si alguno coincidió (más particular, gana siempre), si no la
// categoría en general (más amplio, respaldo). Nunca los dos a la vez para
// la misma categoría — evita mostrar "Software" y "Software: Outlook..."
// juntos, uno basta.
function bestTicketMatch(cat, q, words, apps) {
  let best = null;
  const catScore = scoreKeywords(cat.keywords || [], q, words, 3, 1);
  if (catScore > 0) best = { score: catScore, kind: 'category' };

  if (Array.isArray(cat.problems)) {
    for (const p of cat.problems) {
      const pScore = scoreKeywords(problemKeywords(p), q, words, 5, 2);
      if (pScore > 0 && (!best || pScore > best.score)) best = { score: pScore, kind: 'problem', item: p };
    }
  } else if (cat.problems === 'apps') {
    for (const app of apps) {
      // Algunas apps (Solicitud de Pagos, Ventas, Gestor de Constancias)
      // tienen su propio catálogo de apartados y problemas — buscar ahí
      // primero deja llegar hasta lo más particular posible (ej. "alta de
      // proveedores" encuentra el problema exacto dentro de "Alta de
      // Proveedores", no solo "Solicitud de Pagos" en general). Antes el
      // buscador no veía estos catálogos en absoluto.
      const subareas = findSpecialSubareas(app.name);
      if (subareas) {
        for (const sub of subareas) {
          for (const p of sub.problems) {
            // Peso un punto más bajo que un problema de categoría normal
            // (5/2) a propósito: varios apartados (ej. "Usuarios" de
            // Solicitud de Pagos, "Acceso" de Ventas) repiten frases
            // genéricas de cuenta/contraseña que también cubre la categoría
            // "Cuenta / Acceso" de siempre — sin este desempate, una
            // búsqueda genérica como "no puedo entrar al ERP" podía terminar
            // arriba de la app equivocada solo por el orden del catálogo.
            // Con menos peso, el apartado solo gana cuando su coincidencia
            // es la única o la más específica, que es el caso real que se
            // pidió resolver (ej. "alta de proveedores").
            const pScore = scoreKeywords(problemKeywords(p), q, words, 4, 1);
            if (pScore > 0 && (!best || pScore > best.score)) best = { score: pScore, kind: 'app-subarea-problem', app, subarea: sub, item: p };
          }
        }
      }
      const nname = normalize(app.name);
      if (nname.length >= 3 && q.includes(nname) && (!best || 5 > best.score)) best = { score: 5, kind: 'app', item: app };
    }
  }
  return best;
}

function buildTicketResult(cat, best) {
  if (best.kind === 'category') {
    return { icon: cat.icon, label: `${cat.label} — reportar ticket`, hint: cat.desc, to: `/reportar-ticket?tipo=${cat.key}`, score: best.score };
  }
  if (best.kind === 'app') {
    return { icon: cat.icon, label: `${best.item.name} — reportar ticket`, hint: `${cat.desc} (aplicación identificada)`, to: `/reportar-ticket?tipo=aplicacion&app=${best.item._id}`, score: best.score };
  }
  if (best.kind === 'app-subarea-problem') {
    return {
      icon: best.subarea.icon,
      label: problemLabel(best.item),
      hint: `${best.app.name} — ${best.subarea.label}`,
      to: `/reportar-ticket?tipo=aplicacion&app=${best.app._id}&subarea=${best.subarea.key}&problema=${encodeURIComponent(problemLabel(best.item))}`,
      score: best.score,
    };
  }
  const note = problemNote(best.item);
  return {
    icon: cat.icon,
    label: problemLabel(best.item),
    hint: note ? `${cat.label} — puede ser un tema de licencia, no una falla.` : `${cat.label} — se reporta como ticket.`,
    to: `/reportar-ticket?tipo=${cat.key}&problema=${encodeURIComponent(problemLabel(best.item))}`,
    score: best.score,
  };
}

// `restricted`, cuando existe, es el nombre EXACTO del permiso en
// `employeeUser` (ej. 'canManageOnboarding') — así agregar un tema nuevo
// restringido (ej. Baja de Personal) no requiere tocar este filtro, solo
// declarar el nombre correcto del permiso en el tema.
function searchTopics(rawQuery, apps, employeeUser) {
  const q = normalize(rawQuery);
  if (q.length < 3) return [];
  const words = q.split(/\s+/).filter((w) => w.length >= 4);

  const ticketResults = CATEGORIES.map((cat) => {
    const best = bestTicketMatch(cat, q, words, apps);
    return best ? buildTicketResult(cat, best) : null;
  }).filter(Boolean);

  const solicitudResults = SOLICITUD_TOPICS
    .filter((topic) => {
      if (!topic.restricted) return true;
      // `restricted` es el nombre de un permiso (ej. 'canManageOnboarding')
      // o una función para casos de "cualquiera de estos 2 permisos"
      // (ej. Baja de Personal: jefe O RH).
      return typeof topic.restricted === 'function' ? topic.restricted(employeeUser) : !!employeeUser?.[topic.restricted];
    })
    .map((topic) => ({ ...topic, score: scoreKeywords(topic.keywords, q, words, 3, 1) }))
    .filter((t) => t.score > 0);

  return [...ticketResults, ...solicitudResults].sort((a, b) => b.score - a.score).slice(0, 5);
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
