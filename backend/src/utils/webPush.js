const webpush = require('web-push');
const Employee = require('../models/Employee');

// Aviso best-effort al navegador/celular del empleado (Mesa de Ayuda) cuando
// Sistemas responde su ticket — pedido explícito del usuario (2026-07-24):
// "no los ven" si no tienen la pestaña abierta. Nunca debe romper el flujo
// de /:id/reply si falla o si las llaves VAPID no están configuradas (mismo
// criterio que utils/telegram.js).
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

const configured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
if (configured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

async function sendPushToEmployee(employeeRef, { title, body, url }) {
  if (!configured || !employeeRef) return;
  try {
    const employee = await Employee.findById(employeeRef).select('pushSubscriptions');
    if (!employee || employee.pushSubscriptions.length === 0) return;

    const payload = JSON.stringify({ title, body, url });
    // allSettled a propósito: una suscripción caducada no debe abortar el
    // envío a las demás (ej. la persona tiene celular Y computadora).
    const results = await Promise.allSettled(
      employee.pushSubscriptions.map((sub) => webpush.sendNotification(sub.toObject(), payload))
    );

    // Limpieza automática — 404/410 significa que el navegador ya invalidó
    // esa suscripción (desinstaló la app, borró datos del sitio, etc.).
    const deadEndpoints = results
      .map((r, i) => (r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode) ? employee.pushSubscriptions[i].endpoint : null))
      .filter(Boolean);
    if (deadEndpoints.length > 0) {
      await Employee.updateOne(
        { _id: employeeRef },
        { $pull: { pushSubscriptions: { endpoint: { $in: deadEndpoints } } } }
      );
    }
  } catch (err) {
    console.error('Error enviando notificación push:', err.message);
  }
}

module.exports = { sendPushToEmployee };
