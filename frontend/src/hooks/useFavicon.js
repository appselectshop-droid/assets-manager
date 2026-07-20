import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// El panel admin y el portal de Mesa de Ayuda comparten un solo index.html
// (una sola SPA) — el <link rel="icon"> de por sí es uno solo para toda la
// app. Pedido explícito del usuario: que el ícono junto al dominio (la
// pestaña del navegador) cambie SOLO mientras se navega dentro de Mesa de
// Ayuda, sin tocar el ícono del panel admin (que vive en "/" y sus rutas
// anidadas, ver components/Layout.jsx). Como no hay 2 pestañas reales, la
// única forma de lograrlo es cambiar el href del favicon en cada navegación
// según el prefijo de la ruta actual.
const DEFAULT_FAVICON = '/icons/favicon-32.png';
const MESA_AYUDA_FAVICON = '/icons/favicon-mesa-ayuda.png';

const MESA_AYUDA_PATH_PREFIXES = [
  '/mesa-de-ayuda', '/reportar-ticket', '/mis-tickets', '/mis-solicitudes',
  '/manuales', '/empleado', '/solicitar-cuenta', '/solicitar-recurso', '/solicitar-ingreso',
];

export default function useFavicon() {
  const location = useLocation();
  useEffect(() => {
    const isMesaDeAyuda = MESA_AYUDA_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
    const link = document.querySelector('link[rel="icon"]');
    if (link) link.href = isMesaDeAyuda ? MESA_AYUDA_FAVICON : DEFAULT_FAVICON;
  }, [location.pathname]);
}
