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
      registerType: 'autoUpdate',
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
