// Fórmula de contraseñas de cuentas de Microsoft 365 — pedido explícito del
// usuario (2026-09-10): "usamos el apellido paterno... con un alfabeto...
// y le agregamos _20242024. La primera siempre es mayúscula y no cuenta en
// el alfabeto." Ejemplo real que dio el usuario: "Arroyo" -> "Arr0y0_20242024".
//
// El abecedario es el que compartió el usuario (Abecedario 1.txt) — cada
// letra del apellido (excepto la primera) se sustituye por su equivalente
// aquí; la primera letra SIEMPRE queda como mayúscula literal, nunca se
// sustituye aunque el abecedario tenga una regla para ella (ej. A->4, pero
// "Arroyo" da "Arr0y0", no "4rr0y0").
const ALPHABET = {
  a: '4', b: 'b', c: 'c', d: 'd', e: '3', f: 'f', g: '6', h: 'h', i: 'i',
  j: 'j', k: 'k', l: '1', m: 'm', n: 'n', ñ: 'n', o: '0', p: 'p', q: 'q',
  r: 'r', s: '5', t: '7', u: 'u', v: 'v', w: 'w', x: 'x', y: 'y', z: '2',
};
const SUFFIX = '_20242024';

// Genera la contraseña de Microsoft 365 a partir del apellido paterno que
// capture quien da de alta/regenera la cuenta — el sistema NO lo adivina
// del nombre completo del empleado (Employee.name es un solo string, sin
// campo de apellido separado), así que siempre lo confirma quien da de alta.
function generateMicrosoftPassword(surname) {
  // Quita acentos/diéresis (Gómez -> Gomez) y cualquier cosa que no sea
  // letra (espacios, guiones en apellidos compuestos, etc.) antes de armar
  // la contraseña — una ñ normalizada así ya queda como "n" (mismo destino
  // que le da el abecedario de todos modos).
  const cleaned = (surname || '')
    .normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-zA-Zñ]/g, '');
  if (!cleaned) return null;

  const first = cleaned[0].toUpperCase();
  const rest = cleaned.slice(1).toLowerCase().split('')
    .map((ch) => ALPHABET[ch] ?? ch)
    .join('');
  return `${first}${rest}${SUFFIX}`;
}

module.exports = { generateMicrosoftPassword, ALPHABET, SUFFIX };
