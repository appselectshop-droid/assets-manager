// Envíos entre Sucursales (2026-09-22, pedido explícito del usuario tras
// "los becarios... siguen sin tener acceso a envíos") — mismo criterio que
// resourceRequestsManagerOnly/onboardingRequestsManagerOnly: acceso completo
// (ver/crear/gestionar) para quien tenga este permiso, sin depender de
// role==='admin'. Antes este módulo no tenía NINGÚN gate por rol/permiso en
// las rutas de abajo de `router.use(auth)` — cualquier usuario logueado ya
// podía llamarlas directo; el único bloqueo real vivía en el frontend
// (AdminRoute). Este middleware cierra ese hueco también del lado backend.
module.exports = (req, res, next) => {
  if (req.user?.role !== 'admin' && !req.user?.canManageShipments) {
    return res.status(403).json({ message: 'No tienes permiso para gestionar Envíos entre Sucursales' });
  }
  next();
};
