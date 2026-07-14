const jwt = require('jsonwebtoken');

// Igual que middleware/employeeAuth.js, pero nunca bloquea la petición: si no
// hay token, es inválido o expiró, sigue como anónimo (sin req.employee) — se
// usa en rutas públicas que quieren saber "¿ya venía de una sesión de
// empleado?" sin dejar de aceptar envíos sin login (ej. Solicitar Ingreso,
// que RH puede llenar a nombre de alguien más).
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return next();
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type === 'employee') req.employee = decoded;
  } catch {
    // token inválido/expirado — se ignora, la petición sigue como anónima
  }
  next();
};
