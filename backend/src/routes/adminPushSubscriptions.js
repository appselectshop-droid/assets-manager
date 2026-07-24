const router = require('express').Router();
const User = require('../models/User');
const auth = require('../middleware/auth');

// Espejo de routes/pushSubscriptions.js pero para el panel admin (Sistemas)
// — pedido explícito del usuario (2026-07-24): "que también me llegue
// cuando el usuario me contesta". Ruta aparte (no la misma que empleado)
// porque usa `auth` (sesión de Sistemas), no `employeeAuth`, y guarda en
// `User.pushSubscriptions`, no en `Employee`.
router.use(auth);

router.post('/', async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys?.p256dh || !keys?.auth) {
      return res.status(400).json({ message: 'Suscripción incompleta' });
    }

    // Un mismo dispositivo/navegador no debe quedar avisando a dos personas
    // de Sistemas a la vez (ej. una computadora compartida entre técnicos).
    await User.updateMany(
      { _id: { $ne: req.user.id } },
      { $pull: { pushSubscriptions: { endpoint } } }
    );

    // No duplicar si el navegador vuelve a mandar la misma suscripción.
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { pushSubscriptions: { endpoint } } }
    );
    await User.updateOne(
      { _id: req.user.id },
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
    await User.updateOne(
      { _id: req.user.id },
      { $pull: { pushSubscriptions: { endpoint } } }
    );
    res.json({ message: 'Notificaciones desactivadas' });
  } catch (err) {
    res.status(400).json({ message: err.message });
  }
});

module.exports = router;
