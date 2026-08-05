const router = require('express').Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const Employee = require('../models/Employee');
const auth = require('../middleware/auth');
const adminOnly = require('../middleware/adminOnly');
const logAction = require('../utils/audit');

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
//
// Pedido explícito del usuario (2026-08-03): el frontend antes asumía a
// fuerzas que "sin @" significaba "@selectshop.com.mx" — funcionaba solo
// para ese dominio, no para el resto del grupo (ej. Medical Store, Nexustore,
// Tlab, cada uno con su propio dominio de correo). Ahora, si lo que se
// escribió no trae "@", se busca por la parte de ANTES del "@" en
// cualquiera de los correos corporativos registrados, sin importar el
// dominio — el dominio ya no se adivina en el frontend, se resuelve aquí.
function throwAmbiguous() {
  const err = new Error('Hay más de una cuenta con ese nombre de usuario — escribe tu correo completo.');
  err.ambiguousUsername = true;
  throw err;
}
async function findByUsername(username) {
  const trimmed = (username || '').trim();
  if (!trimmed) return null;
  const byId = await Employee.findOne({ active: true, employeeId: trimmed });
  if (byId) return byId;

  const withEmail = await Employee.find({ active: true, corporateEmails: { $exists: true, $ne: [] } });

  if (trimmed.includes('@')) {
    const lower = trimmed.toLowerCase();
    return withEmail.find((e) => e.corporateEmails.some((em) => em.toLowerCase() === lower)) || null;
  }

  const localLower = trimmed.toLowerCase();
  const matches = withEmail.filter((e) =>
    e.corporateEmails.some((em) => em.toLowerCase().split('@')[0] === localLower)
  );
  if (matches.length > 1) throwAmbiguous();
  return matches[0] || null;
}

// Qué permisos/flags del Employee viajan al portal — un solo lugar para
// agregar uno nuevo (ej. `isSharedAccount`, 2026-07-24) sin tener que tocar
// signToken() y las 2 respuestas JSON (activate/login) por separado, mismo
// criterio que ya usa employeeUserFromAuthResponse() del lado del frontend
// (ver components/EmployeeLoginWidget.jsx).
function employeeAuthFlags(emp) {
  return {
    canManageOnboarding: !!emp.canManageOnboarding,
    canRequestOffboarding: !!emp.canRequestOffboarding,
    canManageOffboarding: !!emp.canManageOffboarding,
    isSharedAccount: !!emp.isSharedAccount,
  };
}

// `impersonated` (2026-08-05) — marca el JWT de "Entrar como empleado"
// para distinguirlo de una sesión real del empleado (ver POST
// /:id/impersonate más abajo). `employeeAuth` middleware copia el payload
// completo del JWT a `req.employee`, así que esta marca llega gratis a
// cualquier ruta que la necesite — se usa en POST /push-subscriptions para
// no dejar que la suscripción push del NAVEGADOR DEL ADMIN (que es lo que
// en realidad se registra, ver comentario en usePushSubscription.js) quede
// pegada al empleado impersonado — bug real reportado por el usuario:
// después de "Entrar como" alguien, el admin empezaba a recibir los push
// de esa persona.
function signToken(emp, expiresIn = '30d', extraClaims = {}) {
  return jwt.sign(
    { employeeRef: emp._id, name: emp.name, type: 'employee', ...employeeAuthFlags(emp), ...extraClaims },
    process.env.JWT_SECRET,
    { expiresIn } // portal de baja fricción — no la sesión administrativa; distinto para impersonar (ver abajo)
  );
}

router.post('/lookup', async (req, res) => {
  if (isRateLimited(req.ip)) return res.status(429).json({ message: 'Demasiados intentos, espera un momento.' });
  try {
    const emp = await findByUsername(req.body.username);
    if (!emp) return res.status(404).json({ message: 'No encontramos ninguna cuenta con ese correo o número de empleado.' });
    res.json({ name: emp.name, hasPassword: !!emp.password });
  } catch (err) {
    if (err.ambiguousUsername) return res.status(409).json({ message: err.message });
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

    res.json({ token: signToken(emp), name: emp.name, ...employeeAuthFlags(emp) });
  } catch (err) {
    if (err.ambiguousUsername) return res.status(409).json({ message: err.message });
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

    res.json({ token: signToken(emp), name: emp.name, ...employeeAuthFlags(emp) });
  } catch (err) {
    if (err.ambiguousUsername) return res.status(409).json({ message: err.message });
    res.status(500).json({ message: err.message });
  }
});

// "Entrar como este empleado" — pedido explícito del usuario (2026-08-03):
// no quiere ver/guardar las contraseñas reales del portal (son de cada
// empleado, se le dijo explícitamente que las maneje él mismo — y además
// son bcrypt, de un solo sentido, físicamente no se pueden mostrar) pero sí
// necesita poder entrar como esa persona de vez en cuando para verificar
// que algo funcione bien desde su perspectiva. Sesión corta (1h, no los 30
// días normales del portal) y siempre queda en Auditoría — a diferencia
// del resto de este archivo (público, solo con límite por IP), esta ruta
// exige sesión de administrador real.
router.post('/:id/impersonate', auth, adminOnly, async (req, res) => {
  try {
    const emp = await Employee.findById(req.params.id);
    if (!emp || emp.active === false) return res.status(404).json({ message: 'Empleado no encontrado' });
    const token = signToken(emp, '1h', { impersonated: true });
    logAction(req.user, 'impersonar', 'empleado', emp._id, emp.name,
      `Inició sesión en la Mesa de Ayuda como ${emp.name}, para verificar algo`);
    res.json({ token, name: emp.name, impersonated: true, ...employeeAuthFlags(emp) });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
