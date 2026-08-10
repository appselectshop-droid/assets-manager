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

  return data;
}
