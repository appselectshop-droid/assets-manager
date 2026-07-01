module.exports = (req, res, next) => {
  if (!req.user?.canManagePlatformAccountsErp) {
    return res.status(403).json({ message: 'No tienes permiso para gestionar cuentas de plataformas ERP' });
  }
  next();
};
