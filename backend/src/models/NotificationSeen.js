const mongoose = require('mongoose');

// "Visto" por persona en la campanita de notificaciones — pedido explícito
// del usuario (2026-08-10): "una vez que ya lo haya visualizado, que se
// quite la notificación porque ahí va a seguir". Antes el contador era
// puramente compartido (pendiente/tomado, ver routes/notifications.js) —
// esto se le suma encima, por usuario: en cuanto alguien abre un pendiente
// específico desde la campana, deja de contar/aparecer EN SU propia
// campana, aunque el ticket/solicitud siga sin resolverse para los demás
// (dos personas pueden ver la misma solicitud en momentos distintos, cada
// quien la "apaga" por su cuenta).
// `itemKey` = `${categoryKey}:${itemId}` — una sola colección para todas las
// categorías en vez de un array creciendo sin control dentro de User.
const notificationSeenSchema = new mongoose.Schema({
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  itemKey: { type: String, required: true },
}, { timestamps: true });

notificationSeenSchema.index({ user: 1, itemKey: 1 }, { unique: true });

module.exports = mongoose.model('NotificationSeen', notificationSeenSchema);
