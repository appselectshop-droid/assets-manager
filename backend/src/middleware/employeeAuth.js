const jwt = require('jsonwebtoken');

// Sesión de EMPLEADO (portal Mis Tickets), separada por completo de la
// sesión de Sistemas (ver middleware/auth.js) — mismo JWT_SECRET, pero un
// payload distinto ({ type: 'employee' }) para que un token de un lado
// nunca sirva del otro.
module.exports = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ message: 'Sin sesión' });
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    if (decoded.type !== 'employee') return res.status(403).json({ message: 'Acceso restringido' });
    req.employee = decoded;
    next();
  } catch {
    res.status(401).json({ message: 'Sesión inválida' });
  }
};
