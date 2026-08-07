import { useRef, useState } from 'react';
import { useRegisterSW } from 'virtual:pwa-register/react';
import styles from './UpdateToast.module.css';

// Aviso de "hay una versión nueva" — pedido explícito del usuario: no
// quería tener que adivinar Ctrl+Shift+R después de cada deploy (el
// service worker de la PWA se queda sirviendo la versión vieja hasta que
// algo fuerza la actualización). Montado UNA sola vez, global, en
// App.jsx — a diferencia del Robot de Ayuda o el fondo animado, esto debe
// verse en TODA la app (panel de Sistemas incluido), no solo en el lado
// de empleado: es sobre la app en sí, no sobre una sección en particular.
//
// `registerType: 'prompt'` en vite.config.js es lo que hace que el
// service worker NO se actualice solo — se queda esperando hasta que
// `updateServiceWorker(true)` se llama de este lado, justo cuando la
// persona le da clic a "Actualizar". Antes era 'autoUpdate' (se
// actualizaba y recargaba solo), pero en la práctica eso tardaba en
// notarse o simplemente no pasaba en una pestaña que llevaba rato
// abierta — de ahí que se siguiera viendo contenido viejo sin avisar.
//
// Filtro por área (Sistema vs. Mesa de Ayuda) — pedido explícito del
// usuario (2026-07-30): "no le veo sentido que los usuarios actualicen si
// es en el sistema de tickets, al final cuando haya cambios en la mesa
// tendrán ya la versión nueva del sistema que nunca van a ver". Sistema y
// Mesa comparten el mismo bundle/Service Worker (confirmado: no hay forma
// de que el navegador distinga solo por sí mismo qué área cambió), así
// que el filtro es manual: `public/deploy-tags.json` trae un tag por área
// que se actualiza a mano en cada commit relevante (mismo criterio que el
// hash del CHANGELOG) — SOLO el/los tag(s) del área que de verdad se tocó.
// Aquí se compara el tag de tu área (según la URL actual) contra el que
// había cuando cargaste la página; si no cambió, no se muestra el aviso
// aunque el Service Worker sí tenga una versión nueva esperando. Si por
// cualquier motivo no se pudo leer el archivo (red, etc.), se falla hacia
// "sí avisar" — nunca hacia dejar a alguien en una versión vieja sin
// decirle.
async function fetchDeployTags() {
  try {
    const res = await fetch('/deploy-tags.json', { cache: 'no-store' });
    if (!res.ok) throw new Error('bad status');
    return await res.json();
  } catch {
    return null;
  }
}

function currentArea() {
  return window.location.pathname.startsWith('/mesa-de-ayuda') ? 'mesa' : 'sistema';
}

export default function UpdateToast() {
  const [areaChanged, setAreaChanged] = useState(false);
  // Pedido explícito del usuario (2026-08-07): "se atora" — el botón se
  // quedaba viéndose exactamente igual después del clic, sin ninguna señal
  // de que sí estaba haciendo algo mientras se resuelve la actualización
  // (hasta 4s con el salvavidas de abajo). Deshabilitado + "Actualizando..."
  // deja claro que el clic sí se registró.
  const [updating, setUpdating] = useState(false);
  const baselineTagsRef = useRef(null); // null = todavía no se leyó la línea base

  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;

      const checkAreaTag = async () => {
        const latest = await fetchDeployTags();
        if (!latest) { setAreaChanged(true); return; } // no se pudo leer: mejor avisar de más que de menos
        if (baselineTagsRef.current === null) { baselineTagsRef.current = latest; return; } // primera lectura = línea base
        if (latest[currentArea()] !== baselineTagsRef.current[currentArea()]) setAreaChanged(true);
      };

      // El navegador solo revisa si hay una versión nueva cuando navegas o
      // recargas — alguien que deja la pestaña abierta horas/días nunca lo
      // sabría. Bug real reportado: con SOLO el intervalo de 1h de abajo,
      // el aviso tardaba hasta una hora completa en aparecer, y si la
      // pestaña llevaba rato en segundo plano el navegador puede
      // pausar/retrasar `setInterval` (throttling de pestañas inactivas),
      // así que en la práctica casi nunca se veía sin refrescar a mano.
      // 3 disparadores en vez de uno solo:
      const check = () => { registration.update(); checkAreaTag(); };
      // 1) apenas se registra el service worker — cubre el caso más común:
      //    hubo un deploy MIENTRAS la persona no tenía la pestaña abierta,
      //    y la abre por primera vez después.
      check();
      // 2) cada que la pestaña vuelve a estar visible (cambiar de pestaña/
      //    app y regresar) — es el momento real en que alguien "está en la
      //    app" de nuevo, así que es cuando más importa que el chequeo sea
      //    inmediato, no depender de que el timer de abajo ya haya tocado.
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') check();
      });
      // 3) de respaldo, cada 15 min (antes 1h) por si la pestaña se queda
      //    abierta y visible mucho tiempo sin que la persona cambie de
      //    pestaña ni recargue.
      setInterval(check, 15 * 60 * 1000);
    },
  });

  // Salvavidas explícito: probé el ciclo completo con Playwright (build
  // viejo abierto en pestaña + build nuevo servido detrás, simulando un
  // deploy real) y confirmé que el reload automático que trae
  // vite-plugin-pwa por dentro (basado en su propio evento "controlling" +
  // una bandera `isUpdate` interna) NO se disparaba de forma confiable en
  // este flujo — así que se recarga a mano escuchando el evento real
  // `controllerchange` del navegador.
  //
  // A propósito el listener se arma SOLO dentro del clic (no desde que se
  // monta el componente): en las mismas pruebas confirmé que
  // `controllerchange` puede dispararse solo, antes de que la persona le
  // dé clic a nada, apenas se detecta una versión nueva en el servidor —
  // si el listener ya estuviera armado desde el montaje, eso recargaba la
  // página SOLA, sin que nadie pidiera nada (justo el comportamiento
  // "silencioso" tipo 'autoUpdate' que se quería evitar). Armándolo recién
  // en el clic, solo reacciona al cambio de control que YA SABEMOS que
  // nosotros mismos provocamos con `updateServiceWorker`.
  const handleUpdate = () => {
    setUpdating(true);
    let reloaded = false;
    const doReload = () => {
      if (reloaded) return;
      reloaded = true;
      window.location.reload();
    };

    navigator.serviceWorker?.addEventListener('controllerchange', doReload, { once: true });
    updateServiceWorker(true);

    // Salvavidas (2026-08-07) — reportado por el usuario: el botón a veces
    // "no hace nada". El reload de arriba depende de que el mensaje de
    // skip-waiting sí haya llegado al service worker en espera y de que
    // `controllerchange` sí se dispare — si por lo que sea eso no pasa
    // (referencia obsoleta dentro de workbox-window, otra pestaña que ya
    // forzó la actualización, etc.), nunca se dispara nada y la persona se
    // queda viendo el mismo aviso para siempre. Si no reaccionó en 4s, se
    // reintenta el skip-waiting directo contra el registration crudo del
    // navegador (sin pasar por el wrapper de workbox-window) y, pase lo
    // que pase, se recarga de todos modos — nunca debe quedarse atorado.
    setTimeout(async () => {
      if (reloaded) return;
      try {
        const reg = await navigator.serviceWorker?.getRegistration();
        reg?.waiting?.postMessage({ type: 'SKIP_WAITING' });
      } catch {
        // da igual, se recarga de todos modos
      }
      doReload();
    }, 4000);
  };

  if (!needRefresh || !areaChanged) return null;

  return (
    <div className={styles.toast} role="status">
      <span className={styles.dot} />
      <span className={styles.text}>Hay una versión nueva disponible.</span>
      <button type="button" className={styles.btn} onClick={handleUpdate} disabled={updating}>
        {updating ? 'Actualizando...' : 'Actualizar'}
      </button>
    </div>
  );
}
