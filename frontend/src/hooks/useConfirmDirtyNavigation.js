import { useEffect, useRef } from 'react';

// Pedido explícito del usuario: si seleccionas algo del menú (izquierda)
// mientras hay un panel de editar abierto con cambios sin guardar, hoy se
// cierra solo y se pierde todo sin avisar. Esto agrega una confirmación
// antes de navegar — sin tener que tocar cada modal de cada página una por
// una: los ~20 modales de edición del panel admin ya usan las mismas clases
// `overlay`/`modal` (ver Employees.jsx, Assets.jsx, InternalApps.jsx, etc.),
// así que un solo detector genérico por esas clases cubre a todos.
//
// "¿Tiene cambios sin guardar?" — intento fallido primero: comparar
// `field.value` contra la propiedad nativa `defaultValue`. NO funciona con
// inputs controlados de React: React resincroniza `defaultValue` para que
// coincida con el `value` actual en CADA re-render (para que un
// "reset"/autofill del navegador restaure al último valor, no al original)
// — así que en cuanto la persona teclea una letra, `defaultValue` ya
// "sigue" al nuevo valor y la comparación deja de servir.
//
// Por eso esto captura su PROPIA foto del valor real de cada campo, en el
// instante exacto en que aparece en el DOM (vía MutationObserver, antes de
// que a nadie le dé tiempo de tocarlo) — usando un WeakMap, no un atributo
// del navegador que React pueda pisar.
const fieldBaseline = new WeakMap();

function isTrackableField(el) {
  return el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.tagName === 'SELECT';
}

function captureBaseline(field) {
  if (fieldBaseline.has(field)) return;
  const value = (field.type === 'checkbox' || field.type === 'radio') ? field.checked : field.value;
  fieldBaseline.set(field, value);
}

function isFieldDirty(field) {
  if (field.disabled) return false;
  if (!fieldBaseline.has(field)) captureBaseline(field); // por si se coló uno sin observar
  const baseline = fieldBaseline.get(field);
  const current = (field.type === 'checkbox' || field.type === 'radio') ? field.checked : field.value;
  return current !== baseline;
}

function hasDirtyModalOpen() {
  const modals = document.querySelectorAll('[class*="overlay" i], [class*="modal" i]');
  for (const modal of modals) {
    const fields = modal.querySelectorAll('input, textarea, select');
    for (const field of fields) {
      if (isFieldDirty(field)) return true;
    }
  }
  return false;
}

// La navegación en esta app pasa por 2 mecanismos distintos según la
// página: <NavLink>/<Link> (portal de empleado, PortalLayout.jsx) y botones
// con onClick={() => navigate(...)} (panel admin, Layout.jsx). En vez de
// tratar de detectar el destino de cada uno (imposible de forma genérica
// para el segundo caso, un <button> no expone a dónde navega), se bloquea
// el click en la fase de captura, se pregunta, y si dice que sí se vuelve a
// disparar el MISMO click — así el manejador original (sea cual sea)
// termina ejecutándose normal, sin tener que saber qué hace.
export default function useConfirmDirtyNavigation() {
  const bypassRef = useRef(false);

  // Capturar la foto inicial de cada campo apenas nace en el DOM — así el
  // "¿está sucio?" de más arriba tiene contra qué comparar desde antes de
  // que a alguien le dé tiempo de tocarlo.
  useEffect(() => {
    // Por si ya hay modales abiertos cuando esto se monta (recarga en
    // caliente, etc.) — no debería pasar en producción, pero no cuesta nada.
    document.querySelectorAll('input, textarea, select').forEach(captureBaseline);

    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (isTrackableField(node)) captureBaseline(node);
          node.querySelectorAll?.('input, textarea, select').forEach(captureBaseline);
        }
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    function handleClick(e) {
      if (bypassRef.current) return; // este es el click re-disparado tras confirmar — dejarlo pasar
      if (e.button !== 0) return; // solo click izquierdo — clic derecho/central no navegan
      const target = e.target;
      // OJO: el fondo oscuro (`.overlay`, cubre TODA la pantalla — inset:0)
      // es justo la causa real del bug reportado. Su propio onClick ya
      // cierra el modal sin avisar (`setShowModal(false)`), y como cubre
      // toda la pantalla, un clic "hacia la izquierda" (donde visualmente
      // parece que le diste al menú) en realidad cae sobre este fondo, no
      // sobre el menú de verdad. Por eso solo se exceptúa el contenido
      // INTERNO del modal (`.modal` — sus campos, Guardar, Cancelar, la X);
      // el fondo (`.overlay`) SÍ se intercepta, junto con cualquier otra
      // navegación externa que de verdad llegue a tocar el menú.
      if (target.closest('[class*="modal" i]')) return;
      if (!hasDirtyModalOpen()) return;

      e.preventDefault();
      e.stopPropagation();
      const proceed = window.confirm('Tienes cambios sin guardar en el panel abierto — se van a perder. ¿Quieres salir de todos modos?');
      if (!proceed) return;

      bypassRef.current = true;
      target.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, view: window }));
      bypassRef.current = false;
    }

    // Captura (3er argumento `true`): se adelanta al manejador real (el
    // onClick de React, delegado en la raíz de la app) para poder decidir
    // si lo deja pasar antes de que navegue.
    document.addEventListener('click', handleClick, true);
    return () => document.removeEventListener('click', handleClick, true);
  }, []);

  // Recargar la pestaña/cerrarla no dispara clics — esto cubre ese caso
  // aparte, con el aviso nativo del navegador (no se puede personalizar el
  // texto, es una restricción de los navegadores modernos).
  useEffect(() => {
    function handleBeforeUnload(e) {
      if (!hasDirtyModalOpen()) return;
      e.preventDefault();
      e.returnValue = '';
    }
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
}
