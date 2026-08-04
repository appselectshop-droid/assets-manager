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

module.exports = { formatMx, MX_TIMEZONE };
