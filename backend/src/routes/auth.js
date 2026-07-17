const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { GMAIL_ROOT_EMAILS } = require('../config/permissions');

router.post('/register', async (req, res) => {
  try {
    const { name, email, password, role } = req.body;
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Email ya registrado' });
    const hashed = await bcrypt.hash(password, 10);
    const user = await User.create({ name, email, password: hashed, role });
    res.status(201).json({ message: 'Usuario creado', id: user._id });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const user = await User.findOne({ email });
    if (!user) return res.status(400).json({ message: 'Credenciales incorrectas' });
    const valid = await bcrypt.compare(password, user.password);
    if (!valid) return res.status(400).json({ message: 'Credenciales incorrectas' });

    // Las cuentas "superadministrador" (GMAIL_ROOT_EMAILS) siempre pueden
    // gestionar cuentas/contraseñas de Gmail y de otras plataformas (incluida
    // ERP), sin importar lo que diga la base de datos.
    if (GMAIL_ROOT_EMAILS.includes(user.email) && (
      user.role !== 'admin' || !user.canManageGmailAccounts ||
      !user.canManagePlatformAccounts || !user.canManagePlatformAccountsErp
    )) {
      user.role = 'admin';
      user.canManageGmailAccounts = true;
      user.canManagePlatformAccounts = true;
      user.canManagePlatformAccountsErp = true;
      await user.save();
    }

    const token = jwt.sign(
      {
        id: user._id, name: user.name, email: user.email, role: user.role,
        canManageGmailAccounts: user.canManageGmailAccounts,
        canManagePlatformAccounts: user.canManagePlatformAccounts,
        canManagePlatformAccountsErp: user.canManagePlatformAccountsErp,
        canViewTelemetryAssets: user.canViewTelemetryAssets,
      },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({
      token, id: user._id, name: user.name, email: user.email, role: user.role,
      canManageGmailAccounts: user.canManageGmailAccounts,
      canManagePlatformAccounts: user.canManagePlatformAccounts,
      canManagePlatformAccountsErp: user.canManagePlatformAccountsErp,
      canViewTelemetryAssets: user.canViewTelemetryAssets,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
