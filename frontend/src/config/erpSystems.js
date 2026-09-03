// Catálogo cerrado de sistemas ERP del grupo (uno por empresa) — compartido
// entre Solicitar Cuenta ERP (pages/SolicitarCuenta.jsx) y el campo "ERP
// afectado" de Reportar Ticket (pages/ReportarTicket.jsx). Antes vivía
// duplicado en SolicitarCuenta.jsx sin compartir origen (2026-09-01,
// sugerencia #26 de la matriz de pruebas de Felipe) — un solo lugar para
// no desincronizarse. Mismo catálogo en el backend:
// backend/src/config/erpSystems.js.
export const ERP_SYSTEM_CATALOG = ['ERP SelectShop', 'ERP Nexustore', 'ERP Medicalstore', 'ERP Tlab'];
