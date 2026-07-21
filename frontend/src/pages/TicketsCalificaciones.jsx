import { useMemo } from 'react';
import * as XLSX from 'xlsx';
import { useTicketsContext } from './TicketsLayout';
import { CSAT_OPTIONS, TICKET_TYPE_CONFIG } from './ticketShared';
import styles from './Tickets.module.css';

// "Calificaciones" — pedido explícito del usuario (pensando en que el
// director de Finanzas lo pida): un solo lugar con la encuesta de
// satisfacción (CSAT) que responde quien reportó el ticket, exportable a
// Excel. Es de solo lectura — la respuesta se captura del lado del
// empleado (ver MisTickets.jsx), aquí solo se consulta.
export default function TicketsCalificaciones() {
  const { tickets, loading } = useTicketsContext();

  const rated = useMemo(() => (
    tickets
      .filter((t) => t.satisfactionRating)
      .sort((a, b) => new Date(b.resolvedAt || b.createdAt) - new Date(a.resolvedAt || a.createdAt))
  ), [tickets]);

  const summary = useMemo(() => (
    CSAT_OPTIONS.map((opt) => ({ ...opt, count: rated.filter((t) => t.satisfactionRating === opt.value).length }))
  ), [rated]);

  const avgScore = useMemo(() => {
    if (rated.length === 0) return null;
    const total = rated.reduce((sum, t) => {
      const opt = CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating);
      return sum + (opt?.score || 0);
    }, 0);
    return (total / rated.length).toFixed(1);
  }, [rated]);

  const handleExport = () => {
    const rows = rated.map((t) => {
      const opt = CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating);
      return {
        'Folio': t.folio,
        'Asunto': t.subject,
        'Reportado por': t.employeeName,
        'Tipo': TICKET_TYPE_CONFIG[t.ticketType]?.label || t.ticketType,
        'Calificación': t.satisfactionRating,
        'Puntaje (1-5)': opt?.score || '',
        'Atendido por': t.resolvedByName || '',
        'Fecha de resolución': t.resolvedAt ? new Date(t.resolvedAt).toLocaleString('es-MX') : '',
      };
    });

    if (rows.length === 0) return;
    const headers = Object.keys(rows[0]);
    const dataRows = rows.map((r) => headers.map((h) => r[h]));
    const meta = [
      ['CALIFICACIONES DE SATISFACCIÓN (CSAT) — SISTEMA DE TICKETS'],
      ['Fecha de exportación:', new Date().toLocaleDateString('es-MX', { dateStyle: 'long' })],
      ['Total de tickets calificados:', rated.length],
      ['Promedio (escala 1-5):', avgScore ?? 'N/A'],
      [],
      headers,
      ...dataRows,
    ];
    const ws = XLSX.utils.aoa_to_sheet(meta);
    ws['!cols'] = headers.map((h) => ({ wch: Math.max(h.length, ...rows.map((r) => String(r[h] ?? '').length), 12) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Calificaciones');
    const date = new Date().toISOString().slice(0, 10);
    XLSX.writeFile(wb, `calificaciones_tickets_${date}.xlsx`);
  };

  return (
    <div className={styles.page}>
      <div className={styles.header}>
        <div className={styles.headerLeft}>
          <div className={styles.headerIcon}>⭐</div>
          <div>
            <h1 className={styles.title}>Calificaciones</h1>
            <p className={styles.subtitle}>Encuesta de satisfacción (CSAT) que responde quien reportó el ticket.</p>
          </div>
        </div>
        <button type="button" className={styles.btnPrimary} onClick={handleExport} disabled={rated.length === 0}>
          📊 Exportar Excel
        </button>
      </div>

      {loading ? (
        <p className={styles.empty}>Cargando...</p>
      ) : (
        <>
          <div className={styles.kpiRow}>
            <div className={styles.kpi} style={{ '--accent': '#0d9488' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>⭐</span><span className={styles.kpiValue}>{rated.length}</span></div>
              <p className={styles.kpiLabel}>Tickets calificados</p>
            </div>
            <div className={styles.kpi} style={{ '--accent': '#16a34a' }}>
              <div className={styles.kpiTop}><span className={styles.kpiIcon}>📈</span><span className={styles.kpiValue}>{avgScore ?? '—'}</span></div>
              <p className={styles.kpiLabel}>Promedio</p>
              <p className={styles.kpiSub}>escala 1 a 5</p>
            </div>
          </div>

          <div className={styles.panel}>
            <p className={styles.panelTitle}>Distribución de respuestas</p>
            {rated.length === 0 ? (
              <p className={styles.empty}>Todavía nadie ha respondido la encuesta de satisfacción</p>
            ) : (
              summary.map(({ value, emoji, count, color }) => {
                const max = Math.max(...summary.map((s) => s.count), 1);
                return (
                  <div key={value} className={styles.barItem}>
                    <div className={styles.barHeader}>
                      <span className={styles.barIcon}>{emoji}</span>
                      <span className={styles.barLabel}>{value}</span>
                      <span className={styles.barCount}>{count}</span>
                    </div>
                    <div className={styles.barTrack}><div className={styles.barFill} style={{ width: `${(count / max) * 100}%`, background: color }} /></div>
                  </div>
                );
              })
            )}
          </div>

          <div className={styles.tableWrap}>
            <table className={styles.zabbixTable}>
              <thead>
                <tr>
                  <th>Folio</th>
                  <th>Asunto</th>
                  <th>Reportado por</th>
                  <th>Calificación</th>
                  <th>Atendido por</th>
                  <th>Fecha de resolución</th>
                </tr>
              </thead>
              <tbody>
                {rated.length === 0 && (
                  <tr><td colSpan={6} className={styles.empty}>Todavía no hay tickets calificados</td></tr>
                )}
                {rated.map((t) => {
                  const opt = CSAT_OPTIONS.find((o) => o.value === t.satisfactionRating);
                  return (
                    <tr key={t._id}>
                      <td><strong>{t.folio}</strong></td>
                      <td>{t.subject}</td>
                      <td>{t.employeeName}</td>
                      <td>{opt?.emoji} {t.satisfactionRating}</td>
                      <td>{t.resolvedByName || '—'}</td>
                      <td className={styles.muted}>{t.resolvedAt ? new Date(t.resolvedAt).toLocaleDateString('es-MX', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
