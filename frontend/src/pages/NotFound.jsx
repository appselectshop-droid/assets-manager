import styles from './NotFound.module.css';

// Se muestra tanto para rutas que no existen como para rutas privadas
// visitadas sin sesión — a propósito no redirige a /login, para no
// delatarle a quien solo esté curioseando la URL que aquí vive un sistema
// interno con su propio login.
export default function NotFound() {
  return (
    <div className={styles.container}>
      <div>
        <p className={styles.code}>404</p>
        <p className={styles.title}>Página no encontrada</p>
        <p className={styles.subtitle}>La dirección a la que intentas entrar no existe.</p>
      </div>
    </div>
  );
}
