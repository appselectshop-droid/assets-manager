const mongoose = require('mongoose');

// Un documento por día en que el programador de recordatorios de pagos ya
// corrió — el índice único sobre `fecha` garantiza que el correo salga una
// sola vez por día aunque el backend se reinicie o el chequeo se repita.
const paymentReminderLogSchema = new mongoose.Schema({
  fecha:       { type: String, required: true, unique: true }, // 'YYYY-MM-DD' (hora de México)
  corte:       { type: String, default: '' },
  pendientes:  { type: Number, default: 0 },
  destinatarios: [{ type: String }],
  enviado:     { type: Boolean, default: false },
}, { timestamps: true });

module.exports = mongoose.model('PaymentReminderLog', paymentReminderLogSchema);
