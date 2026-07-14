import { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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

// Punto de entrada único para cualquier empleado. En vez de mostrar botones
// con nombres de módulo, hace 1-2 preguntas en lenguaje simple y navega sola
// al formulario correcto, incluyendo "tengo un problema" como una rama más
// del árbol (enrutamiento pedido por Finanzas — ver CHANGELOG). Debajo se
// deja, además, un acceso directo al Sistema de Tickets para quien ya sabe
// que lo suyo es un ticket y no quiere pasar por las preguntas.
export default function MesaDeAyuda() {
  const navigate = useNavigate();
  const [step, setStep] = useState('root');

  const handleRootPick = (id) => {
    if (id === 'onboarding') {
      navigate('/solicitar-ingreso');
      return;
    }
    setStep(id);
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
                <Link key={opt.title} to={opt.to} className={styles.optionCard}>
                  <span className={styles.optionIcon}>{opt.icon}</span>
                  <span className={styles.optionTitle}>{opt.title}</span>
                  <span className={styles.optionDesc}>{opt.desc}</span>
                </Link>
              ))}
            </div>
          </>
        )}

        <div className={styles.divider}>
          <span className={styles.dividerLine} />
          <span className={styles.dividerText}>¿Ya sabes que es un ticket?</span>
          <span className={styles.dividerLine} />
        </div>

        <div className={styles.ticketBox}>
          <span className={styles.ticketIcon}>🎫</span>
          <p className={styles.ticketTitle}>Sistema de Tickets</p>
          <p className={styles.ticketDesc}>
            Repórtalo directo aquí, sin pasar por las preguntas de arriba — te pediremos iniciar sesión.
          </p>
          <Link to="/reportar-ticket" className={styles.ticketBtn}>
            Reportar un ticket
          </Link>
          <p className={styles.ticketDesc} style={{ marginTop: '0.85rem' }}>
            <Link to="/mis-tickets" className={styles.backLink} style={{ display: 'inline' }}>
              ¿Ya reportaste algo? Ver mi historial →
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
