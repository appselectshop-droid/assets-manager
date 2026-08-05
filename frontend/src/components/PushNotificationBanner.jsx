import { useEffect, useState } from 'react';
import styles from './PushNotificationBanner.module.css';

const DISMISS_KEY = 'pushBannerDismissedAt';
const RESHOW_AFTER_MS = 7 * 24 * 60 * 60 * 1000; // 7 días

const IOS = /iPad|iPhone|iPod/.test(navigator.userAgent);

function wasDismissedRecently() {
  const raw = localStorage.getItem(DISMISS_KEY);
  if (!raw) return false;
  return Date.now() - Number(raw) < RESHOW_AFTER_MS;
}

// Banner descartable — pedido explícito del usuario: "no los ven" cuando
// Sistemas responde un ticket, así que se busca máxima visibilidad, no un
// ícono escondido en una esquina que nadie nota (ese fue justo el problema
// que se está resolviendo). Vuelve a aparecer a los 7 días SOLO si la
// persona nunca decidió nada (`Notification.permission` sigue en
// 'default') — no insiste con quien ya dijo que sí o que no.
//
// Genérico entre las 2 identidades (Mesa de Ayuda y panel admin, ver
// TicketsLayout.jsx) — cada quien pasa su propio texto del aviso.
//
// `status`/`subscribe` llegan como props, NO se vuelve a llamar
// usePushSubscription aquí (2026-08-05) — antes este componente montaba su
// propia instancia del hook además de la que ya corría en el layout padre
// (PortalLayout.jsx/TicketsLayout.jsx), y las dos mandaban el POST de
// suscripción casi al mismo tiempo en cada carga de página — bug real
// reportado por el usuario: le llegaban ~5 notificaciones duplicadas por
// cada mensaje. Un solo hook montado, compartido vía props.
export default function PushNotificationBanner({ status, subscribe, message, className }) {
  const [dismissed, setDismissed] = useState(wasDismissedRecently);
  const [error, setError] = useState('');

  useEffect(() => {
    if (status === 'subscribed') localStorage.removeItem(DISMISS_KEY);
  }, [status]);

  // 'unsupported' fuera de iOS es un navegador viejo sin nada accionable —
  // mostrar un aviso que no lleva a ningún lado sería el mismo ruido que se
  // está evitando en los demás casos.
  if (status === 'subscribed' || status === 'denied' || status === 'checking' || dismissed) return null;
  if (status === 'unsupported' && !IOS) return null;

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
  };

  const handleActivate = async () => {
    setError('');
    try {
      await subscribe();
    } catch {
      setError('No se pudo activar. Intenta de nuevo.');
    }
  };

  return (
    <div className={`${styles.banner} ${className || ''}`}>
      <span className={styles.icon}>🔔</span>
      <div className={styles.text}>
        {status === 'unsupported' ? (
          <>
            <strong>Activa notificaciones:</strong> toca el ícono de compartir
            {' '}<span className={styles.shareIcon}>⬆️</span>{' '}en Safari → "Agregar a
            pantalla de inicio" → abre la app desde ahí para poder activarlas.
          </>
        ) : (
          message || <><strong>Entérate al instante</strong> cuando te respondan un ticket.</>
        )}
        {error && <span className={styles.error}> {error}</span>}
      </div>
      <div className={styles.actions}>
        {status === 'default' && (
          <button type="button" className={styles.activateBtn} onClick={handleActivate}>Activar</button>
        )}
        <button type="button" className={styles.dismissBtn} onClick={handleDismiss} aria-label="Cerrar aviso">✕</button>
      </div>
    </div>
  );
}
