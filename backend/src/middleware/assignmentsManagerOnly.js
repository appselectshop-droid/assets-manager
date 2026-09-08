// Devolver/desasignar y vincular pares de asignaciones — pedido explícito
// del usuario (2026-09-08): permiso propio para becarios de confianza, sin
// necesitar ser Administrador completo (ver User.canManageAssignments).
module.exports = (req, res, next) => {
  if (req.user?.role !== 'admin' && !req.user?.canManageAssignments) {
    return res.status(403).json({ message: 'No tienes permiso para devolver o vincular asignaciones' });
  }
  next();
};
