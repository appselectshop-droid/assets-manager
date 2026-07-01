module.exports = (req, res, next) => {
  if (!req.user?.canManagePlatformAccounts) {
    return res.status(403).json({ message: 'No tienes permiso para gestionar cuentas de otras plataformas' });
  }
  next();
};
