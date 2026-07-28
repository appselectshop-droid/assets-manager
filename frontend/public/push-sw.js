// Inyectado dentro del service worker autogenerado por Workbox vía
// `workbox.importScripts` (ver vite.config.js) — NO se migró todo el service
// worker a `injectManifest` a propósito: esa config ya está muy afinada
// (2 identidades PWA instalables desde el mismo origen, ver comentarios de
// vite.config.js) y este archivo solo agrega listeners para tipos de evento
// que Workbox nunca escucha (`push`, `notificationclick`), sin tocar nada de
// su lógica de cacheo/navegación.
//
// Si se edita este archivo más adelante, hay que subir el "?v=" con el que
// se referencia en vite.config.js — los archivos de importScripts no entran
// al sistema de revisioning de Workbox, así que sin eso el navegador/CDN
// puede seguir sirviendo la versión vieja indefinidamente.
self.addEventListener('push', (event) => {
  let data = {};
  try { data = event.data ? event.data.json() : {}; } catch { /* payload no era JSON */ }

  event.waitUntil(
    self.registration.showNotification(data.title || 'Mesa de Ayuda', {
      body: data.body || '',
      icon: '/icons/mesa-ayuda-logo.png',
      badge: '/icons/mesa-ayuda-logo.png',
      data: { url: data.url || '/mesa-de-ayuda/mis-tickets' },
    })
  );
});

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const url = event.notification.data?.url || '/mesa-de-ayuda/mis-tickets';

  // Pedido explícito del usuario (2026-07-28): el push abría el navegador
  // en vez de la app instalada (PWA). La versión anterior reusaba la
  // PRIMERA ventana que encontrara en `clients.matchAll()` — pero Sistema
  // de Tickets y Mesa de Ayuda comparten el mismo scope "/" con
  // `clientsClaim: true`, así que CUALQUIER pestaña normal del navegador
  // abierta en el sitio (el dashboard, el login, lo que sea) ya cuenta como
  // "existente" y se llevaba el foco antes de siquiera intentar abrir la
  // PWA. `clients.openWindow(url)` deja que el propio navegador decida: si
  // la PWA instalada correspondiente ya está abierta, la enfoca él mismo
  // (comportamiento nativo de Chrome/Edge); si no, la abre — nunca le roba
  // el foco a una pestaña cualquiera del navegador.
  event.waitUntil(clients.openWindow(url));
});
