// Aviso por correo (Microsoft Graph / Azure AD) cuando llega un ticket —
// canal ADICIONAL a Telegram (ver utils/telegram.js), no lo reemplaza.
// Mismo criterio best-effort: nunca debe romper el flujo si Azure falla o
// si las variables de entorno no están configuradas (ej. mientras no se ha
// terminado de dar de alta el App Registration en Azure).
//
// Requiere un App Registration en Azure AD con permiso de APLICACIÓN
// Mail.Send (con consentimiento de administrador) — ver README para los
// pasos exactos. Usa el flujo de credenciales de cliente (client
// credentials), sin que ningún usuario tenga que iniciar sesión — el correo
// se manda "como" el buzón `NOTIFICATIONS_FROM_EMAIL`.
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;
const NOTIFICATIONS_FROM_EMAIL = process.env.NOTIFICATIONS_FROM_EMAIL;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;

  const res = await fetch(`https://login.microsoftonline.com/${AZURE_TENANT_ID}/oauth2/v2.0/token`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: AZURE_CLIENT_ID,
      client_secret: AZURE_CLIENT_SECRET,
      scope: 'https://graph.microsoft.com/.default',
      grant_type: 'client_credentials',
    }),
  });
  if (!res.ok) throw new Error(`Azure token error: ${res.status} ${await res.text()}`);
  const data = await res.json();
  cachedToken = data.access_token;
  // Margen de 60s antes de que expire de verdad, para no usarlo ya vencido.
  cachedTokenExpiresAt = Date.now() + (data.expires_in - 60) * 1000;
  return cachedToken;
}

// `to`: string o arreglo de correos. `attachments` (opcional, arreglo de
// `{ filename, contentType, buffer }`) — pensado para destinatarios externos
// (ej. pagos@, sin sesión en el panel para ir a descargar los adjuntos del
// ticket desde ahí — puede ser más de uno, ej. CSF + comprobante bancario
// de "Alta de Proveedores") que sí necesitan el archivo en el correo mismo,
// no solo un link. Silenciosamente no hace nada si faltan variables de
// entorno o si `to` queda vacío — igual que notifyTelegram.
async function notifyEmail({ to, subject, html, attachments }) {
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET || !NOTIFICATIONS_FROM_EMAIL) return;
  const recipients = (Array.isArray(to) ? to : [to]).filter(Boolean);
  if (recipients.length === 0) return;

  try {
    const token = await getAccessToken();
    const message = {
      subject,
      body: { contentType: 'HTML', content: html },
      toRecipients: recipients.map((email) => ({ emailAddress: { address: email } })),
    };
    const validAttachments = (attachments || []).filter((a) => a?.buffer);
    if (validAttachments.length > 0) {
      message.attachments = validAttachments.map((a) => ({
        '@odata.type': '#microsoft.graph.fileAttachment',
        name: a.filename || 'adjunto',
        contentType: a.contentType || 'application/octet-stream',
        contentBytes: a.buffer.toString('base64'),
      }));
    }
    const res = await fetch(`https://graph.microsoft.com/v1.0/users/${encodeURIComponent(NOTIFICATIONS_FROM_EMAIL)}/sendMail`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ message }),
    });
    if (!res.ok) {
      console.error('Microsoft Graph respondió con error:', res.status, await res.text());
    }
  } catch (err) {
    console.error('Error enviando notificación por correo (Azure):', err.message);
  }
}

module.exports = { notifyEmail };
