// Ingresos RH — pedido explícito del usuario (2026-09-11): "los becarios
// no tienen la categoría de operación... los ingresos, las bajas, las
// solicitudes de recursos" — confirmó acceso completo (ver/aprobar/
// gestionar, como un admin), no solo lectura. Mismo criterio que
// assignmentsManagerOnly: permiso propio (ver User.canManageOnboardingRequests),
// sin necesitar role:'admin'.
module.exports = (req, res, next) => {
  if (req.user?.role !== 'admin' && !req.user?.canManageOnboardingRequests) {
    return res.status(403).json({ message: 'No tienes permiso para gestionar Ingresos' });
  }
  next();
};
