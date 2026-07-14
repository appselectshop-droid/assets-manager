import { useNavigate, useSearchParams } from 'react-router-dom';
import EmployeeLoginWidget from '../components/EmployeeLoginWidget';
// Reutiliza el lenguaje visual de las páginas públicas (Solicitar
// Cuenta/Ingreso/Recurso, Reportar Ticket, Mesa de Ayuda).
import styles from './SolicitarCuenta.module.css';

// Página completa de login/activación — hoy el flujo normal es entrar desde
// Mesa de Ayuda (login inline, ver MesaDeAyuda.jsx), pero esta ruta se
// conserva como destino de EmployeeRoute (App.jsx) para quien entra directo
// a /reportar-ticket o /mis-tickets sin pasar por ahí (ej. un link
// compartido) — el `?next=` original se respeta igual.
export default function EmployeeLogin() {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const next = searchParams.get('next') || '/mis-tickets';

  return (
    <div className={styles.page}>
      <div className={styles.card}>
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
