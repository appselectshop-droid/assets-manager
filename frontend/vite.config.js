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
    // mismo proyecto (ver public/manifest-mesa-de-ayuda.webmanifest, con
    // scope "/mesa-de-ayuda").
    //
    // Historial de bugs reales al construir esto (2026-07-23), por si se
    // vuelve a tocar:
    // 1. Primer intento: Mesa de Ayuda vivía en este VitePWA() y Sistema
    //    de Tickets era el manifest "extra" swapeado por JS
    //    (usePwaIdentity.js) — pero el navegador solo evalúa qué app se
    //    puede instalar con el HTML que recibió de PRIMERA MANO en la
    //    navegación, no re-evalúa solo porque un script cambie el <link
    //    rel="manifest"> después de montar React. Fix: Vercel sirve un
    //    HTML ESTÁTICO DISTINTO por prefijo de ruta (ver vercel.json +
    //    scripts/generate-mesa-de-ayuda-shell.js).
    // 2. Con el HTML correcto por ruta, el service worker YA ACTIVO
    //    (clientsClaim: true) seguía sirviendo el índice cacheado para
    //    cualquier navegación no denylisteada — bypaseando las
    //    reescrituras de Vercel después de la primera carga. Fix: agregar
    //    las rutas de Mesa de Ayuda al navigateFallbackDenylist (ver
    //    workbox de abajo).
    // 3. AÚN CON 1 y 2 resueltos, Chrome/Edge seguían sin ofrecer instalar
    //    las 2 apps por separado: con AMBOS manifests declarando
    //    `scope: "/"` (el origen completo), el navegador considera que el
    //    origen entero ya "pertenece" a la app que ya esté instalada, y no
    //    ofrece una instalación nueva para un manifest distinto con el
    //    mismo scope. Fix real (2026-07-23): mover TODAS las rutas de Mesa
    //    de Ayuda bajo el prefijo real /mesa-de-ayuda/... (antes eran
    //    rutas sueltas: /reportar-ticket, /mis-tickets, etc. — ver
    //    App.jsx) y darle a su manifest un scope igual de angosto
    //    ("/mesa-de-ayuda", no "/") — un scope anidado y realmente
    //    distinto sí permite instalar ambas apps del mismo origen.
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
        // `id` explícito — sin esto, la identidad de una app instalada cae
        // por default a `start_url`, y no queremos depender de eso para
        // distinguir esta app de Mesa de Ayuda (manifest aparte, ver
        // public/manifest-mesa-de-ayuda.webmanifest).
        id: '/',
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
        // Un solo prefijo desde que todo Mesa de Ayuda vive bajo
        // /mesa-de-ayuda/... (mismo prefijo que usePwaIdentity.js,
        // EMPLOYEE_PATH_PREFIXES en App.jsx y los rewrites de vercel.json
        // — los 4 deben coincidir). Los links viejos sin este prefijo
        // (ver LegacyRedirect en App.jsx) no están aquí a propósito: por
        // un instante muestran la identidad de Sistema de Tickets antes de
        // redirigir — cosmético, no afecta la redirección en sí.
        navigateFallbackDenylist: [/^\/api\//, /^\/mesa-de-ayuda/],
        // Notificaciones push (ver public/push-sw.js) — se inyecta como
        // `importScripts()` dentro del sw.js autogenerado en vez de migrar a
        // `injectManifest`, para no tocar nada de la config de arriba que ya
        // costó varias rondas de bugs reales. El "?v=1" es a propósito: los
        // archivos de importScripts NO entran al sistema de revisioning de
        // Workbox — hay que subir este número cada vez que cambie el
        // contenido de push-sw.js, o el navegador/CDN puede seguir sirviendo
        // la versión vieja indefinidamente.
        importScripts: ['push-sw.js?v=1'],
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
