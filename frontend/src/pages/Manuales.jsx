import { Link, useNavigate } from 'react-router-dom';
import PortalLayout from '../components/PortalLayout';
import styles from './Manuales.module.css';

// Catálogo de manuales — pensado para crecer (cada app/proceso interno puede
// tener el suyo), aunque hoy solo exista el de Mesa de Ayuda. Igual patrón
// que ROOT_OPTIONS en MesaDeAyuda.jsx: un array simple, agregar uno nuevo es
// agregar un objeto aquí, sin tocar el resto de la página.
const MANUALS = [
  {
    key: 'mesa-de-ayuda',
    icon: '📘',
    title: 'Manual de Usuario — Mesa de Ayuda',
    desc: 'Cómo entrar, buscar tu problema, reportar un ticket y darle seguimiento.',
    to: '/manuales/mesa-de-ayuda',
  },
];

// Todavía sin contenido — pedido explícito del usuario fue "manuales y
// políticas" como sección, aunque por ahora solo haya un manual. Se deja el
// bloque vacío en vez de omitirlo, para que la sección exista desde ya y
// cualquier política que se agregue después tenga dónde vivir.
const POLICIES = [];

export default function Manuales() {
  const navigate = useNavigate();

  return (
    <PortalLayout activeNav="manuales">
      <Link to="/mesa-de-ayuda" className={styles.backLink}>← Volver a Solicitudes</Link>
      <div className={styles.mainHead}>
        <h1>Manuales y Políticas</h1>
        <p>Guías de uso de la Mesa de Ayuda y documentos de referencia.</p>
      </div>

      <p className={styles.groupTitle}>Manuales</p>
      <div className={styles.grid}>
        {MANUALS.map((m) => (
          <button key={m.key} type="button" className={styles.card} onClick={() => navigate(m.to)}>
            <span className={styles.cardIcon}>{m.icon}</span>
            <h3>{m.title}</h3>
            <p>{m.desc}</p>
          </button>
        ))}
      </div>

      <p className={styles.groupTitle} style={{ marginTop: '1.75rem' }}>Políticas</p>
      <div className={styles.grid}>
        {POLICIES.length === 0 ? (
          <p className={styles.empty}>Aún no hay políticas publicadas aquí. Se agregarán conforme estén listas.</p>
        ) : (
          POLICIES.map((p) => (
            <button key={p.key} type="button" className={styles.card} onClick={() => navigate(p.to)}>
              <span className={styles.cardIcon}>{p.icon}</span>
              <h3>{p.title}</h3>
              <p>{p.desc}</p>
            </button>
          ))
        )}
      </div>
    </PortalLayout>
  );
}
