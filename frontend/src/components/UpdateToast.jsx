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
export default function UpdateToast() {
  const {
    needRefresh: [needRefresh],
    updateServiceWorker,
  } = useRegisterSW({
    onRegisteredSW(_url, registration) {
      if (!registration) return;
      // El navegador solo revisa si hay una versión nueva cuando navegas o
      // recargas — alguien que deja la pestaña abierta horas/días nunca lo
      // sabría. Este chequeo cada hora es lo que hace que el aviso
      // aparezca solo, sin depender de que la persona recargue por su
      // cuenta primero (lo cual sería justo el problema que se quiere
      // evitar).
      setInterval(() => { registration.update(); }, 60 * 60 * 1000);
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
    navigator.serviceWorker?.addEventListener(
      'controllerchange',
      () => window.location.reload(),
      { once: true },
    );
    updateServiceWorker(true);
  };

  if (!needRefresh) return null;

  return (
    <div className={styles.toast} role="status">
      <span className={styles.dot} />
      <span className={styles.text}>Hay una versión nueva disponible.</span>
      <button type="button" className={styles.btn} onClick={handleUpdate}>
        Actualizar
      </button>
    </div>
  );
}
