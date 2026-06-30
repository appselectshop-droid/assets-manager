module.exports = (req, res, next) => {
  if (!req.user?.canManageGmailAccounts) {
    return res.status(403).json({ message: 'No tienes permiso para gestionar cuentas y contraseñas de Gmail' });
  }
  next();
};
