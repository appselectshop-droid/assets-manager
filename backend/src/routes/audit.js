const router = require('express').Router();
const AuditLog = require('../models/AuditLog');
const User = require('../models/User');
const auth = require('../middleware/auth');
const { isErpLeader } = require('../config/permissions');

// Antes esta ruta solo exigía `auth` — CUALQUIER usuario autenticado podía
// pedir la auditoría completa del sistema entero llamando la API directo
// (el único freno real era el frontend, `AdminRoute` bloqueando la
// navegación a /audit). Se cierra ahora (2026-09-03) de paso al agregarle
// acceso al líder de ERP (pedido explícito del usuario: "dale permisos
// como al líder de infraestructura pero solo con respecto al ERP").
function assertAuditAccess(req, res) {
  if (req.user.role === 'admin' || isErpLeader(req.user)) return true;
  res.status(403).json({ message: 'Acceso restringido a administradores o al líder de ERP' });
  return false;
}

// Acotado por QUIÉN hizo la acción (todo el equipo de ERP — cualquiera con
// `canManagePlatformAccountsErp`), no por tipo de entidad (2026-09-03,
// ajustado el mismo día: el usuario pidió explícitamente "que Leonardo vea
// TODO lo que hace Yocelin, como el de auditoría que tenemos nosotros" —
// acotar solo a `entity:'cuenta_plataforma_erp'` se quedaba corto: no
// mostraba nada de lo que Yocelin hace en Tickets ERP ni en Responsivas).
// Se resuelve en cada request (sin caché — el equipo de ERP es chico y
// cambia poco, no vale la pena la complejidad de invalidar caché cuando se
// le da/quita el permiso a alguien).
async function getErpTeamUserIds() {
  const erpUsers = await User.find({ canManagePlatformAccountsErp: true }).select('_id');
  return erpUsers.map((u) => u._id);
}

router.get('/', auth, async (req, res) => {
  try {
    if (!assertAuditAccess(req, res)) return;
    const { action, entity, userId, from, to, limit = 200 } = req.query;
    const filter = {};
    if (action) filter.action = action;
    if (entity) filter.entity = entity; // filtro adicional válido para cualquiera, incluido el líder de ERP
    if (req.user.role === 'admin') {
      if (userId) filter.userId = userId;
    } else {
      // Líder de ERP (no admin): sin importar qué `userId` mande de query
      // param, siempre acotado a acciones de su propio equipo — no puede
      // ampliarlo él mismo manipulando la petición para ver a alguien más.
      filter.userId = { $in: await getErpTeamUserIds() };
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    const logs = await AuditLog.find(filter)
      .sort({ createdAt: -1 })
      .limit(Number(limit));
    res.json(logs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Conteo por tipo de acción para las tarjetas de resumen — FIX (2026-08-04):
// el frontend calculaba estos conteos a partir de los `logs` YA filtrados
// por acción (ver GET / de arriba), así que al hacer clic en una tarjeta
// (ej. "Creación") el resto se veía en 0 (ya no había logs de otro tipo en
// la respuesta) y la propia tarjeta activa mostraba el `limit` de la
// consulta (500) en vez del conteo real, si había más de 500 coincidencias.
// Esta ruta cuenta TODO lo que aplique según entity/userId/from/to, pero
// NUNCA filtra por `action` — es precisamente el desglose por acción que
// las tarjetas necesitan mostrar, sin importar cuál esté seleccionada.
router.get('/counts-by-action', auth, async (req, res) => {
  try {
    if (!assertAuditAccess(req, res)) return;
    const { entity, userId, from, to } = req.query;
    const filter = {};
    if (entity) filter.entity = entity;
    if (req.user.role === 'admin') {
      if (userId) filter.userId = userId;
    } else {
      filter.userId = { $in: await getErpTeamUserIds() };
    }
    if (from || to) {
      filter.createdAt = {};
      if (from) filter.createdAt.$gte = new Date(from);
      if (to)   filter.createdAt.$lte = new Date(to);
    }
    const counts = await AuditLog.aggregate([
      { $match: filter },
      { $group: { _id: '$action', count: { $sum: 1 } } },
    ]);
    const result = {};
    counts.forEach((c) => { result[c._id] = c.count; });
    res.json(result);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Usuarios únicos que han hecho acciones (para el filtro) — el líder de ERP
// solo ve a su propio equipo en este selector, mismo criterio que arriba.
router.get('/users', auth, async (req, res) => {
  try {
    if (!assertAuditAccess(req, res)) return;
    const pipeline = [];
    if (req.user.role !== 'admin') {
      pipeline.push({ $match: { userId: { $in: await getErpTeamUserIds() } } });
    }
    pipeline.push(
      { $group: { _id: '$userId', name: { $first: '$userName' } } },
      { $sort: { name: 1 } },
    );
    const users = await AuditLog.aggregate(pipeline);
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

module.exports = router;
