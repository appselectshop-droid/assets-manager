// Única cuenta que puede otorgar/revocar el permiso de gestionar Cuentas Gmail.
// Esta cuenta siempre tiene el permiso, sin importar lo que diga la base de datos.
const GMAIL_ROOT_EMAIL = 'sistemas.2@selectshop.com.mx';

module.exports = { GMAIL_ROOT_EMAIL };
