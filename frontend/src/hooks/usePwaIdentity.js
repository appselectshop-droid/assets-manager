import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// El panel de Sistemas (Sistema de Tickets: tickets, ingresos, envíos,
// activos...) y el portal de Mesa de Ayuda comparten un solo index.html
// (una sola SPA) — pero pedido explícito del usuario: cada uno debe poder
// "instalarse" por separado, con su propio ícono, nombre y manifest.json,
// sin duplicar el proyecto. Como no hay 2 HTML reales, la única forma de
// lograrlo es cambiar estas etiquetas del <head> en cada navegación según
// el prefijo de la ruta actual: Android/Chrome lee el <link rel="manifest">
// vigente al momento de instalar, e iOS no sigue manifest.json en
// absoluto — usa estas meta/link propias de Apple al hacer "Agregar a
// pantalla de inicio", así que también hay que mantenerlas al día.
const MESA_AYUDA_FAVICON = '/icons/favicon-mesa-ayuda.png';
const TICKETS_FAVICON = '/icons/favicon-tickets-32.png';

const MESA_AYUDA_APPLE_ICON = '/icons/apple-touch-icon.png';
const TICKETS_APPLE_ICON = '/icons/apple-touch-icon-tickets.png';

const MESA_AYUDA_MANIFEST = '/manifest.webmanifest';
const TICKETS_MANIFEST = '/manifest-tickets.webmanifest';

const MESA_AYUDA_APPLE_TITLE = 'Mesa de Ayuda';
const TICKETS_APPLE_TITLE = 'Sistema de Tickets';

const MESA_AYUDA_PATH_PREFIXES = [
  '/mesa-de-ayuda', '/reportar-ticket', '/mis-tickets', '/mis-solicitudes',
  '/manuales', '/empleado', '/solicitar-cuenta', '/solicitar-recurso', '/solicitar-ingreso',
];

function setHref(selector, href) {
  const el = document.querySelector(selector);
  if (el) el.setAttribute('href', href);
}

export default function usePwaIdentity() {
  const location = useLocation();
  useEffect(() => {
    const isMesaDeAyuda = MESA_AYUDA_PATH_PREFIXES.some((prefix) => location.pathname.startsWith(prefix));
    // Todo lo que no es Mesa de Ayuda (incluye /login y todo el panel bajo
    // "/") es el Sistema de Tickets — no hay una tercera identidad.
    setHref('link[rel="icon"]', isMesaDeAyuda ? MESA_AYUDA_FAVICON : TICKETS_FAVICON);
    setHref('link[rel="apple-touch-icon"]', isMesaDeAyuda ? MESA_AYUDA_APPLE_ICON : TICKETS_APPLE_ICON);
    setHref('link[rel="manifest"]', isMesaDeAyuda ? MESA_AYUDA_MANIFEST : TICKETS_MANIFEST);
    const titleMeta = document.querySelector('meta[name="apple-mobile-web-app-title"]');
    if (titleMeta) titleMeta.setAttribute('content', isMesaDeAyuda ? MESA_AYUDA_APPLE_TITLE : TICKETS_APPLE_TITLE);
  }, [location.pathname]);
}
