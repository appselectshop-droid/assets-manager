// Aviso best-effort a un grupo de Telegram cuando llega una Solicitud (de
// Cuentas o de Ingreso) — nunca debe romper el flujo de la solicitud si
// Telegram falla o si las variables de entorno no están configuradas
// (ej. en desarrollo local sin bot propio).
const TELEGRAM_BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const TELEGRAM_CHAT_ID = process.env.TELEGRAM_CHAT_ID;

async function notifyTelegram(text) {
  if (!TELEGRAM_BOT_TOKEN || !TELEGRAM_CHAT_ID) return;
  try {
    const res = await fetch(`https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text, parse_mode: 'HTML' }),
    });
    if (!res.ok) {
      console.error('Telegram respondió con error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Error enviando notificación a Telegram:', err.message);
  }
}

module.exports = { notifyTelegram };
