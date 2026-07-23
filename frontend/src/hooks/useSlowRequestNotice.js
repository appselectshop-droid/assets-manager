import { useEffect, useState } from 'react';

// Aviso de "esto está tardando" para envíos que pueden esperar hasta el
// timeout completo de axios (90s, ver services/api.js/employeeApi.js —
// deliberadamente largo para el cold start de Render, no algo que se deba
// acortar). Sin este aviso, alguien viendo el botón fijo en "Enviando..."
// por más de unos segundos asume que la app se congeló — reportado
// 2026-07-24 ("le das a enviar solicitud... y se queda así"), síntoma del
// mismo wifi/ethernet inestable que ya se atendió una vez (ver commit
// 61a292d) pero que sigue sin dar ninguna señal de vida mientras espera.
export default function useSlowRequestNotice(active, delayMs = 6000) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    if (!active) { setShow(false); return undefined; }
    const t = setTimeout(() => setShow(true), delayMs);
    return () => clearTimeout(t);
  }, [active, delayMs]);
  return show;
}
