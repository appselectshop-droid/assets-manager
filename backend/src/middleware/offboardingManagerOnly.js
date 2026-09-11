// Bajas RH — pedido explícito del usuario (2026-09-11): "los becarios no
// tienen la categoría de operación... los ingresos, las bajas, las
// solicitudes de recursos" — confirmó acceso completo, INCLUIDA la acción
// destructiva real (marcar empleado inactivo + liberar sus activos, ver
// PUT /:id/approve en routes/offboardingRequests.js) — antes esa acción
// era exclusivamente admin-only "sin cambios" por diseño; el usuario
// decidió explícitamente ampliarla a quien tenga este permiso también.
module.exports = (req, res, next) => {
  if (req.user?.role !== 'admin' && !req.user?.canManageOffboardingRequests) {
    return res.status(403).json({ message: 'No tienes permiso para gestionar Bajas' });
  }
  next();
};
