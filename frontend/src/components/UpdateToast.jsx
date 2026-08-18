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
// service worker NO se actualice solo — se queda esperando hasta que la
// persona le da clic a "Actualizar" (ver handleUpdate: desde 2026-08-18
// eso desregistra el service worker y borra el Cache Storage a mano, no
// depende del ciclo normal de actualización de workbox). Antes era
// 'autoUpdate' (se actualizaba y recargaba solo), pero en la práctica eso
// tardaba en notarse o simplemente no pasaba en una pestaña que llevaba
// rato abierta — de ahí que se siguiera viendo contenido viejo sin avisar.
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
  // de que sí estaba haciendo algo mientras se resuelve la actualización.
  // Deshabilitado + "Actualizando..." deja claro que el clic sí se registró.
  const [updating, setUpdating] = useState(false);
  const baselineTagsRef = useRef(null); // null = todavía no se leyó la línea base

  // Ya NO se usa `needRefresh` del hook para decidir si mostrar el aviso
  // (2026-08-18, ver por qué en handleUpdate) — el hook solo se usa para
  // que exista un service worker registrado del que partir. `areaChanged`
  // (comparación directa de deploy-tags.json) es la única fuente de verdad
  // de "hay una versión nueva para TU área" — más simple y sin depender de
  // que workbox haya terminado de detectar la actualización en el momento
  // exacto en que se pinta este componente.
  useRegisterSW({
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
      const check = () => { registration.update().catch(() => {}); checkAreaTag(); };
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
      // 3) de respaldo, cada 15 min por si la pestaña se queda abierta y
      //    visible mucho tiempo sin que la persona cambie de pestaña ni
      //    recargue.
      setInterval(check, 15 * 60 * 1000);
    },
  });

  // Reescrito (2026-08-18) — bug real reportado por el usuario: le dio clic
  // a "Actualizar" (el aviso sí apareció) y el contenido en pantalla se
  // quedó exactamente igual de viejo; solo abrir el sitio en una ventana de
  // incógnito mostraba lo nuevo. Diagnóstico: la versión anterior dependía
  // de un baile de eventos del service worker (SKIP_WAITING → esperar
  // `controllerchange` → si no llega en 4s, reintentar) que en la práctica
  // puede quedarse a medias en más de un estado intermedio (worker viejo
  // que nunca suelta el control, mensaje que no llega, etc.) — cada
  // reintento anterior (2026-07-23, 2026-08-07) tapó un síntoma pero no la
  // causa de fondo: mientras siga existiendo CUALQUIER service worker o
  // Cache Storage viejo, no hay garantía de que la próxima carga sea
  // realmente nueva.
  //
  // Ahora se hace lo mismo que "por accidente" sí funcionaba en incógnito:
  // se quita el control de raíz. Se desregistran TODOS los service workers
  // de este origen y se borra TODO el Cache Storage antes de recargar — la
  // siguiente carga no tiene absolutamente nada viejo de qué partir, es
  // indistinguible de la primera visita jamás hecha desde ese navegador.
  // Un poco más lento que un reload normal (unregister + borrar cachés sí
  // toma un instante), pero determinístico: nunca se puede quedar "a
  // medias" como antes.
  const handleUpdate = () => {
    setUpdating(true);
    (async () => {
      try {
        const regs = await navigator.serviceWorker?.getRegistrations();
        await Promise.all((regs || []).map((r) => r.unregister()));
      } catch {
        // da igual, se recarga de todos modos
      }
      try {
        const keys = await caches?.keys();
        await Promise.all((keys || []).map((k) => caches.delete(k)));
      } catch {
        // da igual, se recarga de todos modos
      }
      window.location.reload();
    })();
  };

  if (!areaChanged) return null;

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
