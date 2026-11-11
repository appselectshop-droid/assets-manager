import { useEffect } from 'react';

// Accesibilidad de ventanas emergentes para TODA la app (auditoría
// Impeccable, 2026-11-11). La app tiene ~85 modales escritos a mano en 18
// archivos, todos con el mismo patrón: un fondo `.overlay` (o
// `.menuBackdrop`) cuyo clic cierra, con el panel adentro. Ninguno cerraba
// con Esc, ninguno se anunciaba como diálogo y el foco de Tab se iba a la
// página de atrás. En vez de tocar los 85, un solo listener global (mismo
// criterio que useTabFillExamples) cubre todos:
//
//   Esc  → hace clic en el fondo del modal de hasta arriba. Solo cierra los
//          que YA cerraban con clic afuera; los que a propósito no cierran
//          así (formularios que no deben perderse) siguen sin cerrar.
//   Tab  → no sale del modal de hasta arriba (da la vuelta al final).
//   Al abrir: el panel se marca role="dialog" + aria-modal, toma el nombre
//          de su primer título y recibe el foco (el panel, no un campo —
//          así no se abre el teclado del celular). Al cerrar: el foco
//          regresa al botón que lo abrió.
const OVERLAY_SELECTOR = '[class*="_overlay"], [class*="_menuBackdrop"], [class*="_lightboxOverlay"]';
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]):not([type="hidden"]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

// Etiquetas de formulario: la app tiene ~520 <label> puestos JUNTO al campo
// (no envolviéndolo) y solo 3 con htmlFor — el lector de pantalla no sabía
// cómo se llama cada campo y el clic en la etiqueta no lo enfocaba. Se ligan
// solos: etiqueta sin htmlFor y sin campo adentro → el primer campo que le
// sigue dentro del mismo contenedor.
let labelSeq = 0;
function linkLabel(label) {
  if (label.htmlFor || label.querySelector('input, select, textarea')) return;
  let field = null;
  for (let sib = label.nextElementSibling; sib && !field; sib = sib.nextElementSibling) {
    if (sib.tagName === 'LABEL') break;
    field = sib.matches('input, select, textarea') ? sib : sib.querySelector('input, select, textarea');
  }
  if (!field || field.type === 'hidden') return;
  if (!field.id) field.id = `campo-${++labelSeq}`;
  label.htmlFor = field.id;
}

function isVisible(el) {
  return el.getClientRects().length > 0;
}

function topOverlay() {
  const all = [...document.querySelectorAll(OVERLAY_SELECTOR)].filter(isVisible);
  return all[all.length - 1] || null;
}

function enhance(overlay) {
  if (overlay.dataset.a11yDialog) return;
  overlay.dataset.a11yDialog = '1';
  const panel = overlay.firstElementChild || overlay;
  if (!panel.hasAttribute('role')) panel.setAttribute('role', 'dialog');
  panel.setAttribute('aria-modal', 'true');
  if (!panel.hasAttribute('aria-label') && !panel.hasAttribute('aria-labelledby')) {
    const heading = panel.querySelector('h1, h2, h3, h4');
    const label = heading?.textContent?.trim();
    if (label) panel.setAttribute('aria-label', label.slice(0, 120));
  }
  const opener = document.activeElement;
  overlay.__a11yOpener = opener && opener !== document.body ? opener : null;
  if (!overlay.contains(document.activeElement)) {
    if (!panel.hasAttribute('tabindex')) panel.setAttribute('tabindex', '-1');
    panel.focus({ preventScroll: true });
  }
}

function restore(node) {
  const overlays = node.matches?.(OVERLAY_SELECTOR) ? [node] : [...(node.querySelectorAll?.(OVERLAY_SELECTOR) || [])];
  for (const o of overlays) {
    const opener = o.__a11yOpener;
    if (opener && opener.isConnected && !topOverlay()) opener.focus({ preventScroll: true });
  }
}

export default function useDialogA11y() {
  useEffect(() => {
    function scan(node) {
      if (node.nodeType !== 1) return;
      if (node.matches(OVERLAY_SELECTOR)) enhance(node);
      node.querySelectorAll(OVERLAY_SELECTOR).forEach(enhance);
      if (node.tagName === 'LABEL') linkLabel(node);
      node.querySelectorAll('label').forEach(linkLabel);
      // Un campo que aparece después que su etiqueta (render condicional).
      if (node.matches('input, select, textarea')) {
        const label = node.parentElement?.querySelector(':scope > label:not([for])');
        if (label) linkLabel(label);
      }
    }

    const observer = new MutationObserver((mutations) => {
      for (const m of mutations) {
        m.addedNodes.forEach(scan);
        m.removedNodes.forEach((n) => n.nodeType === 1 && restore(n));
      }
    });
    observer.observe(document.body, { childList: true, subtree: true });
    document.querySelectorAll(OVERLAY_SELECTOR).forEach(enhance);
    document.querySelectorAll('label').forEach(linkLabel);

    function onKeyDown(e) {
      if (e.defaultPrevented) return;
      const overlay = topOverlay();
      if (!overlay) return;

      if (e.key === 'Escape') {
        e.preventDefault();
        // Clic sintético en el FONDO (target === overlay): dispara el mismo
        // onClick que ya cierra el modal al hacer clic afuera.
        overlay.click();
        return;
      }

      if (e.key === 'Tab') {
        const items = [...overlay.querySelectorAll(FOCUSABLE)].filter(isVisible);
        if (!items.length) { e.preventDefault(); return; }
        const first = items[0];
        const last = items[items.length - 1];
        const active = document.activeElement;
        if (!overlay.contains(active)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && (active === first || !items.includes(active) && active === overlay.firstElementChild)) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && active === last) { e.preventDefault(); first.focus(); }
      }
    }
    document.addEventListener('keydown', onKeyDown);
    return () => {
      observer.disconnect();
      document.removeEventListener('keydown', onKeyDown);
    };
  }, []);
}
