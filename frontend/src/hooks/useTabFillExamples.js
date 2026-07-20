import { useEffect } from 'react';

// Pedido explícito del usuario: en cualquier campo vacío de cualquier
// página, si su placeholder es un ejemplo ("Ej. Héctor Ramírez", "Ej. HP de
// Recepción, planta baja"...), Tab lo rellena con ese ejemplo en vez de que
// haya que escribirlo a mano. Un solo listener global (montado una vez en
// App.jsx) cubre TODA la app sin tocar cada formulario uno por uno.
//
// Solo dispara con placeholders que empiezan con "Ej."/"ej." — es la única
// señal confiable de "esto es un valor literal para aceptar", a diferencia
// de placeholders instructivos ("Escribe tu nombre...", "¿Por qué se
// necesita?", "Buscar por marca, modelo...") que NO tiene sentido meter tal
// cual en el campo.
//
// Con el campo ya vacío: 1er Tab rellena (y NO mueve el foco, a propósito,
// para poder ver/editar lo que se llenó); como el campo ya deja de estar
// vacío, el 2do Tab navega normal al siguiente campo — igual que aceptar un
// autocompletado.
const EXAMPLE_PATTERN = /^ej\.?\s+(.+)$/i;
const FILLABLE_INPUT_TYPES = new Set(['text', 'search', 'email', 'tel', 'url', 'number', '']);

function extractExample(placeholder) {
  const match = (placeholder || '').match(EXAMPLE_PATTERN);
  return match ? match[1].trim() : null;
}

// Los inputs de React son "controlados" — asignar `.value` directo no
// dispara su `onChange` ni actualiza el estado. Este es el truco estándar:
// usar el setter nativo del prototipo (no el que React sobreescribe) y
// luego despachar un evento 'input' de verdad, que React sí escucha.
function setNativeValue(el, value) {
  const proto = el.tagName === 'TEXTAREA' ? window.HTMLTextAreaElement.prototype : window.HTMLInputElement.prototype;
  const setter = Object.getOwnPropertyDescriptor(proto, 'value').set;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

export default function useTabFillExamples() {
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key !== 'Tab' || e.shiftKey) return;
      const el = document.activeElement;
      if (!el) return;
      const tag = el.tagName;
      if (tag !== 'INPUT' && tag !== 'TEXTAREA') return;
      if (tag === 'INPUT' && !FILLABLE_INPUT_TYPES.has(el.type)) return;
      if (el.readOnly || el.disabled) return;
      if (el.value) return; // ya tiene algo — Tab navega normal, sin tocarlo

      const example = extractExample(el.getAttribute('placeholder'));
      if (!example) return;

      e.preventDefault();
      setNativeValue(el, example);
    }

    // Captura (3er argumento `true`) para adelantarse a cualquier otro
    // manejador de teclado de la página antes de que decida qué hacer.
    document.addEventListener('keydown', handleKeyDown, true);
    return () => document.removeEventListener('keydown', handleKeyDown, true);
  }, []);
}
