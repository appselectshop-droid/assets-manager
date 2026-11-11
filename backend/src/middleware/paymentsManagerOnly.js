// Pagos Recurrentes (2026-11-11, pedido explícito del usuario: "que se cree
// un rol o una opción para darle ese permiso al usuario"). A propósito NO
// viene implícito con role:'admin' — mismo criterio que
// canViewManagerDashboard/canViewBecariosPanel: son montos, cuentas y
// referencias bancarias de pagos de la empresa, solo lo ve a quien se le
// otorgue explícitamente desde Usuarios.
module.exports = (req, res, next) => {
  if (!req.user?.canManagePayments) {
    return res.status(403).json({ message: 'No tienes permiso para Pagos Recurrentes' });
  }
  next();
};
