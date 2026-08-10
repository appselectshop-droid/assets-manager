import { useEffect, useState } from 'react';
import api from '../services/api';

const EMPTY = { total: 0, categories: [] };

// Fuente única de la campanita de notificaciones — pedido explícito del
// usuario (2026-08-10): además del número en la campana, un circulito rojo
// en los botones de categoría de arriba (estilo WhatsApp/Facebook) marcando
// EN CUÁL categoría hay algo pendiente. Se saca a un hook aparte (en vez de
// vivir dentro de NotificationBell.jsx) para que Layout.jsx use los MISMOS
// datos para los circulitos sin duplicar el polling cada 8s.
export default function useNotificationsSummary() {
  const [data, setData] = useState(EMPTY);

  useEffect(() => {
    const load = () => {
      api.get('/notifications/summary').then(({ data }) => setData(data)).catch(() => {});
    };
    load();
    const interval = setInterval(load, 8000);
    return () => clearInterval(interval);
  }, []);

  // "Una vez que ya lo haya visualizado, que se quite... porque ahí va a
  // seguir" (pedido explícito del usuario, mismo día) — al abrir un
  // pendiente puntual se apaga PARA ESTA PERSONA (ver POST
  // /notifications/seen), sin esperar al siguiente poll de 8s: se actualiza
  // `data` de una vez (quita el item, resta 1 al conteo de su categoría y
  // al total; si la categoría se queda en 0 desaparece por completo, y con
  // ella el circulito).
  const markSeen = (key, id) => {
    api.post('/notifications/seen', { key, id }).catch(() => {});
    setData((prev) => {
      const categories = prev.categories
        .map((c) => (c.key !== key ? c : { ...c, count: c.count - 1, items: c.items.filter((it) => it.id !== id) }))
        .filter((c) => c.count > 0);
      return { total: prev.total - 1, categories };
    });
  };

  return { data, markSeen };
}
