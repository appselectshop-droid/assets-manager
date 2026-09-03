// Cuentas "superadministrador" — las únicas que pueden otorgar/revocar el
// permiso de gestionar Cuentas Gmail/Plataformas/ERP a otros usuarios. Estas
// cuentas siempre tienen esos permisos activos, sin importar lo que diga la
// base de datos (se re-fuerza en cada login, ver routes/auth.js).
const GMAIL_ROOT_EMAILS = ['sistemas.2@selectshop.com.mx', 'sistemas.3@selectshop.com.mx'];

// Líder de ERP (Leonardo Villareal) — antes vivía solo dentro de tickets.js
// (isErpLeader, usada para que pueda eliminar tickets de su área). Se
// mueve aquí (2026-09-03, pedido explícito del usuario: "dale permisos
// como al líder de infraestructura pero solo con respecto al ERP") para
// reusarla también en platformAccountsErp.js (eliminar cuentas ERP),
// responsivaArchive.js (eliminar responsivas ERP) y audit.js (ver
// auditoría acotada a ERP) — mismo criterio en los 4 lugares: no es
// `role: 'admin'` (eso le daría poder sobre TODO el sistema, no solo
// ERP, como sí tiene Miguel García/lider.infra.soporte) — es este check
// puntual por correo, igual que ya se hacía en tickets.js.
const LIDER_ERP_EMAIL = 'lider.erp@selectshop.com.mx';
function isErpLeader(user) {
  return user?.email === LIDER_ERP_EMAIL;
}

module.exports = { GMAIL_ROOT_EMAILS, LIDER_ERP_EMAIL, isErpLeader };
