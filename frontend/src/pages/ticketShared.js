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

// Si ya se clasificó por SLA, "vencido" es real (pasó resolutionDueAt). Si
// todavía no se clasifica, se usa la heurística de siempre (no es un SLA
// formal, es un umbral fijo para llamar la atención mientras se triagea:
// bloqueante no debería tardar más de 1 día, uno normal no más de 5). Solo
// aplica mientras sigue abierto/en proceso — uno ya resuelto no "vence".
export function isOverdue(ticket) {
  if (!['abierto', 'en_proceso'].includes(ticket.status)) return false;
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
