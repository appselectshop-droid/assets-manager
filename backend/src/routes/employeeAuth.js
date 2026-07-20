const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Employee = require('../models/Employee');

// Límite simple por IP — mismo criterio que las demás rutas públicas
// (Solicitudes, Tickets), para no dejar el login/activación abierto a fuerza
// bruta sin fricción.
const RATE_LIMIT_WINDOW_MS = 15 * 60 * 1000;
const RATE_LIMIT_MAX = 15;
const rateLimitHits = new Map();
function isRateLimited(ip) {
  const now = Date.now();
  const hits = (rateLimitHits.get(ip) || []).filter((t) => now - t < RATE_LIMIT_WINDOW_MS);
  hits.push(now);
  rateLimitHits.set(ip, hits);
  return hits.length > RATE_LIMIT_MAX;
}

// No todos los empleados tienen correo corporativo capturado (ver
// CHANGELOG — ~166 de 256 en su momento), pero todos sí tienen no. de
// empleado — por eso se acepta cualquiera de los dos como "usuario". Se
// carga solo la lista con correo (no todos) para comparar sin distinguir
// mayúsculas, ya que Mongo no compara arreglos de strings así de forma nativa.
async function findByUsername(username) {
  const trimmed = (username || '').trim();
  if (!trimmed) return null;
  const byId = await Employee.findOne({ active: true, employeeId: trimmed });
  if (byId) return byId;
  const lower = trimmed.toLowerCase();
  const withEmail = await Employee.find({ active: true, corporateEmails: { $exists: true, $ne: [] } });
  return withEmail.find((e) => e.corporateEmails.some((em) => em.toLowerCase() === lower)) || null;
}

function signToken(emp) {
  return jwt.sign(
    {
      employeeRef: emp._id, name: emp.name, type: 'employee',
      canManageOnboarding: !!emp.canManageOnboarding,
      canRequestOffboarding: !!emp.canRequestOffboarding,
      canManageOffboarding: !!emp.canManageOffboarding,
    },
    process.env.JWT_SECRET,
    { expiresIn: '30d' } // portal de baja fricción — no la sesión administrativa
  );
}

router.post('/lookup', async (req, res) => {
  if (isRateLimited(req.ip)) return res.status(429).json({ message: 'Demasiados intentos, espera un momento.' });
  try {
    const emp = await findByUsername(req.body.username);
    if (!emp) return res.status(404).json({ message: 'No encontramos ninguna cuenta con ese correo o número de empleado.' });
    res.json({ name: emp.name, hasPassword: !!emp.password });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/activate', async (req, res) => {
  if (isRateLimited(req.ip)) return res.status(429).json({ message: 'Demasiados intentos, espera un momento.' });
  try {
    const { username, password } = req.body;
    if (!password || password.length < 6) {
      return res.status(400).json({ message: 'La contraseña debe tener al menos 6 caracteres.' });
    }
    const emp = await findByUsername(username);
    if (!emp) return res.status(404).json({ message: 'No encontramos ninguna cuenta con ese correo o número de empleado.' });
    if (emp.password) return res.status(400).json({ message: 'Esta cuenta ya tiene contraseña — inicia sesión normal.' });

    emp.password = await bcrypt.hash(password, 10);
    emp.passwordSetAt = new Date();
    await emp.save();

    res.json({
      token: signToken(emp), name: emp.name,
      canManageOnboarding: !!emp.canManageOnboarding,
      canRequestOffboarding: !!emp.canRequestOffboarding,
      canManageOffboarding: !!emp.canManageOffboarding,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

router.post('/login', async (req, res) => {
  if (isRateLimited(req.ip)) return res.status(429).json({ message: 'Demasiados intentos, espera un momento.' });
  try {
    const { username, password } = req.body;
    const emp = await findByUsername(username);
    if (!emp || !emp.password) return res.status(400).json({ message: 'Credenciales incorrectas' });
    const valid = await bcrypt.compare(password || '', emp.password);
    if (!valid) return res.status(400).json({ message: 'Credenciales incorrectas' });

    res.json({
      token: signToken(emp), name: emp.name,
      canManageOnboarding: !!emp.canManageOnboarding,
      canRequestOffboarding: !!emp.canRequestOffboarding,
      canManageOffboarding: !!emp.canManageOffboarding,
    });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
