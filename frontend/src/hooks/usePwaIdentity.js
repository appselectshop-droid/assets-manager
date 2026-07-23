import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// El panel de Sistemas (Sistema de Tickets: tickets, ingresos, envíos,
// activos...) y el portal de Mesa de Ayuda comparten un solo bundle de
// React — pero pedido explícito del usuario: cada uno debe poder
// "instalarse" por separado, con su propio ícono, nombre y manifest.json.
//
// La instalabilidad de verdad (qué ve Chrome/Edge al momento de instalar)
// la resuelve Vercel sirviendo un HTML distinto por prefijo de ruta (ver
// vercel.json + scripts/generate-mesa-de-ayuda-shell.js) — un navegador NO
// vuelve a evaluar si hay una app nueva para instalar solo porque un script
// cambie el <link rel="manifest"> después de que React ya montó; necesita
// ver la etiqueta correcta desde el HTML que le llegó de primera mano.
// Este hook sigue siendo necesario aparte para UNA cosa: mientras alguien
// navega DENTRO de la SPA sin recargar (ej. de /login a /mesa-de-ayuda), el
// ícono de la pestaña y el <link rel="manifest"> del DOM deben quedar
// correctos para esa sesión — y en iOS, que no sigue manifest.json en
// absoluto y usa estas mismas meta/link propias de Apple al hacer
// "Agregar a pantalla de inicio", si la persona comparte desde ahí sin
// haber recargado.
const MESA_AYUDA_FAVICON = '/icons/favicon-mesa-ayuda.png';
const TICKETS_FAVICON = '/icons/favicon-tickets-32.png';

const MESA_AYUDA_APPLE_ICON = '/icons/apple-touch-icon.png';
const TICKETS_APPLE_ICON = '/icons/apple-touch-icon-tickets.png';

// El nombre de archivo generado por vite-plugin-pwa (manifest.webmanifest)
// AHORA es el de Sistema de Tickets (ver vite.config.js) — Mesa de Ayuda es
// el que vive a mano en public/manifest-mesa-de-ayuda.webmanifest.
const MESA_AYUDA_MANIFEST = '/manifest-mesa-de-ayuda.webmanifest';
const TICKETS_MANIFEST = '/manifest.webmanifest';

const MESA_AYUDA_APPLE_TITLE = 'Mesa de Ayuda';
const TICKETS_APPLE_TITLE = 'Sistema de Tickets';

// Un solo prefijo desde que todo Mesa de Ayuda vive bajo /mesa-de-ayuda/...
// (2026-07-23) — mismo prefijo que EMPLOYEE_PATH_PREFIXES en App.jsx y el
// scope real de su manifest (ver vite.config.js). Los links viejos sin
// este prefijo redirigen solos (ver LegacyRedirect en App.jsx) y por un
// instante se ven con la identidad de Sistema de Tickets antes de
// redirigir — cosmético, no afecta la redirección en sí.
const MESA_AYUDA_PATH_PREFIXES = ['/mesa-de-ayuda'];

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
