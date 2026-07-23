import { useEffect, useRef, useState } from 'react';

// Autocompletar por nombre contra Empleados (búsqueda pública) — usado en
// TODAS las páginas públicas de Mesa de Ayuda que piden el nombre de quien
// solicita (Solicitar Cuenta/Recurso/Ingreso, Baja de Personal, Confirmar
// Envío). Antes cada archivo tenía su propia copia de este mismo patrón,
// con el mismo bug real reportado (2026-07-24, wifi/ethernet inestable en
// la oficina): si la búsqueda fallaba por red (no porque el empleado de
// verdad no exista), el catch silencioso dejaba `matches` vacío igual que
// un "no encontrado" real — quien llenaba el formulario no tenía forma de
// saber que fue un problema de conexión, ni de reintentar; desde su punto
// de vista "ya no dejaba seleccionar" el nombre. Este hook centraliza el
// patrón UNA sola vez y distingue `status: 'error'` de `'done'` (sin
// resultados de verdad), con un `retry()` explícito para el botón de
// "Reintentar" que cada página debe mostrar cuando `status === 'error'`.
export default function useEmployeeLookup(api, query, { minLength = 3, debounceMs = 350 } = {}) {
  const [matches, setMatches] = useState([]);
  const [status, setStatus] = useState('idle'); // idle | searching | done | error
  const [retryTick, setRetryTick] = useState(0);
  const debounceRef = useRef(null);

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (query.trim().length < minLength) {
      setMatches([]);
      setStatus('idle');
      return undefined;
    }
    setStatus('searching');
    debounceRef.current = setTimeout(async () => {
      try {
        const { data } = await api.get('/employees/public-lookup', { params: { q: query } });
        setMatches(data);
        setStatus('done');
      } catch (_) {
        setMatches([]);
        setStatus('error');
      }
    }, debounceMs);
    return () => clearTimeout(debounceRef.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, minLength, debounceMs, retryTick]);

  const retry = () => setRetryTick((t) => t + 1);

  return { matches, status, retry };
}
