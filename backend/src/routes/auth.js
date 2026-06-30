const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { GMAIL_ROOT_EMAIL } = require('../config/permissions');

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

    // sistemas.2@selectshop.com.mx es la única cuenta que siempre puede gestionar
    // cuentas/contraseñas de Gmail, sin importar lo que diga la base de datos.
    if (user.email === GMAIL_ROOT_EMAIL && (user.role !== 'admin' || !user.canManageGmailAccounts)) {
      user.role = 'admin';
      user.canManageGmailAccounts = true;
      await user.save();
    }

    const token = jwt.sign(
      { id: user._id, name: user.name, email: user.email, role: user.role, canManageGmailAccounts: user.canManageGmailAccounts },
      process.env.JWT_SECRET,
      { expiresIn: '8h' }
    );
    res.json({ token, name: user.name, email: user.email, role: user.role, canManageGmailAccounts: user.canManageGmailAccounts });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
