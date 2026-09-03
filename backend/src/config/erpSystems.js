// Catálogo cerrado de sistemas ERP del grupo (uno por empresa) — compartido
// entre Solicitud de Cuenta ERP (routes/accountRequests.js) y el campo
// "ERP afectado" de Tickets (routes/tickets.js). Antes vivía duplicado en
// ambos archivos sin un origen común (2026-09-01, sugerencia #26 de la
// matriz de pruebas de Felipe) — un solo lugar para no desincronizarse.
// Mismo catálogo en el frontend: frontend/src/config/erpSystems.js.
const ERP_SYSTEM_CATALOG = ['ERP SelectShop', 'ERP Nexustore', 'ERP Medicalstore', 'ERP Tlab'];

module.exports = { ERP_SYSTEM_CATALOG };
