const webpush = require('web-push');
const Employee = require('../models/Employee');
const User = require('../models/User');

// Aviso best-effort al navegador/celular de un empleado (Mesa de Ayuda) o de
// un usuario de Sistemas (panel admin) — pedido explícito del usuario
// (2026-07-24, ampliado el mismo día para el lado admin: "que también me
// llegue cuando el usuario me contesta"). Nunca debe romper el flujo
// principal (el reply/mensaje) si falla o si las llaves VAPID no están
// configuradas (mismo criterio que utils/telegram.js).
const VAPID_PUBLIC_KEY = process.env.VAPID_PUBLIC_KEY;
const VAPID_PRIVATE_KEY = process.env.VAPID_PRIVATE_KEY;
const VAPID_SUBJECT = process.env.VAPID_SUBJECT;

const configured = !!(VAPID_PUBLIC_KEY && VAPID_PRIVATE_KEY && VAPID_SUBJECT);
if (configured) {
  webpush.setVapidDetails(VAPID_SUBJECT, VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY);
}

// Compartido entre Employee y User — ambos guardan `pushSubscriptions[]`
// con la misma forma exacta (ver Employee.js/User.js).
async function sendPush(Model, id, { title, body, url }) {
  if (!configured || !id) return;
  try {
    const doc = await Model.findById(id).select('pushSubscriptions');
    if (!doc || doc.pushSubscriptions.length === 0) return;

    const payload = JSON.stringify({ title, body, url });
    // allSettled a propósito: una suscripción caducada no debe abortar el
    // envío a las demás (ej. la persona tiene celular Y computadora).
    const results = await Promise.allSettled(
      doc.pushSubscriptions.map((sub) => webpush.sendNotification(sub.toObject(), payload))
    );

    // Limpieza automática — 404/410 significa que el navegador ya invalidó
    // esa suscripción (desinstaló la app, borró datos del sitio, etc.).
    const deadEndpoints = results
      .map((r, i) => (r.status === 'rejected' && [404, 410].includes(r.reason?.statusCode) ? doc.pushSubscriptions[i].endpoint : null))
      .filter(Boolean);
    if (deadEndpoints.length > 0) {
      await Model.updateOne(
        { _id: id },
        { $pull: { pushSubscriptions: { endpoint: { $in: deadEndpoints } } } }
      );
    }
  } catch (err) {
    console.error('Error enviando notificación push:', err.message);
  }
}

const sendPushToEmployee = (employeeRef, payload) => sendPush(Employee, employeeRef, payload);
const sendPushToUser = (userId, payload) => sendPush(User, userId, payload);

module.exports = { sendPushToEmployee, sendPushToUser };
