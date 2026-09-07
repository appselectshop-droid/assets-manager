// Acceso al panel "Bitácora de becarios" — pedido explícito del usuario
// (2026-09-05). A propósito NO se deja pasar por role:'admin' (mismo
// criterio que canViewManagerDashboard): sistemas.3 pidió tener el acceso
// SOLO mientras lo prueba y luego quitárselo sin perder su rol de
// administrador, así que el gate depende únicamente de este permiso.
module.exports = (req, res, next) => {
  if (!req.user?.canViewBecariosPanel) {
    return res.status(403).json({ message: 'No tienes acceso al panel de Bitácora de becarios' });
  }
  next();
};
