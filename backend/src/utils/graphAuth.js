// Autenticación de Microsoft Graph (Azure AD, flujo de credenciales de
// cliente) — extraído de graphMail.js (2026-09-08) para poder reusar el
// mismo token cacheado desde graphFiles.js (OneDrive) sin duplicar la
// lógica de caché ni pedir un token nuevo para cada llamada.
const AZURE_TENANT_ID = process.env.AZURE_TENANT_ID;
const AZURE_CLIENT_ID = process.env.AZURE_CLIENT_ID;
const AZURE_CLIENT_SECRET = process.env.AZURE_CLIENT_SECRET;

let cachedToken = null;
let cachedTokenExpiresAt = 0;

async function getAccessToken() {
  if (cachedToken && Date.now() < cachedTokenExpiresAt) return cachedToken;
  if (!AZURE_TENANT_ID || !AZURE_CLIENT_ID || !AZURE_CLIENT_SECRET) {
    throw new Error('Azure AD no está configurado (faltan AZURE_TENANT_ID/CLIENT_ID/CLIENT_SECRET)');
  }

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

module.exports = { getAccessToken };
