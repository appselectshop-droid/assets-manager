import { useNavigate, useSearchParams } from 'react-router-dom';
import EmployeeLoginWidget from '../components/EmployeeLoginWidget';
// Reutiliza el lenguaje visual de las páginas públicas (Solicitar
// Cuenta/Ingreso/Recurso, Reportar Ticket, Mesa de Ayuda).
import styles from './SolicitarCuenta.module.css';

// Página completa de login/activación — hoy el flujo normal es entrar desde
// Mesa de Ayuda (login inline, ver MesaDeAyuda.jsx), pero esta ruta se
// conserva como destino de EmployeeRoute (App.jsx) para quien entra directo
// a /mesa-de-ayuda/reportar-ticket o /mesa-de-ayuda/mis-tickets sin pasar
// por ahí (ej. un link
// compartido) — el `?next=` original se respeta igual.
export default function EmployeeLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  // Default a Mis Solicitudes (2026-08-31, pedido explícito del usuario:
  // "siempre" caer ahí al entrar) — antes era Mis Tickets. Solo aplica
  // cuando NO hay `?next=` (alguien entra a mano a esta URL); cuando sí
  // hay `?next=` explícito (caso normal: EmployeeRoute redirigiendo desde
  // una ruta protegida), ese destino se sigue respetando igual.
  const next = searchParams.get('next') || '/mesa-de-ayuda/mis-solicitudes';

  return (
    <div className={`portalDark ${styles.page} ${styles.loginPage}`}>
      <div className={`${styles.card} ${styles.loginCardWide}`}>
        <div className={styles.header}>
          <span className={styles.icon}>🔐</span>
          <h1 className={styles.title}>Mis Tickets</h1>
          <p className={styles.subtitle}>Select Shop MB — inicia sesión para reportar y ver tu historial</p>
        </div>
        <EmployeeLoginWidget onSuccess={() => navigate(next, { replace: true })} />
      </div>
    </div>
  );
}
