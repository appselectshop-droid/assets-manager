import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useTicketsContext } from './TicketsLayout';
import {
  PRIORITY_ORDER, PRIORITY_CONFIG, SLA_LEVEL_CONFIG, TICKET_TYPE_CONFIG,
} from './ticketShared';

// Matriz de referencia completa (Matriz_SLA_Con_Proveedor.pdf, aportada
// por el usuario 2026-08-04) — pedido explícito: "agrégalo al manual de
// usuario". No existe ningún manual dirigido a Sistemas (los únicos
// manuales del sistema son para el empleado, Mesa de Ayuda/Ventas/
// Constancias) — esta página de SLA ya es el lugar natural donde el
// equipo consulta niveles/prioridades, así que la tabla completa del PDF
// se documenta aquí como referencia, en vez de armar un manual aparte.
// Solo para MOSTRAR — los tiempos que de verdad se aplican al escalar
// viven en Ticket.PROVIDER_SLA_CATALOG (backend) / PROVIDER_SLA_CATALOG
// (ticketShared.js), esto es una copia con TODAS las columnas del
// documento original para que se pueda consultar completo en un solo
// lugar.
const REFERENCE_MATRIX = [
  { nivel: 1, prioridad: 'Baja (P4)',    categoria: 'Cuentas y Accesos',           tResp: '15 min', tResInt: '30 min',   tMaxEscalar: '15 min (Atención directa)',        slaProveedor: 'N/A (Resuelto Internamente)' },
  { nivel: 1, prioridad: 'Baja (P4)',    categoria: 'Ofimática y Archivos',         tResp: '15 min', tResInt: '1 hora',   tMaxEscalar: '30 min (Ticket con proveedor)',     slaProveedor: '24 hrs (Soporte Microsoft / Cloud)' },
  { nivel: 1, prioridad: 'Media (P3)',   categoria: 'Periféricos',                  tResp: '30 min', tResInt: '2 horas',  tMaxEscalar: '45 min (Diagnóstico e informe)',    slaProveedor: '24-48 hrs (Proveedor / Garantía)' },
  { nivel: 2, prioridad: 'Media (P3)',   categoria: 'Software y Sistema Operativo', tResp: '1 hora', tResInt: '8 horas',  tMaxEscalar: '1 hora (Envío a fabricante)',       slaProveedor: '24 hrs (Soporte de Marca / Licencias)' },
  { nivel: 2, prioridad: 'Media (P3)',   categoria: 'Red Local (Usuario)',          tResp: '1 hora', tResInt: '4 horas',  tMaxEscalar: '1 hora (Validación e informe)',     slaProveedor: '12-24 hrs (Proveedor Cableado / Red)' },
  { nivel: 2, prioridad: 'Alta (P2)',    categoria: 'Cuentas Críticas / ERP-SAE',   tResp: '30 min', tResInt: '2 horas',  tMaxEscalar: '30 min (Escalamiento prioritario)', slaProveedor: '4-8 hrs (Soporte Aspel / ERP)' },
  { nivel: 2, prioridad: 'Alta (P2)',    categoria: 'Hardware Local',               tResp: '1 hora', tResInt: '24 horas*', tMaxEscalar: '1 hora (Solicitud de garantía)',  slaProveedor: '24-48 hrs* (Garantía Hardware / Marcas)' },
  { nivel: 3, prioridad: 'Alta (P2)',    categoria: 'Infraestructura Local',        tResp: '30 min', tResInt: '4 horas',  tMaxEscalar: '30 min (Reporte técnico)',          slaProveedor: '8-12 hrs (Proveedor Infraestructura)' },
  { nivel: 3, prioridad: 'Alta (P2)',    categoria: 'Sistemas de CCTV',             tResp: '30 min', tResInt: '4 horas',  tMaxEscalar: '30 min (Diagnóstico inicial)',      slaProveedor: '24-48 hrs (Soporte Fabricante / Dahua)' },
  { nivel: 3, prioridad: 'Crítica (P1)', categoria: 'Servidores y Core',            tResp: '15 min', tResInt: '2 horas',  tMaxEscalar: '15 min (Escalamiento inmediato)',   slaProveedor: '4 hrs (ISP / Enlace Dedicado)' },
  { nivel: 3, prioridad: 'Crítica (P1)', categoria: 'Incidentes de Seguridad',      tResp: '15 min', tResInt: '2 horas',  tMaxEscalar: '15 min (Contención y reporte)',     slaProveedor: '4-8 hrs (Partner Ciberseguridad)' },
];
import styles from './Tickets.module.css';

// Categoría de SLA — pedido explícito del usuario: un solo lugar con
// niveles, prioridades y "criticidad" (bloquea trabajo sí/no, según lo que
// confirmó), más un cumplimiento de tiempos (fecha límite vs. fecha real de
// resolución) exportable a Excel, por si algún día lo pide el auditor.
const COMPLIANCE_CONFIG = {
  cumplido:   { label: 'Cumplido',           color: '#16a34a', bg: '#f0fdf4' },
  incumplido: { label: 'Incumplido',         color: '#dc2626', bg: '#fef2f2' },
  vencido:    { label: 'Vencido (pendiente)', color: '#b91c1c', bg: '#fef2f2' },
  en_tiempo:  { label: 'En tiempo (pendiente)', color: '#2563eb', bg: '#eff6ff' },
};

function complianceStatus(t) {
  if (!t.resolutionDueAt) return null;
  const due = new Date(t.resolutionDueAt);
  if (t.resolvedAt) return new Date(t.resolvedAt) <= due ? 'cumplido' : 'incumplido';
  return new Date() > due ? 'vencido' : 'en_tiempo';
}

function daysDiff(a, b) {
  return Math.round((new Date(a) - new Date(b)) / 86400000);
}

export default function TicketsSLA() {
  const { tickets, loading } = useTicketsContext();

  const byLevel = useMemo(() => (
    [1, 2, 3].map((level) => ({ level, count: tickets.filter((t) => t.slaLevel === level).length }))
  ), [tickets]);

  const byPriority = useMemo(() => (
    PRIORITY_ORDER.map((priority) => ({ priority, count: tickets.filter((t) => (t.priority || 'media') === priority).length }))
  ), [tickets]);

  const byCriticidad = useMemo(() => ([
    { key: 'bloqueante', label: 'Impide trabajar', count: tickets.filter((t) => t.blocksWork).length, color: '#b91c1c' },
    { key: 'normal', label: 'No impide trabajar', count: tickets.filter((t) => !t.blocksWork).length, color: '#16a34a' },
  ]), [tickets]);

  const complianceRows = useMemo(() => (
    tickets
      .filter((t) => t.resolutionDueAt)
      .map((t) => ({ ticket: t, status: complianceStatus(t) }))
      .sort((a, b) => new Date(b.ticket.createdAt) - new Date(a.ticket.createdAt))
  ), [tickets]);

  const complianceSummary = useMemo(() => {
    const finished = complianceRows.filter((r) => r.status === 'cumplido' || r.status === 'incumplido');
    const cumplido = finished.filter((r) => r.status === 'cumplido').length;
    const rate = finished.length ? Math.round((cumplido / finished.length) * 100) : null;
    return { total: complianceRows.length, finished: finished.length, cumplido, rate };
  }, [complianceRows]);

  const handleExport = () => {
    const rows = complianceRows.map(({ ticket: t, status }) => ({
      'Folio': t.folio,
      'Asunto': t.subject,
      'Reportado por': t.employeeName,
      'Tipo': TICKET_TYPE_CONFIG[t.ticketType]?.label || t.ticketType,
      'Categoría SLA': t.slaCategory || '',
      'Nivel': t.slaLevel ? `Nivel ${t.slaLevel}` : '',
      'Prioridad': PRIORITY_CONFIG[t.priority || 'media'].label,
      'Impide trabajar': t.blocksWork ? 'Sí' : 'No',
      'Fecha creación': new Date(t.createdAt).toLocaleString('es-MX'),
      'Fecha límite': new Date(t.resolutionDueAt).toLocaleString('es-MX'),
      'Fecha resolución': t.resolvedAt ? new Date(t.resolvedAt).toLocaleString('es-MX') : '',
      'Cumplimiento': status ? COMPLIANCE_CONFIG[status].label : '',
      'Días de diferencia': t.resolvedAt ? daysDiff(t.resolvedAt, t.resolutionDueAt) : '',
    }));

    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const dataRows = rows.map((r) => headers.map((h) => r[h]));
    const meta = [
      ['CUMPLIMIENTO DE SLA — SISTEMA DE TICKETS'],
      ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
      ['Total tickets con SLA clasificado:', complianceSummary.total],
      ['Tasa de cumplimiento (ya resueltos):', complianceSummary.rate !== null ? `${complianceSummary.rate}%` : 'N/A'],
      [],
      headers,
      ...dataRows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(meta);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length), 12) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Cumplimiento SLA');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `sla_tickets_${date}.xlsx`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>📐</div>
          <div>
            <h1 className={styles.title}>SLA</h1>
            <p className={styles.subtitle}>Niveles de Servicio, prioridades, criticidad y cumplimiento de tiempos.</p>
          </div>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={handleExport} disabled={complianceRows.length === 0}>
          📊 Exportar Excel
        </button>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>📋</span><span className={styles.kpiValue}>{complianceSummary.total}</span></div>
              <p className={styles.kpiLabel}>Con SLA clasificado</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>✅</span><span className={styles.kpiValue}>{complianceSummary.cumplido}</span></div>
              <p className={styles.kpiLabel}>Cumplidos</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#dc2626' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⌛</span><span className={styles.kpiValue}>{complianceSummary.rate !== null ? `${complianceSummary.rate}%` : '—'}</span></div>
              <p className={styles.kpiLabel}>Tasa de cumplimiento</p>
              <p className={styles.kpiSub}>sobre los ya resueltos</p>
            </div>
          </div>

          <div className={styles.panelRow}>
            <div className={styles.panel}>
              <p className={styles.panelTitle}>Por Nivel de Servicio</p>
              {byLevel.every((l) => l.count === 0) ? (
                <p className={styles.empty}>Sin tickets clasificados por SLA</p>
              ) : (
                byLevel.map(({ level, count }) => {
                  const cfg = SLA_LEVEL_CONFIG[level];
                  const max = Math.max(...byLevel.map((l) => l.count), 1);
                  return (
                    <div key={level} className={styles.barItem}>
                      <div className={styles.barHeader}>
                        <span className={styles.barIcon}>{cfg.icon}</span>
                        <span className={styles.barLabel}>{cfg.label}</span>
                        <span className={styles.barCount}>{count}</span>
                      </div>
                      <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / max) * 100}%`, background: cfg.color }} /></div>
                    </div>
                  );
                })
              )}
            </div>

            <div className={styles.panel}>
              <p className={styles.panelTitle}>Por Prioridad</p>
              {byPriority.map(({ priority, count }) => {
                const cfg = PRIORITY_CONFIG[priority];
                const max = Math.max(...byPriority.map((p) => p.count), 1);
                return (
                  <div key={priority} className={styles.barItem}>
                    <div className={styles.barHeader}>
                      <span className={styles.barIcon}>{cfg.icon}</span>
                      <span className={styles.barLabel}>{cfg.label}</span>
                      <span className={styles.barCount}>{count}</span>
                    </div>
                    <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / max) * 100}%`, background: cfg.color }} /></div>
                  </div>
                );
              })}
            </div>

            <div className={styles.panel}>
              <p className={styles.panelTitle}>Por Criticidad</p>
              {byCriticidad.map(({ key, label, count, color }) => {
                const max = Math.max(...byCriticidad.map((c) => c.count), 1);
                return (
                  <div key={key} className={styles.barItem}>
                    <div className={styles.barHeader}>
                      <span className={styles.barLabel}>{label}</span>
                      <span className={styles.barCount}>{count}</span>
                    </div>
                    <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / max) * 100}%`, background: color }} /></div>
                  </div>
                );
              })}
            </div>
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.zabbixTable}>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Categoría SLA</th>
                  <th>Nivel</th>
                  <th>Prioridad</th>
                  <th>Fecha límite</th>
                  <th>Cumplimiento</th>
                </tr>
              </thead>
              <tbody>
                {complianceRows.length === 0 && (
                  <tr><td colSpan={6} className={styles.empty}>Ningún ticket tiene todavía una categoría de Falla (SLA) clasificada</td></tr>
                )}
                {complianceRows.map(({ ticket: t, status }) => (
                  <tr key={t._id}>
                    <td><strong>{t.folio}</strong></td>
                    <td>{t.slaCategory || '—'}</td>
                    <td>{t.slaLevel ? SLA_LEVEL_CONFIG[t.slaLevel].label : '—'}</td>
                    <td>{PRIORITY_CONFIG[t.priority || 'media'].label}</td>
                    <td className={styles.muted}>{new Date(t.resolutionDueAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' })}</td>
                    <td>
                      {status && (
                        <span className={styles.statusBadge} style={{ color: COMPLIANCE_CONFIG[status].color, background: COMPLIANCE_CONFIG[status].bg }}>
                          {COMPLIANCE_CONFIG[status].label}
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className={styles.panel} style={{ marginTop: '1.5rem' }}>
            <p className={styles.panelTitle}>Matriz de Niveles de Servicio — Referencia completa</p>
            <p className={styles.muted} style={{ marginBottom: '0.75rem' }}>
              Tiempos de respuesta y resolución internos, más el SLA aplicable una vez escalado a un Proveedor externo.
              Al escalar un ticket clasificado a Proveedor, el SLA interno se congela y se activa el tiempo de resolución del proveedor.
            </p>
            <div className={styles.tableWrap}>
              <table className={styles.zabbixTable}>
                <thead>
                  <tr>
                    <th>Nivel</th>
                    <th>Prioridad</th>
                    <th>Categoría de Falla</th>
                    <th>T. Respuesta</th>
                    <th>T. Resolución (interno)</th>
                    <th>T. Máx. para Escalar</th>
                    <th>SLA con Proveedor</th>
                  </tr>
                </thead>
                <tbody>
                  {REFERENCE_MATRIX.map((row) => (
                    <tr key={row.categoria}>
                      <td>{row.nivel}</td>
                      <td>{row.prioridad}</td>
                      <td>{row.categoria}</td>
                      <td className={styles.muted}>{row.tResp}</td>
                      <td className={styles.muted}>{row.tResInt}</td>
                      <td className={styles.muted}>{row.tMaxEscalar}</td>
                      <td>{row.slaProveedor}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <p className={styles.muted} style={{ marginTop: '0.5rem', fontSize: '0.8rem' }}>
              * Hardware Local: el tiempo de garantía depende de la marca y puede extenderse según el proveedor.
            </p>
          </div>
        </>
      )}
    </div>
  );
}
