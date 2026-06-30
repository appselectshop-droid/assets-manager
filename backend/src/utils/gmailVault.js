const crypto = require('crypto');

const ALGO = 'aes-256-gcm';
const DIACRITICS_RE = new RegExp(String.fromCharCode(0x0300) + '-' + String.fromCharCode(0x036f), 'g');

// Deriva una clave de 32 bytes a partir de GMAIL_VAULT_KEY (cualquier longitud) vía sha256.
function getKey() {
  const secret = process.env.GMAIL_VAULT_KEY;
  if (!secret) throw new Error('Falta configurar GMAIL_VAULT_KEY en el servidor');
  return crypto.createHash('sha256').update(secret).digest();
}

function encryptPassword(plainText) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv(ALGO, getKey(), iv);
  const encrypted = Buffer.concat([cipher.update(plainText, 'utf8'), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64');
}

function decryptPassword(payload) {
  const data = Buffer.from(payload, 'base64');
  const iv = data.subarray(0, 12);
  const authTag = data.subarray(12, 28);
  const encrypted = data.subarray(28);
  const decipher = crypto.createDecipheriv(ALGO, getKey(), iv);
  decipher.setAuthTag(authTag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

// Contraseña aleatoria única por cuenta (nunca la misma dos veces) para evitar
// el reúso de contraseñas entre cuentas de Gmail que causó problemas antes.
function generatePassword(length = 14) {
  const LOWER = 'abcdefghijkmnopqrstuvwxyz';
  const UPPER = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
  const DIGITS = '23456789';
  const SYMBOLS = '!@#$%&*?';
  const ALL = LOWER + UPPER + DIGITS + SYMBOLS;

  const pick = (set) => set[crypto.randomInt(set.length)];

  const chars = [pick(LOWER), pick(UPPER), pick(DIGITS), pick(SYMBOLS)];
  while (chars.length < length) chars.push(pick(ALL));

  for (let i = chars.length - 1; i > 0; i--) {
    const j = crypto.randomInt(i + 1);
    [chars[i], chars[j]] = [chars[j], chars[i]];
  }
  return chars.join('');
}

function normalize(str) {
  return (str || '')
    .normalize('NFD').replace(DIACRITICS_RE, '')
    .toLowerCase()
    .replace(/[^a-z\s]/g, '')
    .trim();
}

// Sugiere nombre.apellido@gmail.com a partir del nombre del empleado, evitando
// choques con correos ya registrados (agrega un número al final si hace falta).
function suggestEmail(fullName, existingEmails = []) {
  const parts = normalize(fullName).split(/\s+/).filter(Boolean);
  const base = parts.length === 0
    ? 'usuario'
    : parts.length === 1
      ? parts[0]
      : `${parts[0]}.${parts[parts.length - 1]}`;

  const taken = new Set(existingEmails.map((e) => e.toLowerCase()));
  let candidate = `${base}@gmail.com`;
  let n = 1;
  while (taken.has(candidate)) {
    candidate = `${base}${n}@gmail.com`;
    n += 1;
  }
  return candidate;
}

module.exports = { encryptPassword, decryptPassword, generatePassword, suggestEmail };
