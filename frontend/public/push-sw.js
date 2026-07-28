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
  // Sistema de Tickets y Mesa de Ayuda comparten el mismo scope "/" —
  // se necesita saber a cuál de las 2 apps pertenece esta notificación
  // para no reusar/enfocar la ventana de la app equivocada.
  const isMesaDeAyuda = new URL(url, self.location.origin).pathname.startsWith('/mesa-de-ayuda');

  // Pedido explícito del usuario (2026-07-28), en 2 rondas:
  // 1) Antes: se reusaba la PRIMERA ventana de `clients.matchAll()` sin
  //    importar cuál — con `clientsClaim: true` eso significaba que
  //    cualquier pestaña normal del navegador abierta en el sitio (el
  //    dashboard, el login, lo que fuera) se llevaba el foco antes de
  //    intentar abrir la PWA. Se quitó esa reutilización → `clients.
  //    openWindow(url)` directo.
  // 2) Pero `clients.openWindow()` SIEMPRE abre una ventana nueva, nunca
  //    reusa la ya abierta — "ya abre la PWA, pero abre una nueva, no la
  //    que ya tenía abierta". Se vuelve a reusar una ventana existente,
  //    esta vez filtrando que sea de la MISMA app que la notificación
  //    (Mesa de Ayuda vs Sistema de Tickets) — así sí se enfoca la PWA que
  //    ya estaba abierta, sin volver a robarle el foco a la app/pestaña
  //    equivocada.
  event.waitUntil(
    clients.matchAll({ type: 'window', includeUncontrolled: true }).then((all) => {
      const sameApp = all.find((c) => {
        const path = new URL(c.url).pathname;
        return isMesaDeAyuda ? path.startsWith('/mesa-de-ayuda') : !path.startsWith('/mesa-de-ayuda');
      });
      if (sameApp) {
        return sameApp.navigate(url).then((navigated) => (navigated || sameApp).focus());
      }
      return clients.openWindow(url);
    })
  );
});
