import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import styles from './NotificationBell.module.css';

// Campanita de notificaciones — pedido explícito del usuario (2026-08-10):
// "si no veo el telegram no me entero de las solicitudes". El contador es
// compartido entre todo Sistemas (no un visto/no-visto por persona) — se
// calcula en vivo en el servidor a partir de qué sigue pendiente/sin
// tomar en cada módulo (ver GET /notifications/summary), así que en
// cuanto alguien toma un ticket/solicitud el numerito baja solo para
// todos, sin que nadie tenga que marcar nada como leído.
// `data` llega por prop (ver hooks/useNotificationsSummary.js) — Layout.jsx
// es quien hace el fetch/polling, para usar el MISMO resultado también en
// los circulitos rojos de los botones de categoría, sin duplicar peticiones.
export default function NotificationBell({ data, markSeen }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  useEffect(() => {
    if (!open) return;
    const handleClick = (e) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener('mousedown', handleClick);
    return () => document.removeEventListener('mousedown', handleClick);
  }, [open]);

  const goTo = (link) => {
    navigate(link);
    setOpen(false);
  };

  // Clic en un pendiente específico (no solo en el encabezado de la
  // categoría) — pedido explícito del usuario (2026-08-10): "en
  // notificaciones te debería de abrir la notificación en específico", no
  // solo mandar a la lista general. Cada categoría trae su propio `param`
  // (ver backend/src/routes/notifications.js) — la página de destino ya
  // sabe leerlo y abrir/resaltar ese registro exacto.
  //
  // "Una vez que ya lo haya visualizado, que se quite" (mismo día) — se
  // marca como visto PARA ESTA PERSONA al abrirlo (no solo al pasar el
  // mouse ni al abrir la campana en general, para no apagar de más algo
  // que nadie realmente revisó).
  const goToItem = (c, itemId) => {
    markSeen(c.key, itemId);
    navigate(c.param ? `${c.link}?${c.param}=${itemId}` : c.link);
    setOpen(false);
  };

  return (
    <div className={styles.wrap} ref={wrapRef}>
      <button type="button" className={styles.bellBtn} onClick={() => setOpen((v) => !v)} title="Notificaciones">
        🔔
        {data.total > 0 && <span className={styles.badge}>{data.total > 99 ? '99+' : data.total}</span>}
      </button>

      {open && (
        <div className={styles.panel}>
          <p className={styles.panelTitle}>Notificaciones</p>
          {data.categories.length === 0 ? (
            <p className={styles.empty}>Sin pendientes — todo al día. ✅</p>
          ) : (
            data.categories.map((c) => (
              <div key={c.key} className={styles.category}>
                <button type="button" className={styles.categoryHead} onClick={() => goTo(c.link)}>
                  <span>{c.label}</span>
                  <span className={styles.categoryCount}>{c.count}</span>
                </button>
                {c.items.map((it) => (
                  <button type="button" key={it.id} className={styles.item} onClick={() => goToItem(c, it.id)}>
                    <span className={styles.itemTitle}>{it.title}</span>
                    <span className={styles.itemSubtitle}>{it.subtitle}</span>
                  </button>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
