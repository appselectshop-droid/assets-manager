// Puede ver el archivo de Responsivas cualquier admin (ve todo) o cualquier
// usuario con permiso sobre alguno de los gestores de cuentas (solo verá las
// suyas — el filtrado por dueño se hace en la ruta, no aquí).
module.exports = (req, res, next) => {
  const u = req.user || {};
  const allowed = u.role === 'admin'
    || u.canManageGmailAccounts
    || u.canManagePlatformAccounts
    || u.canManagePlatformAccountsErp;
  if (!allowed) {
    return res.status(403).json({ message: 'No tienes permiso para ver las responsivas generadas' });
  }
  next();
};
