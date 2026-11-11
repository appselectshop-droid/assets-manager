const router = require('express').Router();
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const { GMAIL_ROOT_EMAILS } = require('../config/permissions');

router.use(auth, adminOnly);

// Permisos granulares que solo un superadministrador (GMAIL_ROOT_EMAILS)
// puede otorgar/revocar. Una sola lista (2026-11-11): antes cada permiso se
// repetía a mano en POST y PUT, y a canManageShipments/canDeleteAssets se
// les olvidó agregarlos aquí — la casilla en Usuarios se marcaba pero el
// backend la ignoraba en silencio.
const PERMISSION_FLAGS = [
  'canManageGmailAccounts', 'canManagePlatformAccounts', 'canManagePlatformAccountsErp',
  'canViewTelemetryAssets', 'canViewManagerDashboard', 'canManageBiRequests', 'canViewBiTeamDashboard',
  'canManageTickets', 'canViewBecariosPanel', 'canManageAssignments',
  'canManageOnboardingRequests', 'canManageOffboardingRequests', 'canManageResourceRequests',
  'canManageShipments', 'canDeleteAssets', 'canManagePayments',
];
function pickPermissions(body) {
  const out = {};
  for (const f of PERMISSION_FLAGS) if (body[f] !== undefined) out[f] = !!body[f];
  return out;
}

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
    const { name, email, password, role, office } = req.body;
    const permissions = pickPermissions(req.body);
    if (!password || password.length < 6)
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
    const existing = await User.findOne({ email });
    if (existing) return res.status(400).json({ message: 'Ese correo ya está registrado' });
    const hashed = await bcrypt.hash(password, 10);
    const userData = { name, email, password: hashed, role, office: office || '' };
    if (Object.keys(permissions).length) {
      if (!GMAIL_ROOT_EMAILS.includes(req.user.email)) {
        return res.status(403).json({ message: 'Solo un superadministrador puede otorgar estos permisos' });
      }
      Object.assign(userData, permissions);
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
    const { name, email, role, password, office } = req.body;
    const permissions = pickPermissions(req.body);
    const update = { name, email, role };
    if (office !== undefined) update.office = office;
    if (password) {
      if (password.length < 6)
        return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres' });
      update.password = await bcrypt.hash(password, 10);
    }
    if (Object.keys(permissions).length) {
      if (!GMAIL_ROOT_EMAILS.includes(req.user.email)) {
        return res.status(403).json({ message: 'Solo un superadministrador puede otorgar o revocar estos permisos' });
      }
      Object.assign(update, permissions);
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
