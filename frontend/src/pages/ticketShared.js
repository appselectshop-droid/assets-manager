// Constantes y helpers compartidos entre TODAS las páginas del módulo de
// Tickets (TicketsLayout + sus sub-páginas: Dashboard, Tablero, Monitoreo,
// Chats, Mis Tickets, Notas internas, Buscador) — antes vivían duplicados
// dentro de un solo archivo Tickets.jsx de 1100+ líneas; se extrajeron aquí
// para que cada sub-página sea chica y se entienda sola, sin tener que leer
// el resto del módulo. Ningún comportamiento cambió al mover este código,
// solo el archivo donde vive.

// Mismo correo que el backend (backend/src/utils/pdfBranding.js) — todos son
// admin, pero aquí solo se usa para decidir qué controles mostrar; el
// backend es quien realmente hace valer el permiso.
export const GERENTE_SISTEMAS_EMAIL = 'gerente.sistemas@selectshop.com.mx';

// Correos reales usados para permisos "de una sola persona" en tickets —
// mismas constantes que backend/src/routes/tickets.js (LIDER_INFRA_SOPORTE_EMAIL,
// SISTEMAS_3_EMAIL, FELIPE_EMAIL).
export const LIDER_INFRA_SOPORTE_EMAIL = 'lider.infra.soporte@selectshop.com.mx'; // Miguel
export const SISTEMAS_3_EMAIL = 'sistemas.3@selectshop.com.mx'; // Lilly
export const FELIPE_EMAIL = 'sistemas.4@selectshop.com.mx'; // Felipe

// Ventas (2026-08-18) — mismo criterio de "una sola persona" que su
// contraparte en el backend (isVentasUser en tickets.js): Miguel sigue
// siendo admin normal de Infraestructura y Soporte, así que esto no puede
// usar role/canManageTickets como ERP/BI-only.
export function isVentasUser(user) {
  return user.email === LIDER_INFRA_SOPORTE_EMAIL;
}

// Mantenimiento de tickets (2026-08-19, pedido explícito del usuario):
// "permíteme editar y eliminar tickets, pero bloquéame la conversación" —
// mismo criterio que isTicketMaintenanceUser() en el backend.
const TICKET_MAINTENANCE_EMAILS = [SISTEMAS_3_EMAIL, FELIPE_EMAIL, LIDER_INFRA_SOPORTE_EMAIL];
export function isTicketMaintenanceUser(user) {
  return TICKET_MAINTENANCE_EMAILS.includes(user.email);
}

// Mismo criterio EXACTO que canManageTicket() en backend/src/routes/tickets.js
// — gestiona el chat directo con el empleado (responder, borrar mensajes).
// Centralizado aquí (antes duplicado a mano en TicketDetailModal.jsx y
// TicketsChats.jsx) porque se desincronizaron: el backend se actualizó el
// 2026-08-18 (se quitó el bypass general de admin, se agregó Ventas) pero
// ninguna de las 2 copias del frontend se actualizó con él — bug real
// encontrado el 2026-08-19 al construir el permiso de mantenimiento de
// abajo. `isErpOnlyUser`/`isBiOnlyUser` se reciben como parámetro (viven en
// components/Layout.jsx) para no crear un import circular.
export function canManageTicketClient(currentUser, ticket, isErpOnlyUser, isBiOnlyUser) {
  if (currentUser.email === GERENTE_SISTEMAS_EMAIL || currentUser.canViewManagerDashboard) return true;
  const erpTicket = ['erp', 'reporte_erp'].includes(ticket.escalatedToArea || ticket.ticketType);
  if (erpTicket) return isErpOnlyUser(currentUser);
  const biTicket = (ticket.escalatedToArea || ticket.ticketType) === 'soporte_bi';
  if (biTicket) return isBiOnlyUser(currentUser);
  if (ticket.escalatedToArea === 'ventas') return isVentasUser(currentUser);
  if (!ticket.assignedTo) return true;
  return ticket.assignedTo._id === currentUser.id;
}

// Mismo criterio que canEditTicketMeta() en el backend — "editar" (SLA,
// prioridad, tipo, estatus, escalar, notas) para Lilly/Miguel/Felipe aunque
// el ticket no sea suyo, sin abrirles el chat directo (pedido explícito del
// usuario 2026-08-19: "permíteme editar y eliminar tickets, pero bloquéame
// la conversación").
export function canEditTicketMetaClient(currentUser, ticket, isErpOnlyUser, isBiOnlyUser) {
  if (canManageTicketClient(currentUser, ticket, isErpOnlyUser, isBiOnlyUser)) return true;
  if (!isTicketMaintenanceUser(currentUser)) return false;
  const erpTicket = ['erp', 'reporte_erp'].includes(ticket.escalatedToArea || ticket.ticketType);
  if (erpTicket) return false;
  const biTicket = (ticket.escalatedToArea || ticket.ticketType) === 'soporte_bi';
  if (biTicket) return false;
  if (ticket.escalatedToArea === 'ventas') return false;
  return true;
}

// Eliminar tickets (2026-08-19, pedido explícito del usuario): "quiero
// que ERP y BI (los líderes) puedan borrar tickets" — mismo criterio
// EXACTO que el backend (isErpLeader/isBiLeader en tickets.js): solo los
// líderes por correo real, no cualquier analista de su equipo, y solo
// sobre tickets de su propia área.
const LIDER_ERP_EMAIL = 'lider.erp@selectshop.com.mx';
const LIDER_BI_EMAIL = 'lider.bi@selectshop.com.mx';
export function canDeleteTicketClient(currentUser, ticket) {
  if (currentUser.role === 'admin') return true;
  const erpTicket = ['erp', 'reporte_erp'].includes(ticket.escalatedToArea || ticket.ticketType);
  if (erpTicket) return currentUser.email === LIDER_ERP_EMAIL;
  const biTicket = (ticket.escalatedToArea || ticket.ticketType) === 'soporte_bi';
  if (biTicket) return currentUser.email === LIDER_BI_EMAIL;
  return false;
}

export const TICKET_TYPE_CONFIG = {
  // Genéricos — heredados, solo para tickets viejos (ver Ticket.js backend).
  hardware:      { label: 'Hardware', icon: '🖥️' },
  software:      { label: 'Software', icon: '💾' },
  red:           { label: 'Red / Conectividad', icon: '📶' },
  // Separados por Computadoras/Celulares — pedido explícito del usuario.
  hardware_pc:      { label: 'Hardware Computadoras', icon: '🖥️' },
  hardware_celular: { label: 'Hardware Celulares', icon: '📱' },
  accesorio:        { label: 'Accesorios', icon: '🖱️' },
  software_pc:      { label: 'Software Computadoras', icon: '💾' },
  software_celular: { label: 'Software Celulares', icon: '📲' },
  red_pc:           { label: 'Red Computadoras', icon: '📶' },
  red_celular:      { label: 'Red Celulares', icon: '📡' },
  aplicacion:    { label: 'Aplicaciones', icon: '🗂️' },
  impresora:     { label: 'Impresoras', icon: '🖨️' },
  cuenta_acceso: { label: 'Cuenta / Acceso', icon: '🔐' },
  seguridad:     { label: 'Seguridad', icon: '🛡️' },
  erp:           { label: 'ERP', icon: '🏭' },
  // Antes caía en el fallback genérico (❓) — pedido explícito del usuario
  // (2026-07-30): gerente.sistemas ahora sí ve tickets soporte_bi mezclados
  // aquí (es el único que ve los 3 flujos en /tickets), necesita su propio
  // ícono/etiqueta reales, no un signo de interrogación.
  soporte_bi:    { label: 'Soporte BI', icon: '📊' },
  reporte_erp:   { label: 'Reporte ERP', icon: '📈' },
  otro:          { label: 'Otro', icon: '❓' },
};

export const COLUMNS = [
  { key: 'abierto',    label: 'Abierto',    accent: '#d97706' },
  { key: 'en_proceso', label: 'En proceso', accent: '#2563eb' },
  { key: 'resuelto',   label: 'Resuelto',   accent: '#16a34a' },
  { key: 'cerrado',    label: 'Cerrado',    accent: '#6b7280' },
];

export const STATUS_CONFIG = {
  abierto:    { label: 'Abierto',     color: '#d97706', bg: '#fffbeb' },
  en_proceso: { label: 'En proceso',  color: '#2563eb', bg: '#eff6ff' },
  resuelto:   { label: 'Resuelto',    color: '#16a34a', bg: '#f0fdf4' },
  cerrado:    { label: 'Cerrado',     color: '#6b7280', bg: '#f5f5f5' },
};

// La prioridad la fija Sistemas al triage, no quien reporta (ver Ticket.js)
// — por default "media" hasta que alguien la ajuste. El orden importa para
// poder ordenar el tablero de más a menos urgente. "critica" (P1) llega
// junto con la clasificación por SLA (ver SLA_CATALOG abajo).
export const PRIORITY_ORDER = ['critica', 'alta', 'media', 'baja'];
export const PRIORITY_CONFIG = {
  critica: { label: 'Crítica', icon: '🟣', color: '#9333ea', bg: '#faf5ff' },
  alta:    { label: 'Alta',    icon: '🔴', color: '#dc2626', bg: '#fef2f2' },
  media:   { label: 'Media',   icon: '🟡', color: '#d97706', bg: '#fffbeb' },
  baja:    { label: 'Baja',    icon: '🟢', color: '#16a34a', bg: '#f0fdf4' },
};

// Matriz oficial de Niveles de Servicio (SLA) — mismo catálogo que
// Ticket.SLA_CATALOG en el backend (duplicado aquí solo para pintar el
// selector/labels, igual que PERMISSION_LABELS en otras páginas). Elegir una
// categoría rellena Nivel + Prioridad + fechas límite de un jalón (ver
// PUT /:id/sla-category) — reemplaza a la antigua "Severidad" del ticket.
export const SLA_CATALOG = [
  { category: 'Cuentas y Accesos',              level: 1, priority: 'baja' },
  { category: 'Ofimática y Archivos',            level: 1, priority: 'baja' },
  { category: 'Periféricos',                     level: 1, priority: 'media' },
  { category: 'Software y Sistema Operativo',    level: 2, priority: 'media' },
  { category: 'Red Local (Usuario)',             level: 2, priority: 'media' },
  { category: 'Cuentas Críticas / ERP-SAE',      level: 2, priority: 'alta' },
  { category: 'Hardware Local',                  level: 2, priority: 'alta' },
  { category: 'Infraestructura Local',           level: 3, priority: 'alta' },
  { category: 'Sistemas de CCTV',                level: 3, priority: 'alta' },
  { category: 'Incidentes de Seguridad',         level: 3, priority: 'critica' },
  { category: 'Servidores y Core',               level: 3, priority: 'critica' },
];
export const SLA_LEVEL_CONFIG = {
  1: { label: 'Nivel 1', icon: '🟢', color: '#16a34a', bg: '#f0fdf4' },
  2: { label: 'Nivel 2', icon: '🟡', color: '#d97706', bg: '#fffbeb' },
  3: { label: 'Nivel 3', icon: '🔴', color: '#dc2626', bg: '#fef2f2' },
};

// Matriz de SLA con Proveedor (Matriz_SLA_Con_Proveedor.pdf, 2026-08-04) —
// mismo catálogo que Ticket.PROVIDER_SLA_CATALOG en el backend, duplicado
// aquí solo para pintar la tabla de referencia (ver TicketsSLA.jsx) y el
// detalle del ticket escalado (ver TicketDetailModal.jsx). Se aplica sola
// al escalar a Proveedor (PUT /:id/escalate), a partir de la Categoría de
// Falla que el ticket ya tenga clasificada — no es algo que se elija aquí.
export const PROVIDER_SLA_CATALOG = [
  { category: 'Cuentas y Accesos',              tMaxEscalarMin: 15, label: 'N/A (Resuelto internamente)' },
  { category: 'Ofimática y Archivos',            tMaxEscalarMin: 30, label: '24 hrs (Soporte Microsoft / Cloud)' },
  { category: 'Periféricos',                     tMaxEscalarMin: 45, label: '24-48 hrs (Proveedor / Garantía)' },
  { category: 'Software y Sistema Operativo',    tMaxEscalarMin: 60, label: '24 hrs (Soporte de Marca / Licencias)' },
  { category: 'Red Local (Usuario)',             tMaxEscalarMin: 60, label: '12-24 hrs (Proveedor Cableado / Red)' },
  { category: 'Cuentas Críticas / ERP-SAE',      tMaxEscalarMin: 30, label: '4-8 hrs (Soporte Aspel / ERP)' },
  { category: 'Hardware Local',                  tMaxEscalarMin: 60, label: '24-48 hrs (Garantía Hardware / Marcas)*' },
  { category: 'Infraestructura Local',           tMaxEscalarMin: 30, label: '8-12 hrs (Proveedor Infraestructura)' },
  { category: 'Sistemas de CCTV',                tMaxEscalarMin: 30, label: '24-48 hrs (Soporte Fabricante / Dahua)' },
  { category: 'Servidores y Core',               tMaxEscalarMin: 15, label: '4 hrs (ISP / Enlace Dedicado)' },
  { category: 'Incidentes de Seguridad',         tMaxEscalarMin: 15, label: '4-8 hrs (Partner Ciberseguridad)' },
];

export function oneAssetLabel(a) {
  if (!a) return null;
  return `${a.brand || ''} ${a.model || ''}`.trim() + (a.serialNumber ? ` (${a.serialNumber})` : '');
}

// El ticket nunca elige un solo equipo (a propósito — quien reporta no
// escoge) — assetRefs trae todo lo que la persona tenía asignado activo al
// reportar, puede ser uno, varios o ninguno.
export function assetsLabel(assetRefs) {
  if (!assetRefs || assetRefs.length === 0) return null;
  return assetRefs.map(oneAssetLabel).join(' · ');
}

export function daysOpen(ticket) {
  const end = ticket.resolvedAt ? new Date(ticket.resolvedAt) : new Date();
  const start = new Date(ticket.createdAt);
  return Math.max(0, Math.floor((end - start) / 86400000));
}

// Distinto de daysOpen: esto es "hace cuánto" respecto a HOY, no una
// duración entre dos fechas del ticket. Hace falta separado porque un
// ticket resuelto el mismo día que se reportó (daysOpen = 0) se quedaba
// mostrando "Hoy" en TicketCard.jsx sin importar si eso fue ayer o hace un
// mes — bug real reportado por Felipe (2026-07-30).
//
// Compara fecha de calendario (medianoche a medianoche), no un rolling de
// 24 horas — si no, un ticket resuelto hoy a las 4pm seguía mostrando
// "Resuelto hoy" hasta las 4pm del día siguiente en vez de cambiar a
// "ayer" a la medianoche, como se espera — bug reportado por el usuario
// (2026-08-04).
export function daysAgo(date) {
  const target = new Date(date);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.max(0, Math.round((today - target) / 86400000));
}

// Si ya se clasificó por SLA, "vencido" es real (pasó resolutionDueAt). Si
// todavía no se clasifica, se usa la heurística de siempre (no es un SLA
// formal, es un umbral fijo para llamar la atención mientras se triagea:
// bloqueante no debería tardar más de 1 día, uno normal no más de 5). Solo
// aplica mientras sigue abierto/en proceso — uno ya resuelto no "vence".
//
// Escalado a Proveedor (2026-08-04): la propia matriz de SLA con Proveedor
// dice "el SLA interno se congela y se activa el tiempo... del Contrato
// Subyacente" — mientras el ticket espera al proveedor externo, ya no es
// justo marcarlo "Vencido" contra el reloj INTERNO (`resolutionDueAt`),
// que sigue corriendo desde que se creó el ticket sin importar el
// escalamiento. Se compara contra `providerSlaDueAt` en su lugar; si
// tampoco hay uno calculado (sin `slaCategory` al momento de escalar), no
// se marca vencido — ya no depende de Sistemas mientras está con el
// proveedor.
export function isOverdue(ticket) {
  if (!['abierto', 'en_proceso'].includes(ticket.status)) return false;
  if (ticket.escalationType === 'proveedor') {
    return ticket.providerSlaDueAt ? new Date() > new Date(ticket.providerSlaDueAt) : false;
  }
  if (ticket.resolutionDueAt) return new Date() > new Date(ticket.resolutionDueAt);
  const threshold = ticket.blocksWork ? 1 : 5;
  return daysOpen(ticket) > threshold;
}

export function initials(name = '') {
  return name.split(' ').map((n) => n[0]).join('').slice(0, 2).toUpperCase();
}

export function timeAgo(date) {
  const diff = Math.floor((Date.now() - new Date(date)) / 1000);
  if (diff < 60)    return 'Hace un momento';
  if (diff < 3600)  return `Hace ${Math.floor(diff / 60)} min`;
  if (diff < 86400) return `Hace ${Math.floor(diff / 3600)}h`;
  return new Date(date).toLocaleDateString('es-MX', { day: 'numeric', month: 'short' });
}

// ── "Monitoreo" de equipos (antes "Zabbix — Equipos") ─────────────
// A pedido del usuario: un apartado inspirado en Zabbix (monitoreo de
// redes) pero para EQUIPOS — no lista tickets, lista ACTIVOS y su estado de
// salud según los tickets que tienen encima, con la misma paleta de
// severidad que usa Zabbix de verdad (Desastre/Alta/Promedio/Advertencia).
// Se renombró la etiqueta visible a "Monitoreo" (pedido explícito: "no es
// un Zabbix pero lo simula") — el nombre interno se conserva, es solo la
// palabra que ve quien usa la app la que cambió.
export const SEVERITY_CONFIG = {
  disaster: { label: 'Desastre',    color: '#E45959', bg: '#fef2f2' },
  high:     { label: 'Alta',        color: '#E97659', bg: '#fff1ec' },
  average:  { label: 'Promedio',    color: '#FFA059', bg: '#fff7ed' },
  warning:  { label: 'Advertencia', color: '#c9960c', bg: '#fffbeb' },
  ok:       { label: 'OK',          color: '#16a34a', bg: '#f0fdf4' },
};
export const SEVERITY_ORDER = ['disaster', 'high', 'average', 'warning', 'ok'];

// Heurística de severidad por activo (no es el motor real de Zabbix, es un
// equivalente simple): si tiene un ticket abierto que bloquea trabajo Y ya
// está vencido, es un "Desastre"; si tiene algo bloqueante o vencido, "Alta";
// 2+ tickets abiertos sin lo anterior, "Promedio"; 1 ticket abierto normal,
// "Advertencia"; sin nada abierto (aunque tenga historial), "OK".
export function assetSeverity(assetTickets) {
  const open = assetTickets.filter((t) => ['abierto', 'en_proceso'].includes(t.status));
  if (open.length === 0) return 'ok';
  if (open.some((t) => t.blocksWork && isOverdue(t))) return 'disaster';
  if (open.some((t) => t.blocksWork || isOverdue(t))) return 'high';
  if (open.length >= 2) return 'average';
  return 'warning';
}

// Encuesta de satisfacción (CSAT) — mismo catálogo que responde el empleado
// en MisTickets.jsx (portal), reutilizado aquí para la página de
// Calificaciones (Sistemas solo lee, nunca captura esta respuesta).
export const CSAT_OPTIONS = [
  { value: 'Extremadamente satisfecho', emoji: '🟢', score: 5, color: '#16a34a' },
  { value: 'Mayormente satisfecho', emoji: '🟢', score: 4, color: '#65a30d' },
  { value: 'Ni satisfecho ni insatisfecho', emoji: '🟡', score: 3, color: '#d97706' },
  { value: 'Mayormente insatisfecho', emoji: '🟠', score: 2, color: '#ea580c' },
  { value: 'Extremadamente insatisfecho', emoji: '🔴', score: 1, color: '#dc2626' },
];
