const router = require('express').Router();
const Employee = require('../models/Employee');
const employeeAuth = require('../middleware/employeeAuth');

router.use(employeeAuth);

// Guarda la suscripción push que acaba de crear el navegador
// (`PushManager.subscribe()`, ver usePushSubscription.js). Antes de
// guardarla en el empleado actual, se quita de cualquier OTRO empleado que
// ya la tuviera — un mismo dispositivo/navegador (identificado por
// `endpoint`) no debe quedar avisando a dos personas a la vez, algo que sí
// puede pasar con una tablet compartida (ver Employee.isSharedAccount) que
// cambia de "quién la usa" con el tiempo.
router.post('/', async (req, res) => {
  try {
    // impersonated (2026-08-05) — bug real reportado por el usuario: al
    // "Entrar como" un empleado, el navegador del ADMIN (mismo origen/
    // misma suscripción de PushManager que Tickets, ver
    // usePushSubscription.js) terminaba registrado en el empleado
    // impersonado — el admin empezaba a recibir sus push. Una sesión de
    // impersonar nunca debe registrar/tocar suscripciones push.
    if (req.employee.impersonated) {
      return res.status(200).json({ message: 'Sesión de impersonar — no se registran notificaciones' });
    }
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Suscripción incompleta' });
    }

    await Employee.updateMany(
      { _id: { $ne: req.employee.employeeRef } },
      { $pull: { pushSubscriptions: { endpoint } } }
    );

    // $addToSet, no $push (2026-08-05) — bug real reportado por el usuario
    // (~5 notificaciones duplicadas): este hook se monta 2 veces por
    // página (PortalLayout + PushNotificationBanner, ya corregido del lado
    // del frontend), y con $pull-luego-$push en 2 llamadas separadas, dos
    // requests casi simultáneos podían intercalarse y dejar la misma
    // suscripción duplicada en el arreglo. $addToSet compara el objeto
    // completo — converge a una sola copia sin importar el orden en que
    // lleguen las peticiones concurrentes.
    await Employee.updateOne(
      { _id: req.employee.employeeRef },
      { $pull: { pushSubscriptions: { endpoint } } }
    );
    await Employee.updateOne(
      { _id: req.employee.employeeRef },
      { $addToSet: { pushSubscriptions: { endpoint, keys } } }
    );

    res.status(201).json({ message: 'Notificaciones activadas' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

router.post('/unsubscribe', async (req, res) => {
  try {
    const { endpoint } = req.body;
    if (!endpoint) return res.status(400).json({ message: 'Falta el endpoint' });
    await Employee.updateOne(
      { _id: req.employee.employeeRef },
      { $pull: { pushSubscriptions: { endpoint } } }
    );
    res.json({ message: 'Notificaciones desactivadas' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
