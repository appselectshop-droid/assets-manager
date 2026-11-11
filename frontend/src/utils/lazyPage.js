import { lazy } from 'react';

// Carga diferida de páginas (auditoría Impeccable, 2026-11-11): antes las ~75
// páginas iban en un solo archivo de 1.96 MB que se bajaba completo al abrir
// la app. Ahora cada página se descarga la primera vez que se abre.
//
// Después de un deploy, una pestaña que se quedó abierta todavía apunta a los
// archivos viejos (nombres con hash que ya no existen) y el import falla. En
// ese caso se recarga la página UNA vez para tomar la versión nueva, en vez
// de dejar la pantalla en blanco.
const RELOAD_KEY = 'lazy-page-reloaded';

export default function lazyPage(loader) {
  return lazy(() => loader().then((mod) => {
    try { sessionStorage.removeItem(RELOAD_KEY); } catch { /* sin storage */ }
    return mod;
  }).catch((err) => {
    let already = false;
    try { already = sessionStorage.getItem(RELOAD_KEY) === '1'; sessionStorage.setItem(RELOAD_KEY, '1'); } catch { /* sin storage */ }
    if (!already) window.location.reload();
    throw err;
  }));
}
