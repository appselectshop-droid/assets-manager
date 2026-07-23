import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Sistema de Tickets (panel de Sistemas) como PWA — igual que Mesa de
    // Ayuda, pero para tickets/ingresos/envíos/activos. Es el manifest
    // AUTO-GENERADO por defecto porque sus rutas son las que realmente
    // están ancladas en scope "/" (dashboard + todo lo anidado bajo él,
    // más /login) — Mesa de Ayuda es la SEGUNDA app instalable de este
    // mismo proyecto, pero sus rutas están dispersas en varios prefijos
    // sueltos (/mesa-de-ayuda, /reportar-ticket, /mis-tickets, etc.), no
    // bajo un solo prefijo — así que NO puede tener su propio manifest
    // "por defecto" aquí.
    //
    // Bug real corregido (2026-07-23): antes Mesa de Ayuda vivía en este
    // VitePWA() y Sistema de Tickets era el manifest "extra" swapeado por
    // JS (usePwaIdentity.js) — pero el navegador solo evalúa qué app se
    // puede "instalar" con el HTML que recibió de PRIMERA MANO en la
    // navegación (no re-evalúa solo porque un script cambie el <link
    // rel="manifest"> después de montar React), así que cualquier carga
    // fresca (o el intento de instalar) siempre veía la identidad que
    // estuviera escrita en el HTML estático — Mesa de Ayuda, sin importar
    // en qué ruta estuvieras. La solución real: Vercel sirve un HTML
    // ESTÁTICO DISTINTO por prefijo de ruta (ver vercel.json +
    // scripts/generate-mesa-de-ayuda-shell.js, que genera
    // dist/mesa-de-ayuda.html a partir de dist/index.html con la
    // identidad de Mesa de Ayuda ya en el HTML desde el primer byte) —
    // usePwaIdentity.js se queda SOLO para mantener el favicon/manifest
    // correctos mientras se navega dentro de la SPA sin recargar, no para
    // resolver la instalabilidad (eso ya lo resuelve el HTML correcto por
    // ruta).
    VitePWA({
      // 'prompt' (antes 'autoUpdate') — pedido explícito del usuario: no
      // quería depender de adivinar Ctrl+Shift+R después de cada deploy.
      // Con 'autoUpdate' el service worker se actualiza y recarga la
      // pestaña por su cuenta, PERO solo cuando detecta la versión nueva —
      // y en la práctica eso tardaba en pasar (o nunca pasaba en una
      // pestaña que llevaba rato abierta), dejando la sensación de "no se
      // actualiza nunca". Con 'prompt' se usa el hook
      // `virtual:pwa-register/react` (ver components/UpdateToast.jsx,
      // montado en App.jsx) para mostrar un aviso "Hay una versión
      // nueva — Actualizar" y recargar solo cuando la persona le da clic,
      // en vez de depender de un reload silencioso que quizás no se nota.
      registerType: 'prompt',
      manifest: {
        name: 'Sistema de Tickets — Select Shop MB',
        short_name: 'Sistema de Tickets',
        description: 'Panel de Sistemas: tickets, ingresos, envíos, activos y solicitudes internas.',
        lang: 'es',
        start_url: '/login',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0a0b',
        theme_color: '#E8431A',
        icons: [
          { src: '/icons/icon-tickets-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-tickets-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-tickets-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo se precachea el shell de la app (JS/CSS/HTML/íconos) — las
        // llamadas a /api/** NUNCA deben servirse desde caché: son datos
        // en vivo (tickets, activos), no algo que tenga sentido dejar
        // "viejo" para que la app parezca offline-first.
        //
        // Bug real (2026-07-23, seguimiento al fix de instalabilidad de
        // arriba): con el service worker YA activo y controlando la
        // pestaña (clientsClaim: true), CUALQUIER navegación que no esté
        // en este denylist se sirve desde el `index.html` precacheado por
        // workbox — sin pasar nunca por la red, y por lo tanto sin pasar
        // nunca por las reescrituras de vercel.json que sirven
        // mesa-de-ayuda.html para estas rutas. Es decir: el HTML correcto
        // por ruta que arma Vercel (ver comentario de VitePWA arriba) solo
        // se ve en la PRIMERA carga, antes de que el service worker tome
        // control — after eso, todo vuelve a verse como Sistema de
        // Tickets (el índice que SÍ quedó precacheado), que es exactamente
        // el bug que reportó el usuario ("ya lo probé, y sigue igual").
        // Por eso las rutas de Mesa de Ayuda también van en el denylist:
        // así SIEMPRE van a la red (y por lo tanto a vercel.json), nunca
        // al índice cacheado del otro lado. Misma lista que
        // MESA_AYUDA_PATH_PREFIXES en usePwaIdentity.js y los rewrites de
        // vercel.json — las 3 deben coincidir.
        navigateFallbackDenylist: [
          /^\/api\//,
          /^\/mesa-de-ayuda/, /^\/reportar-ticket/, /^\/mis-tickets/, /^\/mis-solicitudes/,
          /^\/baja-personal/, /^\/manuales/, /^\/empleado/,
          /^\/solicitar-cuenta/, /^\/solicitar-recurso/, /^\/solicitar-ingreso/, /^\/confirmar-envio/,
        ],
        // `clientsClaim` (sin `skipWaiting`, ese sigue siendo manual vía
        // el botón "Actualizar" del UpdateToast) — con `registerType:
        // 'prompt'`, vite-plugin-pwa NO lo activa por default (solo lo
        // hace para 'autoUpdate'). Sin esto, cuando el nuevo service
        // worker termina de activarse tras el `skipWaiting` manual, el
        // navegador NUNCA dispara `controllerchange` en la pestaña ya
        // abierta (porque el nuevo SW no reclama las pestañas existentes)
        // — así que el listener que hace `window.location.reload()`
        // (dentro de vite-plugin-pwa, ver node_modules) jamás se
        // ejecutaba: el aviso aparecía, el clic mandaba el skip-waiting,
        // pero la página se quedaba congelada en la versión vieja para
        // siempre. Confirmado con una prueba real (Playwright + swap de
        // build en disco simulando un deploy) antes y después de este
        // cambio.
        clientsClaim: true,
      },
    }),
  ],
  server: {
    port: 3000,
    host: true,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
