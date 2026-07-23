import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    // Mesa de Ayuda como PWA — pedido explícito: que un empleado pueda
    // "instalarla" desde su celular (Android: botón nativo de Chrome;
    // iPhone: Compartir → Agregar a pantalla de inicio) sin pasar por App
    // Store/Play Store ni reescribir nada del código. `start_url` manda
    // directo al portal de empleado (no al login de Sistemas) porque a
    // quien le sirve esto es a quien reporta un ticket, no al panel admin.
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
        name: 'Mesa de Ayuda — Select Shop MB',
        short_name: 'Mesa de Ayuda',
        description: 'Reporta tickets de soporte y solicitudes de cuentas o recursos desde tu celular.',
        lang: 'es',
        start_url: '/mesa-de-ayuda',
        scope: '/',
        display: 'standalone',
        background_color: '#0a0a0b',
        theme_color: '#E8431A',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any' },
          { src: '/icons/icon-maskable-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // Solo se precachea el shell de la app (JS/CSS/HTML/íconos) — las
        // llamadas a /api/** NUNCA deben servirse desde caché: son datos
        // en vivo (tickets, activos), no algo que tenga sentido dejar
        // "viejo" para que la app parezca offline-first.
        navigateFallbackDenylist: [/^\/api\//],
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
