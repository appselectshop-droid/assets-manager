import { Link, useNavigate } from 'react-router-dom';
import PortalLayout from '../components/PortalLayout';
// Mismo módulo de estilos que el índice de Manuales — reutiliza .grid/.card,
// nombres de clase genéricos, no específicos de esa página.
import styles from './Manuales.module.css';

// La app de Ventas tiene un solo manual de fondo, pero contado desde 2
// puntos de vista distintos (Vendedor Foráneo vs. Telemarketing) — pedido
// explícito del usuario: un botón general ("Manual de Ventas") que, al
// entrar, deja elegir cuál de los 2 perfiles corresponde, en vez de mezclar
// ambos en un solo documento o duplicar la tarjeta en el índice de Manuales.
const VARIANTS = [
  {
    key: 'vendedor',
    icon: '🧑‍💼',
    title: 'Manual del Vendedor Foráneo',
    desc: 'Visitas con geolocalización, cotizaciones y comprobantes de viáticos.',
    to: '/manuales/ventas/vendedor',
  },
  {
    key: 'telemarketing',
    icon: '📞',
    title: 'Manual de Telemarketing',
    desc: 'Llamadas, resultados automáticos y cotizaciones desde el teléfono.',
    to: '/manuales/ventas/telemarketing',
  },
];

export default function ManualVentas() {
  const navigate = useNavigate();

  return (
    <PortalLayout activeNav="manuales">
      <Link to="/manuales" className={styles.backLink}>← Volver a Manuales y Políticas</Link>
      <div className={styles.mainHead}>
        <h1>Manual de Ventas</h1>
        <p>Misma app, 2 perfiles distintos — elige el que te corresponde.</p>
      </div>

      <div className={styles.grid}>
        {VARIANTS.map((v) => (
          <button key={v.key} type="button" className={styles.card} onClick={() => navigate(v.to)}>
            <span className={styles.cardIcon}>{v.icon}</span>
            <h3>{v.title}</h3>
            <p>{v.desc}</p>
          </button>
        ))}
      </div>
    </PortalLayout>
  );
}
