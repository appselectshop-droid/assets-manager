import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../services/api';
import styles from './NotificationBell.module.css';

const EMPTY = { total: 0, categories: [] };

// Campanita de notificaciones — pedido explícito del usuario (2026-08-10):
// "si no veo el telegram no me entero de las solicitudes". El contador es
// compartido entre todo Sistemas (no un visto/no-visto por persona) — se
// calcula en vivo en el servidor a partir de qué sigue pendiente/sin
// tomar en cada módulo (ver GET /notifications/summary), así que en
// cuanto alguien toma un ticket/solicitud el numerito baja solo para
// todos, sin que nadie tenga que marcar nada como leído. Mismo idioma de
// polling que ya usan Solicitudes de Recursos/Cuentas/Bajas/Altas/Tickets
// (setInterval de 8s), no un mecanismo nuevo.
export default function NotificationBell() {
  const navigate = useNavigate();
  const [data, setData] = useState(EMPTY);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef(null);

  const load = () => {
    api.get('/notifications/summary').then(({ data }) => setData(data)).catch(() => {});
  };

  useEffect(() => {
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

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
                  <button type="button" key={it.id} className={styles.item} onClick={() => goTo(c.link)}>
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
