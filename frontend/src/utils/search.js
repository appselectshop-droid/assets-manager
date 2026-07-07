// Búsqueda tipo "AND de palabras": cada palabra del texto buscado puede
// venir de un campo distinto (ej. "Motorola" del modelo y "5548605399" del
// número de línea), a diferencia de comparar la cadena completa contra un
// solo campo a la vez.
export function matchesSearch(query, ...fields) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const haystack = fields
    .flat()
    .filter((v) => v !== null && v !== undefined && v !== '')
    .join(' ')
    .toLowerCase();
  return q.split(/\s+/).every((term) => haystack.includes(term));
}

// Junta todos los valores de un objeto `specs` (o cualquier objeto plano)
// en un arreglo de strings, para incluirlos en la búsqueda sin tener que
// listar cada campo a mano.
export function specsValues(specs) {
  if (!specs) return [];
  return Object.values(specs).filter((v) => typeof v === 'string' || typeof v === 'number');
}
