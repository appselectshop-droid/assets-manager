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
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Suscripción incompleta' });
    }

    await Employee.updateMany(
      { _id: { $ne: req.employee.employeeRef } },
      { $pull: { pushSubscriptions: { endpoint } } }
    );

    // No duplicar si el navegador vuelve a mandar la misma suscripción.
    await Employee.updateOne(
      { _id: req.employee.employeeRef },
      { $pull: { pushSubscriptions: { endpoint } } }
    );
    await Employee.updateOne(
      { _id: req.employee.employeeRef },
      { $push: { pushSubscriptions: { endpoint, keys } } }
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
