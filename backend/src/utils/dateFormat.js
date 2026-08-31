// Formateo de fechas para todo lo que genera el backend (correos, PDFs) —
// el servidor (EC2) corre en UTC, así que cualquier toLocaleString/
// toLocaleDateString/toLocaleTimeString sin `timeZone` explícito muestra la
// hora de UTC, no la de México — bug real reportado por el usuario
// (2026-08-04): el correo de "Nuevo ticket" mostraba una hora que no
// coincidía con la hora real en la que se reportó. Un solo punto para
// fijar siempre `America/Mexico_City`, reusado en emailTemplates.js,
// shipmentPdf.js, accountRequestPdf.js y los PDFs de cuentas/responsiva.
const MX_TIMEZONE = 'America/Mexico_City';

function formatMx(date, opts = {}) {
  if (!date) return '';
  return new Date(date).toLocaleString('es-MX', { ...opts, timeZone: MX_TIMEZONE });
}

// Inverso de formatMx — convierte un string "naive" tipo
// "YYYY-MM-DDTHH:mm" (lo que manda un <input type="datetime-local">, sin
// zona horaria) al instante UTC real, ASUMIENDO que esos dígitos son hora
// de México (UTC-6 fijo, sin horario de verano — mismo criterio ya
// establecido en calendarActivities.js para BUG-01/BUG-02 de la matriz de
// pruebas de Felipe, 2026-08-19).
//
// Por qué hace falta: `new Date("2026-08-25T14:30")` sin sufijo "Z" se
// interpreta como hora LOCAL DEL PROCESO — como el EC2 corre en UTC, eso
// guarda 14:30 como si fuera UTC, que en realidad son las 08:30 en México
// (desfase de -6h). Bug real: BUG-07 de la matriz de pruebas de Felipe
// (2026-08-20), en "Tiempos Comprometidos" de tickets ERP.
function parseMx(dateTimeLocalStr) {
  if (!dateTimeLocalStr) return null;
  const naive = new Date(dateTimeLocalStr); // dígitos tal cual, tratados como UTC por el proceso
  if (isNaN(naive.getTime())) return naive; // NaN se propaga — el caller ya valida con isNaN
  return new Date(naive.getTime() + 6 * 60 * 60 * 1000);
}

module.exports = { formatMx, parseMx, MX_TIMEZONE };
