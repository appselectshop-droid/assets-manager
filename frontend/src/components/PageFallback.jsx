// Lo que se ve mientras se descarga una página (ver utils/lazyPage.js).
// Aparece después de 300ms — en una red normal la página llega antes y no
// parpadea nada.
import styles from './PageFallback.module.css';

export default function PageFallback() {
  return (
    <div className={styles.wrap} role="status" aria-live="polite">
      <span className={styles.spinner} aria-hidden="true" />
      <span>Cargando…</span>
    </div>
  );
}
