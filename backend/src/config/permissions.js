// Cuentas "superadministrador" — las únicas que pueden otorgar/revocar el
// permiso de gestionar Cuentas Gmail/Plataformas/ERP a otros usuarios. Estas
// cuentas siempre tienen esos permisos activos, sin importar lo que diga la
// base de datos (se re-fuerza en cada login, ver routes/auth.js).
const GMAIL_ROOT_EMAILS = ['sistemas.2@selectshop.com.mx', 'sistemas.3@selectshop.com.mx'];

module.exports = { GMAIL_ROOT_EMAILS };
