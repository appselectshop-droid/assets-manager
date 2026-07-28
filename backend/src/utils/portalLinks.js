// Links "de vuelta a la app" para notificaciones que salen de la app
// (Telegram, correo) — pedido explícito del usuario (2026-07-28): las
// solicitudes de Cuentas/Recursos/Ingresos/Bajas no traían ningún link
// clicable en su aviso de Telegram, solo texto plano ("Revisa en
// Solicitudes de Cuentas."). Mismo criterio que ya usa ticketAdminUrl() en
// routes/tickets.js: PrivateRoute/EmployeeRoute no redirigen solas al login
// si no hay sesión (muestran un NotFound genérico), así que un link
// compartido fuera de la app SIEMPRE debe apuntar directo al login con
// `?next=`, nunca a la ruta protegida en sí.
function adminUrl(path) {
  return `${process.env.FRONTEND_URL}/login?next=${encodeURIComponent(path)}`;
}

function employeeUrl(path) {
  return `${process.env.FRONTEND_URL}/mesa-de-ayuda/empleado/login?next=${encodeURIComponent(path)}`;
}

module.exports = { adminUrl, employeeUrl };
