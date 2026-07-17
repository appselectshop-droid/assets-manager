const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { GMAIL_ROOT_EMAILS } = require('../config/permissions');

router.use(auth, adminOnly);

router.get('/', async (req, res) => {
  try {
    const users = await User.find().select('-password').sort({ createdAt: -1 });
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/', async (req, res) => {
  try {
    const {
      name, email, password, role, office,
      canManageGmailAccounts, canManagePlatformAccounts, canManagePlatformAccountsErp,
      canViewTelemetryAssets,
    } = req.body;
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Ese correo ya está registrado' });
    const hashed = await bcrypt.hash(password, 10);
    const userData = { name, email, password: hashed, role, office: office || '' };
    if (canManageGmailAccounts !== undefined || canManagePlatformAccounts !== undefined || canManagePlatformAccountsErp !== undefined || canViewTelemetryAssets !== undefined) {
      if (!GMAIL_ROOT_EMAILS.includes(req.user.email)) {
        return res.status(403).json({ message: 'Solo un superadministrador puede otorgar estos permisos' });
      }
      if (canManageGmailAccounts !== undefined) userData.canManageGmailAccounts = canManageGmailAccounts;
      if (canManagePlatformAccounts !== undefined) userData.canManagePlatformAccounts = canManagePlatformAccounts;
      if (canManagePlatformAccountsErp !== undefined) userData.canManagePlatformAccountsErp = canManagePlatformAccountsErp;
      if (canViewTelemetryAssets !== undefined) userData.canViewTelemetryAssets = canViewTelemetryAssets;
    }
    const user = await User.create(userData);
    const { password: _, ...data } = user.toObject();
    res.status(201).json(data);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.put('/:id', async (req, res) => {
  try {
    const {
      name, email, role, password, office,
      canManageGmailAccounts, canManagePlatformAccounts, canManagePlatformAccountsErp,
      canViewTelemetryAssets,
    } = req.body;
    const update = { name, email, role };
    if (office !== undefined) update.office = office;
    if (password) {
      if (password.length < 6)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
      update.password = await bcrypt.hash(password, 10);
    }
    if (canManageGmailAccounts !== undefined || canManagePlatformAccounts !== undefined || canManagePlatformAccountsErp !== undefined || canViewTelemetryAssets !== undefined) {
      if (!GMAIL_ROOT_EMAILS.includes(req.user.email)) {
        return res.status(403).json({ message: 'Solo un superadministrador puede otorgar o revocar estos permisos' });
      }
      if (canManageGmailAccounts !== undefined) update.canManageGmailAccounts = canManageGmailAccounts;
      if (canManagePlatformAccounts !== undefined) update.canManagePlatformAccounts = canManagePlatformAccounts;
      if (canManagePlatformAccountsErp !== undefined) update.canManagePlatformAccountsErp = canManagePlatformAccountsErp;
      if (canViewTelemetryAssets !== undefined) update.canViewTelemetryAssets = canViewTelemetryAssets;
    }
    const user = await User.findByIdAndUpdate(req.params.id, update, { new: true }).select('-password');
    if (!user) return res.status(404).json({ message: 'Usuario no encontrado' });
    res.json(user);
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.delete('/:id', async (req, res) => {
  try {
    if (req.params.id === req.user.id)
      return res.status(400).json({ message: 'No puedes eliminarte a ti mismo' });
    await User.findByIdAndDelete(req.params.id);
    res.json({ message: 'Usuario eliminado' });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
