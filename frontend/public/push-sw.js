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

  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      // Ya hay una pestaña de la app abierta (Sistema de Tickets y Mesa de
      // Ayuda comparten el mismo service worker/scope "/") — se reusa en vez
      // de apilar una ventana nueva cada vez que se toca una notificación.
      const existing = all[0];
      if (existing) {
        existing.navigate(url);
        return existing.focus();
      }
      return clients.openWindow(url);
    })
  );
});
