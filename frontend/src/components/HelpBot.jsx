import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import employeeApi from '../services/employeeApi';
import { CATEGORIES } from '../config/ticketCategories';
import { searchHelp, detectStatusIntent } from '../utils/helpSearch';
import RobotMascot from './RobotMascot';
import styles from './HelpBot.module.css';

// Robot de Ayuda: chat flotante que aparece en todo el lado de empleado
// (montado una sola vez en App.jsx, vía HelpBotGate — cubre el portal con
// sesión, las páginas públicas y el login/activación). 100% basado en
// reglas — el mismo motor de config/faqData.js + utils/helpSearch.js que ya
// usa el buscador de Mesa de Ayuda, sin IA ni servicio externo de por medio
// (pedido explícito del usuario: "que sea gratis, no necesitemos pagar
// tokens").
function readEmployeeUser() {
  try { return JSON.parse(localStorage.getItem('employeeUser') || 'null'); } catch { return null; }
}

function hasSession() {
  return !!localStorage.getItem('employeeToken');
}

// Con sesión: sugerencias de lo que ya se puede hacer dentro. Sin sesión
// (páginas públicas, o alguien que aún no ha entrado) — pedido explícito del
// usuario: "un usuario nuevo tendrá dudas, quiero que interactúe con el
// robot" — así que la primera sugerencia es justo cómo entrar, no algo que
// de todos modos le va a pedir iniciar sesión primero.
const SUGGESTIONS_LOGGED_IN = [
  '¿Cómo reporto un problema?',
  '¿Cómo va mi ticket?',
  'Necesito una cuenta nueva',
];
const SUGGESTIONS_LOGGED_OUT = [
  '¿Cómo inicio sesión?',
  'Es mi primera vez, no tengo contraseña',
  'Necesito una cuenta nueva',
];

const STATUS_LABELS = {
  abierto: 'abierto', en_proceso: 'en proceso', resuelto: 'resuelto', cerrado: 'cerrado',
  pendiente: 'pendiente', aprobada: 'aprobada', rechazada: 'rechazada',
  pendiente_rh: 'con RH', rechazada_rh: 'rechazada por RH',
  pendiente_sistemas: 'con Sistemas', rechazada_sistemas: 'rechazada por Sistemas', completada: 'completada',
};

function folioOf(id) {
  return id.toString().slice(-6).toUpperCase();
}

// Junta tickets + las 4 solicitudes en una sola lista reciente — mismos 5
// endpoints que ya usan MisTickets.jsx/MisSolicitudes.jsx (GET /mine), solo
// que aquí se combinan y se recortan a lo más reciente para caber en un
// mensaje de chat.
async function fetchRecentActivity() {
  const [tickets, accounts, resources, onboarding, offboarding] = await Promise.all([
    employeeApi.get('/tickets/mine').then(({ data }) => data.map((t) => ({ folio: t.folio, label: t.subject, status: t.status, createdAt: t.createdAt }))).catch(() => []),
    employeeApi.get('/account-requests/mine').then(({ data }) => data.map((r) => ({ folio: folioOf(r._id), label: `Cuenta — ${r.employeeName}`, status: r.status, createdAt: r.createdAt }))).catch(() => []),
    employeeApi.get('/resource-requests/mine').then(({ data }) => data.map((r) => ({ folio: folioOf(r._id), label: `Recurso — ${(r.resourceItems || []).join(', ') || 'Recurso'}`, status: r.status, createdAt: r.createdAt }))).catch(() => []),
    employeeApi.get('/onboarding-requests/mine').then(({ data }) => data.map((r) => ({ folio: folioOf(r._id), label: `Ingreso — ${r.employeeName}`, status: r.status, createdAt: r.createdAt }))).catch(() => []),
    employeeApi.get('/offboarding-requests/mine').then(({ data }) => data.map((r) => ({ folio: folioOf(r._id), label: `Baja — ${r.employeeName}`, status: r.status, createdAt: r.createdAt }))).catch(() => []),
  ]);
  return [...tickets, ...accounts, ...resources, ...onboarding, ...offboarding]
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt))
    .slice(0, 5);
}

let seq = 0;
function nextId() { seq += 1; return seq; }

export default function HelpBot() {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [employeeUser] = useState(readEmployeeUser);
  const [apps, setApps] = useState([]);
  const [messages, setMessages] = useState(() => {
    const greeting = employeeUser
      ? '👋 Hola, soy el Robot de Ayuda. Cuéntame qué necesitas, o elige una opción.'
      : '👋 Hola, soy el Robot de Ayuda. ¿Es tu primera vez aquí? Te ayudo a entrar, o cuéntame qué necesitas.';
    const suggestions = employeeUser ? SUGGESTIONS_LOGGED_IN : SUGGESTIONS_LOGGED_OUT;
    return [
      { id: nextId(), from: 'bot', kind: 'text', text: greeting },
      { id: nextId(), from: 'bot', kind: 'chips', chips: suggestions.map((s) => ({ label: s, value: s })) },
    ];
  });
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const listRef = useRef(null);

  useEffect(() => {
    if (!open || apps.length) return;
    employeeApi.get('/internal-apps/public').then(({ data }) => setApps(data)).catch(() => setApps([]));
  }, [open, apps.length]);

  useEffect(() => {
    if (listRef.current) listRef.current.scrollTop = listRef.current.scrollHeight;
  }, [messages, busy]);

  const pushBot = (msg) => setMessages((m) => [...m, { id: nextId(), from: 'bot', ...msg }]);
  const pushUser = (text) => setMessages((m) => [...m, { id: nextId(), from: 'user', kind: 'text', text }]);

  const goTo = (to) => { setOpen(false); navigate(to); };

  const answer = async (rawText) => {
    if (detectStatusIntent(rawText)) {
      // Sin sesión (páginas públicas, o alguien que aún no ha entrado) no
      // hay nada que consultar — y llamar a estos endpoints sin token
      // dispararía el interceptor de employeeApi que redirige a
      // /mesa-de-ayuda/empleado/login (ver services/employeeApi.js), sacando de golpe a
      // alguien de un formulario público. Se responde sin tocar la red.
      if (!hasSession()) {
        pushBot({
          kind: 'results',
          items: [{ kind: 'nav', icon: '🔐', label: 'Iniciar sesión', hint: 'Necesitas iniciar sesión para ver el estatus de tus tickets o solicitudes.', to: '/mesa-de-ayuda/empleado/login' }],
        });
        return;
      }
      setBusy(true);
      const items = await fetchRecentActivity();
      setBusy(false);
      if (!items.length) {
        pushBot({ kind: 'text', text: 'Todavía no encuentro tickets ni solicitudes tuyas registradas.' });
        return;
      }
      pushBot({ kind: 'status', items });
      return;
    }

    const results = searchHelp(rawText, { apps, employeeUser });
    if (!results.length) {
      pushBot({
        kind: 'fallback',
        text: `No encontré algo exacto para "${rawText}". Prueba con una de estas categorías, o descríbelo con otras palabras:`,
        chips: CATEGORIES.filter((c) => !c.hidden).map((c) => ({ icon: c.icon, label: c.label, to: `/mesa-de-ayuda/reportar-ticket?tipo=${c.key}` })),
      });
      return;
    }
    pushBot({ kind: 'results', items: results });
  };

  const handleSend = (text) => {
    const trimmed = text.trim();
    if (!trimmed || busy) return;
    pushUser(trimmed);
    setInput('');
    answer(trimmed);
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    handleSend(input);
  };

  return (
    // `portalDark` propio: ahora se monta en App.jsx (fuera de cualquier
    // `.portalDark` de página, ver PortalLayout/páginas públicas) para
    // aparecer en todo el lado de empleado — sin esta clase aquí mismo, las
    // variables --p-* (portal-theme.css) no resuelven y el panel queda
    // transparente.
    <div className={`portalDark ${styles.root}`}>
      {open && (
        <div className={styles.panel} role="dialog" aria-label="Robot de Ayuda">
          <div className={styles.header}>
            <span className={styles.headerAvatar}><span className={styles.robotFace}>🤖</span></span>
            <div className={styles.headerText}>
              <strong>Robot de Ayuda</strong>
              <span>Respuestas al instante, sin esperar turno</span>
            </div>
            <button type="button" className={styles.closeBtn} onClick={() => setOpen(false)} aria-label="Cerrar">✕</button>
          </div>

          <RobotMascot />

          <div className={styles.messages} ref={listRef}>
            {messages.map((m) => (
              <Message key={m.id} msg={m} onNavigate={goTo} onChip={(value) => handleSend(value)} />
            ))}
            {busy && (
              <div className={`${styles.bubble} ${styles.bubbleBot}`}>
                <span className={styles.typing}><i /><i /><i /></span>
              </div>
            )}
          </div>

          <form className={styles.inputRow} onSubmit={handleSubmit}>
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Escribe tu duda..."
              autoComplete="off"
            />
            <button type="submit" disabled={!input.trim() || busy} aria-label="Enviar">➤</button>
          </form>
        </div>
      )}

      <button
        type="button"
        className={styles.toggle}
        onClick={() => setOpen((v) => !v)}
        aria-label={open ? 'Cerrar Robot de Ayuda' : 'Abrir Robot de Ayuda'}
      >
        {open ? '✕' : <span className={styles.robotFace}>🤖</span>}
      </button>
    </div>
  );
}

function Message({ msg, onNavigate, onChip }) {
  if (msg.from === 'user') {
    return <div className={`${styles.bubble} ${styles.bubbleUser}`}>{msg.text}</div>;
  }

  if (msg.kind === 'text') {
    return <div className={`${styles.bubble} ${styles.bubbleBot}`}>{msg.text}</div>;
  }

  if (msg.kind === 'chips') {
    return (
      <div className={styles.chipRow}>
        {msg.chips.map((c) => (
          <button key={c.value} type="button" className={styles.chip} onClick={() => onChip(c.value)}>{c.label}</button>
        ))}
      </div>
    );
  }

  if (msg.kind === 'fallback') {
    return (
      <>
        <div className={`${styles.bubble} ${styles.bubbleBot}`}>{msg.text}</div>
        <div className={styles.chipRow}>
          {msg.chips.map((c) => (
            <button key={c.label} type="button" className={styles.chip} onClick={() => onNavigate(c.to)}>{c.icon} {c.label}</button>
          ))}
        </div>
      </>
    );
  }

  if (msg.kind === 'results') {
    return (
      <div className={`${styles.bubble} ${styles.bubbleBot} ${styles.bubbleResults}`}>
        {msg.items.map((r, i) => (
          r.kind === 'faq' ? (
            <div key={i} className={styles.faqResult}>
              <p className={styles.faqQ}>❓ {r.q}</p>
              <p className={styles.faqA}>{r.a}</p>
              <a className={styles.faqLink} href={r.to} onClick={(e) => { e.preventDefault(); onNavigate(r.to); }}>Ver manual completo →</a>
            </div>
          ) : (
            <button key={i} type="button" className={styles.navResult} onClick={() => onNavigate(r.to)}>
              <span className={styles.navResultIcon}>{r.icon}</span>
              <span>
                <strong>{r.label}</strong>
                <p>{r.hint}</p>
              </span>
            </button>
          )
        ))}
      </div>
    );
  }

  if (msg.kind === 'status') {
    return (
      <div className={`${styles.bubble} ${styles.bubbleBot} ${styles.bubbleResults}`}>
        <p className={styles.statusIntro}>Esto es lo más reciente que encontré:</p>
        {msg.items.map((it, i) => (
          <div key={i} className={styles.statusItem}>
            <span className={styles.statusFolio}>{it.folio}</span>
            <span className={styles.statusLabel}>{it.label}</span>
            <span className={styles.statusPill}>{STATUS_LABELS[it.status] || it.status}</span>
          </div>
        ))}
        <div className={styles.chipRow}>
          <button type="button" className={styles.chip} onClick={() => onNavigate('/mesa-de-ayuda/mis-tickets')}>Ver mis tickets</button>
          <button type="button" className={styles.chip} onClick={() => onNavigate('/mesa-de-ayuda/mis-solicitudes')}>Ver mis solicitudes</button>
        </div>
      </div>
    );
  }

  return null;
}
